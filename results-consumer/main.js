import "dotenv/config";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { submissions } from "./schema.js";

const sqs = new SQSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const QUEUE_URL = process.env.SQS_RESULT_QUEUE_URL;

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
    .select({ status: submissions.status })
    .from(submissions)
    .where(eq(submissions.id, result.submissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`Submission not found: ${result.submissionId}`);
  }

  if (submission.status !== "PENDING" && submission.status !== "RUNNING") {
    console.log(
      `[${result.submissionId}] already processed (status=${submission.status}), skipping`
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
    `[${result.submissionId}] ${result.status} — ${result.passedCount}/${result.totalCount} passed — ${result.runtimeMs}ms`
  );
}

// ── SQS poll loop ────────────────────────────────────────────────────────────

async function poll() {
  console.log("Result consumer started. Polling", QUEUE_URL);

  while (true) {
    const { Messages = [] } = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20, // long-poll — cheaper than hammering SQS
      })
    );

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
          })
        );
      } catch (err) {
        console.error(`[${result?.submissionId}] handler error:`, err.message);
        // leave in queue — visibility timeout expires → redelivered automatically
      }
    }
  }
}

poll().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
