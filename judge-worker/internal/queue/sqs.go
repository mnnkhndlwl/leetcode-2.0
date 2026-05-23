package queue



// Pseudocode — understand the pattern first
func (q *SQSClient) Poll(ctx context.Context, handler func(SubmissionMessage) error) {
    for {
        // 1. long-poll: wait up to 20s for messages (cheaper than hammering SQS)
        messages := sqs.ReceiveMessage(waitTimeSeconds=20, maxMessages=1)

        for _, msg := range messages {
            // 2. process — handler does the judging
            err := handler(msg)

            if err == nil {
                // 3. only delete AFTER successful processing
                sqs.DeleteMessage(msg.ReceiptHandle)
            }
            // if err != nil — message stays in queue, visibility timeout
            // expires, another worker picks it up (automatic retry)
        }
    }
}