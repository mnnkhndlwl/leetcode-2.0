package queue

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/leetcode-2.0/judge/internal/config"
	"github.com/leetcode-2.0/judge/internal/models"
)

type SQSClient struct {
	client          *sqs.Client
	submissionQueue string
	resultQueue     string
}

func New(cfg *config.Config) *SQSClient {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.AWSRegion),
	)
	if err != nil {
		panic("failed to load AWS config: " + err.Error())
	}
	return &SQSClient{
		client:          sqs.NewFromConfig(awsCfg),
		submissionQueue: cfg.SubmissionQueueURL,
		resultQueue:     cfg.ResultQueueURL,
	}
}

func (q *SQSClient) Poll(ctx context.Context, handler func(models.SubmissionMessage) error) {
	for {
		out, err := q.client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(q.submissionQueue),
			MaxNumberOfMessages: 1,
			WaitTimeSeconds:     20,
		})
		if err != nil {
			log.Printf("sqs receive error: %v", err)
			continue
		}

		for _, msg := range out.Messages {
			var submission models.SubmissionMessage
			if err := json.Unmarshal([]byte(aws.ToString(msg.Body)), &submission); err != nil {
				log.Printf("failed to unmarshal message: %v", err)
				continue
			}

			if err := handler(submission); err == nil {
				_, delErr := q.client.DeleteMessage(ctx, &sqs.DeleteMessageInput{
					QueueUrl:      aws.String(q.submissionQueue),
					ReceiptHandle: msg.ReceiptHandle,
				})
				if delErr != nil {
					log.Printf("failed to delete message %s: %v", aws.ToString(msg.MessageId), delErr)
				}
			}
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
