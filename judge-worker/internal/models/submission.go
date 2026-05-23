package models

type SubmissionMessage struct {
	SubmissionID   string `json:"submissionId"`
	ProblemID      string `json:"problemId"`
	ProblemSlug    string `json:"problemSlug"`
	UserID         string `json:"userId"`
	Language       string `json:"language"`
	Code           string `json:"code"`
	TimeLimitMs    int    `json:"timeLimitMs"`
	MemoryLimitMb  int    `json:"memoryLimitMb"`
	TestCasesS3Key string `json:"testCasesS3Key"`
}

type JudgeResult struct {
	SubmissionID    string           `json:"submissionId"`
	Status          string           `json:"status"`
	PassedCount     int              `json:"passedCount"`
	TotalCount      int              `json:"totalCount"`
	RuntimeMs       int64            `json:"runtimeMs"`
	MemoryUsedMb    int64            `json:"memoryUsedMb"`
	TestCaseResults []TestCaseResult `json:"testCaseResults"`
	CompileError    string           `json:"compileError,omitempty"`
}
