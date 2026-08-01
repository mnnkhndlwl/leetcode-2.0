import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

/**
 * @typedef {import("./judge.js").SubmissionMessage} SubmissionMessage
 * @typedef {import("./judge.js").JudgeResult} JudgeResult
 */

export class Queue {
  /**
   * @param {import("./config.js").Config} cfg
   */
  constructor(cfg) {
    this.client = new SQSClient({ region: cfg.awsRegion });
    this.submissionQueue = cfg.submissionQueueURL;
    this.resultQueue = cfg.resultQueueURL;
    this.visibilityTimeout = cfg.visibilityTimeoutSeconds;
    this.pollWaitSeconds = cfg.pollWaitSeconds;
  }

  /**
   * Poll submissions and dispatch them to handler with at most maxConcurrent
   * jobs running at once.
   *
   * Resilience contract:
   * - A message is deleted ONLY after handler resolves successfully (judged
   *   AND result published). On rejection the message is left untouched so SQS
   *   redelivers after visibility timeout, then routes to the DLQ.
   * - Poison (unparseable) messages are left in place so they age into the DLQ.
   *
   * @param {number} maxConcurrent
   * @param {(msg: SubmissionMessage) => Promise<void>} handler
   */
  async poll(maxConcurrent, handler) {
    /** @type {Promise<void>[]} */
    const inFlight = [];

    while (true) {
      // Cap concurrency: wait until a slot frees before receiving more work.
      while (inFlight.length >= maxConcurrent) {
        await Promise.race(inFlight);
      }

      let Messages = [];
      try {
        ({ Messages = [] } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.submissionQueue,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: this.pollWaitSeconds,
            VisibilityTimeout: this.visibilityTimeout,
          })
        ));
      } catch (err) {
        console.error("sqs receive error:", err.message);
        await sleep(2000);
        continue;
      }

      for (const msg of Messages) {
        /** @type {SubmissionMessage} */
        let submission;
        try {
          submission = JSON.parse(msg.Body);
        } catch (err) {
          console.error(
            `failed to unmarshal message ${msg.MessageId}: ${err.message} — leaving for DLQ`
          );
          continue;
        }

        const job = (async () => {
          try {
            await handler(submission);

            try {
              await this.client.send(
                new DeleteMessageCommand({
                  QueueUrl: this.submissionQueue,
                  ReceiptHandle: msg.ReceiptHandle,
                })
              );
            } catch (delErr) {
              // Result already published; result consumer is idempotent.
              console.error(
                `failed to delete message ${msg.MessageId}:`,
                delErr.message
              );
            }
          } catch (err) {
            console.error(
              `handler failed for submission ${submission.submissionId}: ${err.message} — leaving for retry/DLQ`
            );
          }
        })();

        inFlight.push(job);
        job.finally(() => {
          const idx = inFlight.indexOf(job);
          if (idx !== -1) inFlight.splice(idx, 1);
        });
      }
    }
  }

  /** @param {JudgeResult} result */
  async publishResult(result) {
    /** @type {import("@aws-sdk/client-sqs").SendMessageCommandInput} */
    const input = {
      QueueUrl: this.resultQueue,
      MessageBody: JSON.stringify(result),
    };

    // FIFO queues require MessageGroupId. Use submissionId as both group and
    // deduplication key — each submission produces exactly one result.
    if (this.resultQueue.endsWith(".fifo")) {
      input.MessageGroupId = result.submissionId;
      input.MessageDeduplicationId = result.submissionId;
    }

    await this.client.send(new SendMessageCommand(input));
  }
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
