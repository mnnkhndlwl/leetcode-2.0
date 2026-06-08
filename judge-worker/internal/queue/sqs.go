package queue

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/leetcode-2.0/judge/internal/config"
	"github.com/leetcode-2.0/judge/internal/models"
)

type SQSClient struct {
	client            *sqs.Client
	submissionQueue   string
	resultQueue       string
	visibilityTimeout int32
}

func New(cfg *config.Config) *SQSClient {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.AWSRegion),
	)
	if err != nil {
		panic("failed to load AWS config: " + err.Error())
	}
	return &SQSClient{
		client:            sqs.NewFromConfig(awsCfg),
		submissionQueue:   cfg.SubmissionQueueURL,
		resultQueue:       cfg.ResultQueueURL,
		visibilityTimeout: int32(cfg.VisibilityTimeout.Seconds()),
	}
}

// Poll receives submissions and dispatches them to handler with at most
// maxConcurrent jobs running at once.
//
// Resilience contract:
//   - A message is deleted ONLY after handler returns nil (i.e. it was judged
//     AND the result was published). If handler returns an error, or the worker
//     crashes mid-judge, the message is left untouched: SQS makes it visible
//     again once the visibility timeout lapses, and after maxReceiveCount
//     redeliveries the queue's redrive policy routes it to the DLQ.
//   - Each receive sets VisibilityTimeout so the message stays hidden for the
//     full worst-case judge duration; this must be configured large enough that
//     an in-progress job is never redelivered to a second worker.
//   - Poison messages (unparseable bodies) are left in place so they too age
//     into the DLQ instead of being silently dropped.
func (q *SQSClient) Poll(ctx context.Context, maxConcurrent int, handler func(models.SubmissionMessage) error) {
	sem := make(chan struct{}, maxConcurrent)

	for {
		out, err := q.client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(q.submissionQueue),
			MaxNumberOfMessages: 1,
			WaitTimeSeconds:     20,
			VisibilityTimeout:   q.visibilityTimeout,
		})
		if err != nil {
			// Back off briefly so a persistent failure (throttling, network)
			// doesn't spin the CPU in a tight error loop.
			log.Printf("sqs receive error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		for _, msg := range out.Messages {
			var submission models.SubmissionMessage
			if err := json.Unmarshal([]byte(aws.ToString(msg.Body)), &submission); err != nil {
				// Poison message — leave it so it ages into the DLQ rather than
				// vanishing. Do NOT delete.
				log.Printf("failed to unmarshal message %s: %v — leaving for DLQ", aws.ToString(msg.MessageId), err)
				continue
			}

			sem <- struct{}{} // acquire slot (blocks the receive loop while full)
			go func(msg sqstypes.Message, submission models.SubmissionMessage) {
				defer func() { <-sem }() // release slot when done

				if err := handler(submission); err != nil {
					// Processing failed (transient infra error or publish failure).
					// Leave the message in the queue: it becomes visible again
					// after the visibility timeout and is retried, then DLQ'd.
					log.Printf("handler failed for submission %s: %v — leaving for retry/DLQ", submission.SubmissionID, err)
					return
				}

				// Success — only now is it safe to delete.
				if _, delErr := q.client.DeleteMessage(ctx, &sqs.DeleteMessageInput{
					QueueUrl:      aws.String(q.submissionQueue),
					ReceiptHandle: msg.ReceiptHandle,
				}); delErr != nil {
					// Couldn't delete a successfully-judged message. The result was
					// already published; the result consumer is idempotent, so a
					// redelivery is harmless (re-judged, same verdict, deduped).
					log.Printf("failed to delete message %s: %v", aws.ToString(msg.MessageId), delErr)
				}
			}(msg, submission)
		}
	}
}

func (q *SQSClient) PublishResult(result models.JudgeResult) error {
	body, err := json.Marshal(result)
	if err != nil {
		return err
	}

	input := &sqs.SendMessageInput{
		QueueUrl:    aws.String(q.resultQueue),
		MessageBody: aws.String(string(body)),
	}

	// FIFO queues require MessageGroupId.
	// Use the submissionId as both group and deduplication key — each submission
	// produces exactly one result so this prevents accidental duplicate writes.
	if strings.HasSuffix(q.resultQueue, ".fifo") {
		input.MessageGroupId = aws.String(result.SubmissionID)
		input.MessageDeduplicationId = aws.String(result.SubmissionID)
	}

	_, err = q.client.SendMessage(context.Background(), input)
	return err
}
