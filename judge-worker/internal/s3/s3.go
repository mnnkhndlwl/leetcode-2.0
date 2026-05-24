package s3

import (
	"context"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/leetcode-2.0/judge/internal/config"
)

type TestCase struct {
	ID             int    `json:"id"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expectedOutput"`
}

type S3Client struct {
	client *s3.Client
	bucket string
}

func New(cfg *config.Config) *S3Client {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.AWSRegion),
	)
	if err != nil {
		panic("failed to load AWS config: " + err.Error())
	}
	return &S3Client{
		client: s3.NewFromConfig(awsCfg),
		bucket: cfg.S3BucketName,
	}
}

func (c *S3Client) Download(key string) ([]byte, error) {
	out, err := c.client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}
