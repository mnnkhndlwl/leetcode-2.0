package main

import (
	"context"
	"fmt"
	"log"

	"github.com/leetcode-2.0/judge/internal/config"
	"github.com/leetcode-2.0/judge/internal/health"
	"github.com/leetcode-2.0/judge/internal/judge"
	"github.com/leetcode-2.0/judge/internal/models"
	"github.com/leetcode-2.0/judge/internal/queue"
	s3client "github.com/leetcode-2.0/judge/internal/s3"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	sqsClient := queue.New(cfg)
	s3 := s3client.New(cfg)
	cache := judge.NewCache()
	judger := judge.New(s3, cache, cfg.ImageRegistry)

	// Health server — ECS needs this to know the task is alive
	go health.StartServer(":8080")

	ctx := context.Background()

	// Poll owns the concurrency limit and only deletes a message after this
	// handler returns nil. Returning an error keeps the message in the queue so
	// it is retried and eventually routed to the DLQ — see queue.Poll.
	sqsClient.Poll(ctx, cfg.MaxConcurrentJobs, func(msg models.SubmissionMessage) error {
		result, err := judger.Run(msg)
		if err != nil {
			// Transient infra failure (e.g. S3, disk) — not a verdict. Retry.
			return fmt.Errorf("judge failed for submission %s: %w", msg.SubmissionID, err)
		}

		if err := sqsClient.PublishResult(result); err != nil {
			// We have a verdict but couldn't hand it off. Don't delete — retry so
			// the verdict isn't lost. The result consumer is idempotent.
			return fmt.Errorf("failed to publish result for submission %s: %w", msg.SubmissionID, err)
		}

		return nil // judged and published → safe to delete
	})
}
