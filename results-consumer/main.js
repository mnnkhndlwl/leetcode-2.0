import "dotenv/config";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

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
 * Process a single judge result.
 * @param {JudgeResult} result
 */
async function handleResult(result) {
  console.log(
    `[${result.submissionId}] ${result.status} — ${result.passedCount}/${result.totalCount} passed — ${result.runtimeMs}ms`
  );
  // TODO: write result to DB, push to WebSocket, etc.
}

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
        // leave in queue — bad messages will hit the DLQ after max receives
        continue;
      }

      try {
        await handleResult(result);

        // only delete after successful processing
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
