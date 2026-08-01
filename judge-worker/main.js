import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";
import { Judge } from "./judge.js";
import { Queue } from "./queue.js";
import { TestCasesS3 } from "./s3.js";

async function main() {
  const cfg = loadConfig();

  const sqs = new Queue(cfg);
  const s3 = new TestCasesS3(cfg);
  const judger = new Judge(s3, cfg.imageRegistry);

  // Health server — ECS needs this to know the task is alive
  startHealthServer(":8080");

  console.log(
    `Judge worker started. Polling ${cfg.submissionQueueURL} (maxConcurrent=${cfg.maxConcurrentJobs})`
  );

  // Poll owns the concurrency limit and only deletes a message after this
  // handler resolves. Rejecting keeps the message in the queue so it is
  // retried and eventually routed to the DLQ — see Queue.poll.
  await sqs.poll(cfg.maxConcurrentJobs, async (msg) => {
    let result;
    try {
      result = await judger.run(msg);
    } catch (err) {
      // Transient infra failure (e.g. S3, disk) — not a verdict. Retry.
      throw new Error(`judge failed for submission ${msg.submissionId}: ${err.message}`);
    }

    try {
      await sqs.publishResult(result);
    } catch (err) {
      // We have a verdict but couldn't hand it off. Don't delete — retry so
      // the verdict isn't lost. The result consumer is idempotent.
      throw new Error(
        `failed to publish result for submission ${msg.submissionId}: ${err.message}`
      );
    }
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
