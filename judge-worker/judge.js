import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * @typedef {Object} SubmissionMessage
 * @property {string} submissionId
 * @property {string} problemId
 * @property {string} problemSlug
 * @property {string} userId
 * @property {string} language
 * @property {string} code
 * @property {number} timeLimitMs
 * @property {number} memoryLimitMb
 * @property {string} testCasesS3Key
 */

/**
 * @typedef {Object} TestCaseResult
 * @property {number} id
 * @property {boolean} passed
 * @property {number} runtimeMs
 */

/**
 * @typedef {Object} JudgeResult
 * @property {string} submissionId
 * @property {string} status
 * @property {number} passedCount
 * @property {number} totalCount
 * @property {number} runtimeMs
 * @property {number} memoryUsedMb
 * @property {TestCaseResult[]} testCaseResults
 * @property {string} [compileError]
 */

/**
 * @param {string} lang
 * @returns {string}
 */
function langFilename(lang) {
  switch (lang) {
    case "java":
      return "Main.java";
    case "python3":
      return "solution.py";
    case "javascript":
      return "solution.js";
    case "cpp":
      return "solution.cpp";
    case "go":
      return "solution.go";
    default:
      return "solution";
  }
}

export class Judge {
  /**
   * @param {import("./s3.js").TestCasesS3} s3
   * @param {string} imageRegistry
   */
  constructor(s3, imageRegistry) {
    this.s3 = s3;
    this.imageRegistry = imageRegistry;
    /** @type {Map<string, import("./s3.js").TestCase[]>} */
    this.cache = new Map();
  }

  /** @param {string} lang */
  imageFor(lang) {
    if (this.imageRegistry) {
      return `${this.imageRegistry}/judge:${lang}`;
    }
    return `judge-${lang}:latest`;
  }

  /**
   * @param {string} slug
   * @param {string} s3Key
   * @returns {Promise<import("./s3.js").TestCase[]>}
   */
  async getTestCases(slug, s3Key) {
    const cached = this.cache.get(slug);
    if (cached) return cached;

    const data = await this.s3.download(s3Key);
    /** @type {import("./s3.js").TestCase[]} */
    const testCases = JSON.parse(data.toString("utf8"));
    this.cache.set(slug, testCases);
    return testCases;
  }

  /**
   * Judges a submission. Throws ONLY for transient infrastructure failures
   * (S3, disk). A resolved result — including user RUNTIME_ERROR — is a
   * legitimate verdict and should be published + the SQS message deleted.
   *
   * @param {SubmissionMessage} msg
   * @returns {Promise<JudgeResult>}
   */
  async run(msg) {
    /** @type {JudgeResult} */
    const result = {
      submissionId: msg.submissionId,
      status: "ACCEPTED",
      passedCount: 0,
      totalCount: 0,
      runtimeMs: 0,
      memoryUsedMb: 0,
      testCaseResults: [],
    };

    let testCases;
    try {
      testCases = await this.getTestCases(msg.problemSlug, msg.testCasesS3Key);
    } catch (err) {
      throw new Error(`failed to load test cases: ${err.message}`);
    }

    const codeDir = await mkdtemp(join(tmpdir(), `submission-${msg.submissionId}-`));
    try {
      const codePath = join(codeDir, langFilename(msg.language));
      try {
        await writeFile(codePath, msg.code, { mode: 0o644 });
      } catch (err) {
        throw new Error(`failed to write code: ${err.message}`);
      }

      result.totalCount = testCases.length;

      const image = this.imageFor(msg.language);
      let overallStatus = "ACCEPTED";
      let maxRuntimeMs = 0;
      let errorOutput = "";

      for (const tc of testCases) {
        const { tcResult, status, stderr } = await runTestCase(
          image,
          codeDir,
          tc,
          msg
        );
        result.testCaseResults.push(tcResult);

        if (tcResult.runtimeMs > maxRuntimeMs) {
          maxRuntimeMs = tcResult.runtimeMs;
        }
        if (status !== "ACCEPTED" && overallStatus === "ACCEPTED") {
          overallStatus = status;
          errorOutput = stderr;
        }
        if (tcResult.passed) {
          result.passedCount++;
        }
      }

      result.status = overallStatus;
      result.runtimeMs = maxRuntimeMs;

      if (errorOutput) {
        const maxLen = 4000;
        result.compileError =
          errorOutput.length > maxLen
            ? errorOutput.slice(0, maxLen) + "\n...(truncated)"
            : errorOutput;
      }

      return result;
    } finally {
      await rm(codeDir, { recursive: true, force: true });
    }
  }
}

/**
 * @param {string} image
 * @param {string} codeDir
 * @param {import("./s3.js").TestCase} tc
 * @param {SubmissionMessage} msg
 * @returns {Promise<{ tcResult: TestCaseResult, status: string, stderr: string }>}
 */
function runTestCase(image, codeDir, tc, msg) {
  const timeoutMs = msg.timeLimitMs + 2000;

  const args = [
    "run",
    "--rm",
    "-i",
    "--network",
    "none",
    `--memory=${msg.memoryLimitMb}m`,
    "--cpus=0.5",
    "--read-only",
    "--tmpfs",
    "/tmp",
    "-v",
    `${codeDir}:/code:ro`,
    image,
  ];

  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.write(tc.input);
    child.stdin.end();

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const runtimeMs = Date.now() - start;
      console.error(
        `submission ${msg.submissionId} tc ${tc.id} docker spawn error: ${err.message}`
      );
      resolve({
        tcResult: { id: tc.id, passed: false, runtimeMs },
        status: "RUNTIME_ERROR",
        stderr: err.message,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const runtimeMs = Date.now() - start;

      /** @type {TestCaseResult} */
      const tcResult = { id: tc.id, passed: false, runtimeMs };

      if (timedOut) {
        resolve({ tcResult, status: "TIME_LIMIT_EXCEEDED", stderr: "" });
        return;
      }

      // OOM kill — Linux SIGKILL → exit 137 (128 + 9)
      if (code === 137) {
        resolve({ tcResult, status: "MEMORY_LIMIT_EXCEEDED", stderr: "" });
        return;
      }

      if (code !== 0) {
        const errOutput = stderr.trim();
        if (errOutput) {
          console.log(
            `submission ${msg.submissionId} tc ${tc.id} stderr: ${errOutput}`
          );
        }
        resolve({ tcResult, status: "RUNTIME_ERROR", stderr: errOutput });
        return;
      }

      if (stdout.trim() === tc.expectedOutput.trim()) {
        tcResult.passed = true;
        resolve({ tcResult, status: "ACCEPTED", stderr: "" });
        return;
      }

      resolve({ tcResult, status: "WRONG_ANSWER", stderr: "" });
    });
  });
}
