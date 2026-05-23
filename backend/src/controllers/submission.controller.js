import { db } from "../db/index.js";
import { problems, submissions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { publishToQueue } from "../utils/sqs.js";
import { HTTP } from "../constants/http.js";
import { SUBMISSION_STATUS } from "../constants/submission.js";

export const submitCode = async (req, res) => {
  const { id: userId } = req.user;
  const { problemId, language, code } = req.body;

  // 1. Verify the problem exists and is public — also grab limits and test case key
  const [problem] = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      timeLimitMs: problems.timeLimitMs,
      memoryLimitMb: problems.memoryLimitMb,
      testCasesFileUrl: problems.testCasesFileUrl,
      visibility: problems.visibility,
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

  // 2. Create a PENDING submission record in the DB
  const [submission] = await db
    .insert(submissions)
    .values({
      problemId,
      userId,
      code,
      language,
      status: SUBMISSION_STATUS.PENDING,
    })
    .returning({ id: submissions.id });

  // 3. Publish to SQS — code travels inline (competitive code is tiny, well under 256KB limit)
  await publishToQueue(
    process.env.SQS_SUBMISSION_QUEUE_URL,
    {
      submissionId: submission.id,
      problemId: problem.id,
      problemSlug: problem.slug,
      userId,
      language,
      code,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      testCasesS3Key: problem.testCasesFileUrl,
    },
    submission.id, // deduplication ID for FIFO queues
  );

  // 4. Return 202 — client now polls or listens on WebSocket for the verdict
  return res.status(HTTP.CREATED).json({
    submissionId: submission.id,
    status: SUBMISSION_STATUS.PENDING,
  });
};
