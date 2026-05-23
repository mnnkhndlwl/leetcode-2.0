package s3

import (
	"encoding/json"
	"sync"
)

// Pattern to implement
type TestCaseCache struct {
	cache sync.Map // key: problemSlug, value: []TestCase
}

func (c *TestCaseCache) Get(slug string, s3Key string) ([]TestCase, error) {
	// 1. check cache first
	if cached, ok := c.cache.Load(slug); ok {
		return cached.([]TestCase), nil
	}

	// 2. download from S3
	data := s3.GetObject(s3Key)
	testCases := json.Unmarshal(data)

	// 3. store in cache for next time
	c.cache.Store(slug, testCases)

	return testCases, nil
}
