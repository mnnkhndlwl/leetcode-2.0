package judge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/leetcode-2.0/judge/internal/models"
	s3client "github.com/leetcode-2.0/judge/internal/s3"
)

type TestCaseCache struct {
	data sync.Map // key: problemSlug, value: []s3client.TestCase
}

func NewCache() *TestCaseCache {
	return &TestCaseCache{}
}

type Judge struct {
	s3            *s3client.S3Client
	cache         *TestCaseCache
	imageRegistry string
}

func New(s3 *s3client.S3Client, cache *TestCaseCache, imageRegistry string) *Judge {
	return &Judge{s3: s3, cache: cache, imageRegistry: imageRegistry}
}

// imageFor resolves the full image name for a language.
// With a registry: "123456.dkr.ecr.../judge:python3"
// Without:         "judge-python3:latest"  (local dev)
func (j *Judge) imageFor(lang string) string {
	if j.imageRegistry != "" {
		return j.imageRegistry + "/judge:" + lang
	}
	return "judge-" + lang + ":latest"
}

// langFilename returns the source filename the runner script expects at /code/
func langFilename(lang string) string {
	switch lang {
	case "java":
		return "Main.java" // Java enforces filename == public class name
	case "python3":
		return "solution.py"
	case "javascript":
		return "solution.js"
	case "cpp":
		return "solution.cpp"
	case "go":
		return "solution.go"
	default:
		return "solution"
	}
}

func (j *Judge) getTestCases(slug, s3Key string) ([]s3client.TestCase, error) {
	if cached, ok := j.cache.data.Load(slug); ok {
		return cached.([]s3client.TestCase), nil
	}

	data, err := j.s3.Download(s3Key)
	if err != nil {
		return nil, fmt.Errorf("s3 download %s: %w", s3Key, err)
	}

	var testCases []s3client.TestCase
	if err := json.Unmarshal(data, &testCases); err != nil {
		return nil, fmt.Errorf("unmarshal test cases: %w", err)
	}

	j.cache.data.Store(slug, testCases)
	return testCases, nil
}

// Run judges a submission. It returns a non-nil error ONLY for transient
// infrastructure failures (S3 unreachable, disk full) — these are NOT the
// submitter's fault and must be retried, so the caller should leave the SQS
// message in the queue (eventually routing it to the DLQ) rather than deleting
// it. A nil error means a legitimate verdict was produced (including a user
// RUNTIME_ERROR), and the result should be published and the message deleted.
func (j *Judge) Run(msg models.SubmissionMessage) (models.JudgeResult, error) {
	result := models.JudgeResult{
		SubmissionID: msg.SubmissionID,
	}

	testCases, err := j.getTestCases(msg.ProblemSlug, msg.TestCasesS3Key)
	if err != nil {
		// Transient: test cases live in S3. Don't blame the user — retry.
		return result, fmt.Errorf("failed to load test cases: %w", err)
	}

	// Write the submission code to a temp dir; mount it read-only into the container.
	// Each submission gets its own dir so concurrent runs don't collide.
	codeDir, err := os.MkdirTemp("", "submission-"+msg.SubmissionID+"-*")
	if err != nil {
		// Transient: local disk problem. Retry on another (or the same) worker.
		return result, fmt.Errorf("failed to create code dir: %w", err)
	}
	defer os.RemoveAll(codeDir)

	codePath := filepath.Join(codeDir, langFilename(msg.Language))
	if err := os.WriteFile(codePath, []byte(msg.Code), 0644); err != nil {
		// Transient: local disk problem. Retry.
		return result, fmt.Errorf("failed to write code: %w", err)
	}

	result.TotalCount = len(testCases)
	result.TestCaseResults = make([]models.TestCaseResult, 0, len(testCases))

	image := j.imageFor(msg.Language)
	overallStatus := "ACCEPTED"
	var maxRuntimeMs int64
	var errorOutput string // stderr from the first failing test case (runtime/compile errors)

	for _, tc := range testCases {
		tcResult, status, stderr := runTestCase(image, codeDir, tc, msg)
		result.TestCaseResults = append(result.TestCaseResults, tcResult)

		if tcResult.RuntimeMs > maxRuntimeMs {
			maxRuntimeMs = tcResult.RuntimeMs
		}
		if status != "ACCEPTED" && overallStatus == "ACCEPTED" {
			overallStatus = status
			errorOutput = stderr
		}
		if tcResult.Passed {
			result.PassedCount++
		}
	}

	result.Status = overallStatus
	result.RuntimeMs = maxRuntimeMs

	// Surface the captured stderr so the client can show the actual error.
	if errorOutput != "" {
		const maxLen = 4000
		if len(errorOutput) > maxLen {
			errorOutput = errorOutput[:maxLen] + "\n...(truncated)"
		}
		result.CompileError = errorOutput
	}

	return result, nil
}

// runTestCase returns the per-case result, the verdict status, and (for error
// verdicts) the program's stderr so the caller can surface it to the client.
func runTestCase(image, codeDir string, tc s3client.TestCase, msg models.SubmissionMessage) (models.TestCaseResult, string, string) {
	// wall-clock timeout = problem limit + 2s grace
	timeout := time.Duration(msg.TimeLimitMs+2000) * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	args := []string{
		"run", "--rm", "-i",
		"--network", "none",
		fmt.Sprintf("--memory=%dm", msg.MemoryLimitMb),
		"--cpus=0.5",
		"--read-only",
		"--tmpfs", "/tmp",
		// mount the submission code read-only; the run.sh inside each image reads from /code/
		"-v", codeDir + ":/code:ro",
		image,
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdin = strings.NewReader(tc.Input) // test case input → program's stdin

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	runtimeMs := time.Since(start).Milliseconds()

	tcResult := models.TestCaseResult{
		ID:        tc.ID,
		RuntimeMs: runtimeMs,
	}

	if ctx.Err() == context.DeadlineExceeded {
		return tcResult, "TIME_LIMIT_EXCEEDED", ""
	}

	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			// OOM kill — Linux sends SIGKILL → exit 137 (128 + 9)
			if exitErr.ExitCode() == 137 {
				return tcResult, "MEMORY_LIMIT_EXCEEDED", ""
			}
		}
		errOutput := strings.TrimSpace(stderr.String())
		if errOutput != "" {
			log.Printf("submission %s tc %d stderr: %s", msg.SubmissionID, tc.ID, errOutput)
		}
		return tcResult, "RUNTIME_ERROR", errOutput
	}

	if strings.TrimSpace(stdout.String()) == strings.TrimSpace(tc.ExpectedOutput) {
		tcResult.Passed = true
		return tcResult, "ACCEPTED", ""
	}

	return tcResult, "WRONG_ANSWER", ""
}
