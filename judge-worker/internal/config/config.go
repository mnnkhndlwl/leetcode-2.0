package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	SubmissionQueueURL string
	ResultQueueURL     string
	S3BucketName       string
	AWSRegion          string
	MaxConcurrentJobs  int
	WorkerPollInterval time.Duration
}

// Load reads the .env file (if present) then maps environment variables into
// a Config.  It returns an error if any required variable is missing or
// cannot be parsed.
func Load() (*Config, error) {
	// Load .env if it exists; ignore the error so production environments
	// that rely solely on real env vars still work.
	_ = godotenv.Load()

	cfg := &Config{}
	var missing []string

	requireEnv := func(key string) string {
		val := os.Getenv(key)
		if val == "" {
			missing = append(missing, key)
		}
		return val
	}

	cfg.SubmissionQueueURL = requireEnv("SQS_SUBMISSION_QUEUE_URL")
	cfg.ResultQueueURL = requireEnv("SQS_RESULT_QUEUE_URL")
	cfg.S3BucketName = requireEnv("TEST_CASES_S3_BUCKET")
	cfg.AWSRegion = requireEnv("AWS_REGION")

	// --- MaxConcurrentJobs (int, required) ---
	maxJobsStr := requireEnv("MAX_CONCURRENT_JOBS")
	if maxJobsStr != "" {
		n, err := strconv.Atoi(maxJobsStr)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("config: MAX_CONCURRENT_JOBS must be a positive integer, got %q", maxJobsStr)
		}
		cfg.MaxConcurrentJobs = n
	}

	// --- WorkerPollInterval (seconds, required) ---
	pollStr := requireEnv("POLL_WAIT_SECONDS")
	if pollStr != "" {
		secs, err := strconv.Atoi(pollStr)
		if err != nil || secs <= 0 {
			return nil, fmt.Errorf("config: POLL_WAIT_SECONDS must be a positive integer, got %q", pollStr)
		}
		cfg.WorkerPollInterval = time.Duration(secs) * time.Second
	}

	if len(missing) > 0 {
		return nil, fmt.Errorf("config: missing required environment variable(s): %v", missing)
	}

	return cfg, nil
}
