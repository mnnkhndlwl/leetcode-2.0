/**
 * Lab judge wrapper.
 *
 * Primary path (Phase 2 roadmap): Docker-backed `Judge` with a local-file
 * S3 stub. Fallback when Docker is unavailable: host node/python3 with stdin
 * redirected from a file (avoids the readFileSync(0) race in naive pipes).
 */

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import { Judge } from "../../../judge-worker/judge.js";

const localS3Stub = {
  /** @param {string} path */
  download: (path) => readFile(path),
};

export const judge = new Judge(localS3Stub, "");

let dockerAvailableCache = null;

async function isDockerAvailable() {
  if (dockerAvailableCache != null) return dockerAvailableCache;
  try {
    const ok = await new Promise((resolve) => {
      const child = spawn("docker", ["info"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
    dockerAvailableCache = ok;
  } catch {
    dockerAvailableCache = false;
  }
  return dockerAvailableCache;
}

/**
 * Concatenate user/reference code with the problem's hidden driver (same as
 * backend submit).
 * @param {string} code
 * @param {string} driver
 */
export function withDriver(code, driver) {
  return `${(code ?? "").trim()}\n\n${(driver ?? "").trim()}\n`;
}

/**
 * @param {{ command: string, args: string[], inputPath: string, timeoutMs: number }} opts
 */
function runOnceFileStdin({ command, args, inputPath, timeoutMs }) {
  return new Promise((resolve) => {
    const fd = openSync(inputPath, "r");
    const child = spawn(command, args, {
      stdio: [fd, "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
      resolve(payload);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        stdout,
        stderr: stderr || `Timed out after ${timeoutMs}ms`,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      finish({ ok: false, stdout, stderr: err.message, timedOut: false });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0,
        stdout,
        stderr,
        timedOut: false,
        exitCode: code,
      });
    });
  });
}

/**
 * Host dry-run: write solution + per-case stdin files, exec with file stdin.
 * @returns {Promise<{ ok: true, passed: number } | { ok: false, failures: object[] }>}
 */
async function localDryRun({ language, fullCode, testCases, timeLimitMs }) {
  if (language !== "javascript" && language !== "python3") {
    return {
      ok: false,
      failures: [
        {
          reason: `Local dry-run supports javascript/python3 only (got ${language})`,
        },
      ],
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "ai-lab-dry-"));
  const filename = language === "javascript" ? "solution.js" : "solution.py";
  const filepath = join(dir, filename);
  await writeFile(filepath, fullCode, "utf8");

  const command = language === "javascript" ? "node" : "python3";
  const failures = [];

  try {
    for (const tc of testCases) {
      const inputPath = join(dir, `case-${tc.id}.in`);
      await writeFile(inputPath, tc.input ?? "", "utf8");
      const result = await runOnceFileStdin({
        command,
        args: [filepath],
        inputPath,
        timeoutMs: timeLimitMs + 500,
      });

      const actual = (result.stdout ?? "").trim();
      const expected = (tc.expectedOutput ?? "").trim();

      if (result.timedOut) {
        failures.push({
          caseId: tc.id,
          reason: "timeout",
          expected,
          actual,
          stderr: result.stderr?.slice(0, 500),
        });
        continue;
      }
      if (!result.ok) {
        failures.push({
          caseId: tc.id,
          reason: "runtime_error",
          expected,
          actual,
          stderr: result.stderr?.slice(0, 500),
          exitCode: result.exitCode,
        });
        continue;
      }
      if (actual !== expected) {
        failures.push({
          caseId: tc.id,
          reason: "wrong_answer",
          expected,
          actual,
        });
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  if (failures.length) return { ok: false, failures };
  return { ok: true, passed: testCases.length };
}

/**
 * Run code against a problem draft's hidden test cases.
 *
 * @param {{
 *   code: string,
 *   language?: "javascript" | "python3",
 *   draft: {
 *     title?: string,
 *     testCases: Array<{ id: number, input: string, expectedOutput: string }>,
 *     driverCode: { javascript?: string, python3?: string },
 *     timeLimitMs?: number,
 *     memoryLimitMb?: number,
 *   },
 * }} opts
 */
export async function runAgainstDraft({
  code,
  language = "javascript",
  draft,
}) {
  const driver = draft.driverCode?.[language];
  if (!driver?.trim()) {
    throw new Error(`draft.driverCode.${language} is missing`);
  }
  if (!Array.isArray(draft.testCases) || draft.testCases.length === 0) {
    throw new Error("draft.testCases must be a non-empty array");
  }

  const timeLimitMs = draft.timeLimitMs ?? 2000;
  const memoryLimitMb = draft.memoryLimitMb ?? 256;
  const fullCode = withDriver(code, driver);

  if (await isDockerAvailable()) {
    const dir = await mkdtemp(join(tmpdir(), "ai-lab-cases-"));
    const casesPath = join(dir, "cases.json");
    try {
      await writeFile(casesPath, JSON.stringify(draft.testCases), "utf8");
      const result = await judge.run({
        submissionId: randomUUID(),
        problemSlug:
          draft.title?.toLowerCase().replace(/\s+/g, "-") ?? "draft",
        language,
        code: fullCode,
        timeLimitMs,
        memoryLimitMb,
        testCasesS3Key: casesPath,
      });
      return { ...result, backend: "docker" };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const dry = await localDryRun({
    language,
    fullCode,
    testCases: draft.testCases,
    timeLimitMs,
  });

  if (dry.ok) {
    return {
      status: "ACCEPTED",
      passedCount: dry.passed,
      totalCount: draft.testCases.length,
      runtimeMs: 0,
      testCaseResults: draft.testCases.map((tc) => ({
        id: tc.id,
        passed: true,
        runtimeMs: 0,
      })),
      backend: "local-dry-run",
    };
  }

  const first = dry.failures?.[0];
  let status = "WRONG_ANSWER";
  if (first?.reason === "timeout") status = "TIME_LIMIT_EXCEEDED";
  else if (first?.reason === "runtime_error") status = "RUNTIME_ERROR";

  const failedIds = new Set(
    (dry.failures ?? []).map((f) => f.caseId).filter((id) => id != null)
  );
  return {
    status,
    passedCount: draft.testCases.length - failedIds.size,
    totalCount: draft.testCases.length,
    runtimeMs: 0,
    compileError: first?.stderr || first?.reason || undefined,
    testCaseResults: draft.testCases.map((tc) => ({
      id: tc.id,
      passed: !failedIds.has(tc.id),
      runtimeMs: 0,
    })),
    failures: dry.failures,
    backend: "local-dry-run",
  };
}
