package main

import (
	"context"

	"github.com/leetcode-2.0/judge/internal/config"
	"github.com/leetcode-2.0/judge/internal/models"
)

func main() {
	cfg := config.Load() // panic if env vars missing
	sqsClient := queue.New(cfg)
	s3Client := s3client.New(cfg)
	cache := judge.NewCache()
	judger := judge.New(s3Client, cache)

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
			sqsClient.PublishResult(result)
		}()
		return nil // return nil so SQS message gets deleted immediately
	})
}
