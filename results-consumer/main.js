import "dotenv/config";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { submissions } from "./schema.js";
import { updateContestScore } from "./updateContestScore.js";
import { startContestLifecycleSweep } from "./contestLifecycle.js";

// Redis publisher — used to notify the ws-server that a verdict is ready.
// This is best-effort: the DB write is the source of truth. If Redis is down
// the client falls back to the already-judged path in the ws-server (DB query).
const redis = new Redis(process.env.REDIS_URL);
redis.on("error", (err) =>
  console.error("[redis] connection error:", err.message),
);

const sqs = new SQSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const QUEUE_URL = process.env.SQS_RESULT_QUEUE_URL;

// How long a received result stays invisible to other consumers while this one
// writes it to the DB. Must comfortably exceed the DB round-trip; on handler
// error we deliberately leave the message in the queue, so this is also the
// retry delay before SQS redelivers (and eventually routes it to the DLQ).
const VISIBILITY_TIMEOUT_SECONDS = Number(
  process.env.VISIBILITY_TIMEOUT_SECONDS ?? 60,
);

/**
 * @typedef {Object} TestCaseResult
 * @property {number} id
 * @property {boolean} passed
 * @property {number} runtimeMs
 */

/**
 * @typedef {Object} JudgeResult
 * @property {string} submissionId
 * @property {"ACCEPTED"|"WRONG_ANSWER"|"TIME_LIMIT_EXCEEDED"|"MEMORY_LIMIT_EXCEEDED"|"RUNTIME_ERROR"} status
 * @property {number} passedCount
 * @property {number} totalCount
 * @property {number} runtimeMs
 * @property {number} memoryUsedMb
 * @property {TestCaseResult[]} testCaseResults
 * @property {string} [compileError]
 */

/**
 * Write a judge result back to the database.
 *
 * This function does a single UPDATE on submissions.
 * The DB trigger `trg_submission_judged` automatically handles:
 *   - problems.totalSubmissions / totalAccepted counters
 *   - userProblemStatus upsert (SOLVED/ATTEMPTED, never downgrade)
 *
 * @param {JudgeResult} result
 */
async function handleResult(result) {
  // Idempotency guard — SQS delivers at-least-once, so check current status first.
  // If it's already a final verdict, a previous delivery already processed this message.
  const [submission] = await db
    .select({
      status: submissions.status,
      contestId: submissions.contestId,
      problemId: submissions.problemId,
      userId: submissions.userId,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(eq(submissions.id, result.submissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`Submission not found: ${result.submissionId}`);
  }

  if (submission.status !== "PENDING" && submission.status !== "RUNNING") {
    console.log(
      `[${result.submissionId}] already processed (status=${submission.status}), skipping`,
    );
    return;
  }

  // Single UPDATE — the DB trigger fires here and handles everything else atomically
  await db
    .update(submissions)
    .set({
      status: result.status,
      runtimeMs: result.runtimeMs,
      memoryUsedMb: result.memoryUsedMb,
      compileError: result.compileError ?? null,
      testCaseResults: result.testCaseResults,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, result.submissionId));

  console.log(
    `[${result.submissionId}] ${result.status} — ${result.passedCount}/${result.totalCount} passed — ${result.runtimeMs}ms`,
  );

  // Publish to Redis so the ws-server can push the verdict to the connected client.
  // Wrapped in try/catch so a Redis outage never prevents the SQS message from
  // being deleted — the DB write already succeeded and the ws-server has a
  // DB fallback for clients that connect after the verdict lands.
  try {
    await redis.publish(
      `submission:${result.submissionId}`,
      JSON.stringify({
        submissionId: result.submissionId,
        status: result.status,
        runtimeMs: result.runtimeMs,
        memoryUsedMb: result.memoryUsedMb,
        compileError: result.compileError ?? null,
        testCaseResults: result.testCaseResults,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
      }),
    );

    if (submission.contestId) {
      await updateContestScore(
        {
          contestId: submission.contestId,
          problemId: submission.problemId,
          userId: submission.userId,
          createdAt: submission.createdAt,
          status: result.status,
        },
        redis,
      );
    }
  } catch (err) {
    console.error(
      `[redis] failed to publish verdict for ${result.submissionId}:`,
      err.message,
    );
  }
}

// ── SQS poll loop ────────────────────────────────────────────────────────────

async function poll() {
  console.log("Result consumer started. Polling", QUEUE_URL);

  while (true) {
    let Messages = [];
    try {
      ({ Messages = [] } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // long-poll — cheaper than hammering SQS
          VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
        }),
      ));
    } catch (err) {
      // Transient receive failure (throttling, network). Back off and retry
      // instead of crashing the consumer.
      console.error("sqs receive error:", err.message);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    for (const msg of Messages) {
      let result;

      try {
        result = JSON.parse(msg.Body);
      } catch (err) {
        console.error("Failed to parse message body:", err.message);
        // leave in queue — malformed messages will hit the DLQ after max receives
        continue;
      }

      try {
        await handleResult(result);

        // only delete AFTER successful DB write
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle,
          }),
        );
      } catch (err) {
        console.error(`[${result?.submissionId}] handler error:`, err.message);
        // leave in queue — visibility timeout expires → redelivered automatically
      }
    }
  }
}

startContestLifecycleSweep();

poll().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
