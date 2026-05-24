package main

import (
	"context"
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

	// Semaphore: limits concurrent jobs (don't spawn 100 containers at once)
	sem := make(chan struct{}, cfg.MaxConcurrentJobs)

	ctx := context.Background()

	sqsClient.Poll(ctx, func(msg models.SubmissionMessage) error {
		sem <- struct{}{} // acquire slot
		go func() {
			defer func() { <-sem }() // release slot when done

			result := judger.Run(msg)
			if err := sqsClient.PublishResult(result); err != nil {
				log.Printf("failed to publish result for submission %s: %v", msg.SubmissionID, err)
			}
		}()
		return nil // nil → SQS message deleted immediately after goroutine is spawned
	})
}
