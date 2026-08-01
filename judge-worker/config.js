import "dotenv/config";

/**
 * @typedef {Object} Config
 * @property {string} submissionQueueURL
 * @property {string} resultQueueURL
 * @property {string} s3BucketName
 * @property {string} awsRegion
 * @property {number} maxConcurrentJobs
 * @property {number} pollWaitSeconds
 * @property {number} visibilityTimeoutSeconds
 * @property {string} imageRegistry
 */

/**
 * Load and validate required environment variables.
 * @returns {Config}
 */
export function loadConfig() {
  const missing = [];

  /** @param {string} key */
  function requireEnv(key) {
    const val = process.env[key];
    if (!val) missing.push(key);
    return val ?? "";
  }

  /** @param {string} key @param {string} raw */
  function requirePositiveInt(key, raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`config: ${key} must be a positive integer, got ${JSON.stringify(raw)}`);
    }
    return n;
  }

  const submissionQueueURL = requireEnv("SQS_SUBMISSION_QUEUE_URL");
  const resultQueueURL = requireEnv("SQS_RESULT_QUEUE_URL");
  const s3BucketName = requireEnv("TEST_CASES_S3_BUCKET");
  const awsRegion = requireEnv("AWS_REGION");
  const maxJobsRaw = requireEnv("MAX_CONCURRENT_JOBS");
  const pollRaw = requireEnv("POLL_WAIT_SECONDS");
  const visRaw = requireEnv("VISIBILITY_TIMEOUT_SECONDS");

  if (missing.length > 0) {
    throw new Error(`config: missing required environment variable(s): ${missing.join(", ")}`);
  }

  return {
    submissionQueueURL,
    resultQueueURL,
    s3BucketName,
    awsRegion,
    maxConcurrentJobs: requirePositiveInt("MAX_CONCURRENT_JOBS", maxJobsRaw),
    pollWaitSeconds: requirePositiveInt("POLL_WAIT_SECONDS", pollRaw),
    visibilityTimeoutSeconds: requirePositiveInt("VISIBILITY_TIMEOUT_SECONDS", visRaw),
    imageRegistry: process.env.IMAGE_REGISTRY ?? "",
  };
}
