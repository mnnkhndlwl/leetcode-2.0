import { createHash } from "node:crypto";
import { db } from "../db/index.js";
import { contest, contestProblems, problems, submissions } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { publishToQueue } from "../utils/sqs.js";
import { HTTP } from "../constants/http.js";
import { SUBMISSION_STATUS } from "../constants/submission.js";

// Postgres unique-constraint violation — the durable backstop for idempotency
// when two retries race past the initial lookup.
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err) {
  return err?.code === PG_UNIQUE_VIOLATION || err?.cause?.code === PG_UNIQUE_VIOLATION;
}

// Fingerprint of the request a key represents, so reusing a key with different
// code can be detected and rejected.
function hashRequest({ problemId, language, code, contestId }) {
  return createHash("sha256")
    .update(JSON.stringify({ problemId, language, code, contestId: contestId ?? null }))
    .digest("hex");
}

// Verifies the problem actually belongs to the contest and the submission
// window (raw timestamps, not the `status` label — which only updates on the
// results-consumer's 60s sweep) is currently open.
async function assertContestSubmissionAllowed(contestId, problemId) {
  const [row] = await db
    .select({
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      contestProblemId: contestProblems.problemId,
    })
    .from(contest)
    .leftJoin(
      contestProblems,
      and(
        eq(contestProblems.contestId, contest.id),
        eq(contestProblems.problemId, problemId),
      ),
    )
    .where(eq(contest.id, contestId))
    .limit(1);

  if (!row) {
    return "Contest not found";
  }
  if (!row.contestProblemId) {
    return "This problem is not part of that contest";
  }
  const now = new Date();
  if (now < row.startsAt || now > row.endsAt) {
    return "Submissions are only accepted while the contest is running";
  }
  return null;
}

async function findByIdempotencyKey(userId, key) {
  const [row] = await db
    .select({
      id: submissions.id,
      status: submissions.status,
      requestHash: submissions.requestHash,
    })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.idempotencyKey, key)))
    .limit(1);
  return row;
}

export const submitCode = async (req, res) => {
  const { id: userId } = req.user;
  const { problemId, language, code, contestId = null } = req.body;
  const idempotencyKey = req.idempotencyKey ?? null;
  const requestHash = hashRequest({ problemId, language, code, contestId });

  if (contestId) {
    const contestError = await assertContestSubmissionAllowed(contestId, problemId);
    if (contestError) {
      return res.status(HTTP.FORBIDDEN).json({ error: contestError });
    }
  }

  // 1. Verify the problem exists and is public — also grab limits and test case key
  const [problem] = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      timeLimitMs: problems.timeLimitMs,
      memoryLimitMb: problems.memoryLimitMb,
      testCasesFileUrl: problems.testCasesFileUrl,
      visibility: problems.visibility,
      driverCode: problems.driverCode,
    })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!problem) {
    return res.status(HTTP.NOT_FOUND).json({ error: "Problem not found" });
  }

  if (problem.visibility !== "PUBLIC") {
    return res.status(HTTP.FORBIDDEN).json({ error: "Problem is not publicly available" });
  }

  if (!problem.testCasesFileUrl) {
    return res.status(HTTP.INTERNAL).json({ error: "Problem has no test cases configured" });
  }

  // Combine user function with hidden driver code (function-only mode). Needed
  // both for the first enqueue and for self-healing re-enqueues.
  const driver = problem.driverCode?.[language];
  const codeToRun = driver ? `${code}\n\n${driver}` : code;

  const enqueue = (submissionId) =>
    publishToQueue(
      process.env.SQS_SUBMISSION_QUEUE_URL,
      {
        submissionId,
        problemId: problem.id,
        problemSlug: problem.slug,
        userId,
        language,
        code: codeToRun,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        testCasesS3Key: problem.testCasesFileUrl,
      },
      submissionId, // deduplication ID for FIFO queues
    );

  // Handles a key we've seen before: reject key reuse with different code,
  // self-heal stuck-PENDING submissions, then return the original (200).
  const respondReplay = async (existing) => {
    // Same key, different request body → caller bug; refuse to overwrite.
    if (existing.requestHash && existing.requestHash !== requestHash) {
      return res.status(HTTP.CONFLICT).json({
        error:
          "Idempotency-Key was already used with a different request body",
      });
    }

    // Insert succeeded earlier but the enqueue may have failed → re-enqueue.
    // FIFO dedup on submissionId makes a redundant re-send harmless.
    if (existing.status === SUBMISSION_STATUS.PENDING) {
      await enqueue(existing.id);
    }

    return res.status(HTTP.OK).json({
      submissionId: existing.id,
      status: existing.status,
      idempotent: true,
    });
  };

  // 2. Idempotent replay — if we've already accepted this key, return the original.
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return respondReplay(existing);
  }

  // 3. Create a PENDING submission record. The unique (userId, idempotencyKey)
  //    index is the race-safe backstop: if a concurrent retry inserted first,
  //    the insert throws 23505 and we return that original submission instead.
  let submission;
  try {
    [submission] = await db
      .insert(submissions)
      .values({
        problemId,
        userId,
        code,
        language,
        idempotencyKey,
        requestHash,
        status: SUBMISSION_STATUS.PENDING,
        contestId,
      })
      .returning({ id: submissions.id });
  } catch (err) {
    if (idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return respondReplay(existing);
    }
    throw err;
  }

  // 4. Publish to SQS — only ever reached by the first writer, so each
  //    submission is enqueued exactly once. Code travels inline (competitive
  //    code is tiny, well under the 256KB limit).
  await enqueue(submission.id);

  // 5. Return 201 — brand-new work started; client listens for the verdict.
  return res.status(HTTP.CREATED).json({
    submissionId: submission.id,
    status: SUBMISSION_STATUS.PENDING,
  });
};

export const getSubmission = async (req, res) => {
  const { id: userId } = req.user;
  const { id } = req.params;

  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, id))
    .limit(1);

  if (!submission) {
    return res.status(HTTP.NOT_FOUND).json({ error: "Submission not found" });
  }

  if (submission.userId !== userId) {
    return res.status(HTTP.FORBIDDEN).json({ error: "Access denied" });
  }

  return res.status(HTTP.OK).json(submission);
};
