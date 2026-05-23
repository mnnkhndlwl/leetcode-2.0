import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function publishToQueue(queueUrl, payload, deduplicationId) {
  const isFifo = queueUrl.endsWith(".fifo");

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
    ...(isFifo && {
      MessageGroupId: payload.userId,          // one group per user — preserves per-user order
      MessageDeduplicationId: deduplicationId, // submissionId — prevents accidental duplicates
    }),
  });

  return sqs.send(command);
}
