import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Languages we can dry-run locally without Docker. */
export const DRY_RUN_LANGUAGES = ["javascript", "python3"];

function runOnce({ command, args, stdin, timeoutMs }) {
    return new Promise((resolve) => {
        const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGKILL");
            resolve({
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
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, stdout, stderr: err.message, timedOut: false });
        });
        child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({
                ok: code === 0,
                stdout,
                stderr,
                timedOut: false,
                exitCode: code,
            });
        });

        child.stdin.write(stdin ?? "");
        child.stdin.end();
    });
}

/**
 * Run referenceSolution + driverCode against each hidden test case (same concatenate
 * model as backend submit). Supports javascript (node) and python3.
 *
 * @returns {{ ok: true, language, passed: number } | { ok: false, language, failures: object[] }}
 */
export async function dryRunReference({ language, referenceSolution, driverCode, testCases, timeLimitMs }) {
    if (!DRY_RUN_LANGUAGES.includes(language)) {
        return {
            ok: false,
            language,
            failures: [
                {
                    reason: `Dry-run not supported for ${language}. Provide referenceSolutions.javascript or referenceSolutions.python3.`,
                },
            ],
        };
    }

    const code = `${referenceSolution.trim()}\n\n${driverCode.trim()}\n`;
    const dir = mkdtempSync(join(tmpdir(), "mcp-dry-run-"));
    const filename = language === "javascript" ? "solution.js" : "solution.py";
    const filepath = join(dir, filename);
    writeFileSync(filepath, code, "utf8");

    const command = language === "javascript" ? "node" : "python3";
    const args = [filepath];
    const failures = [];

    try {
        for (const tc of testCases) {
            const result = await runOnce({
                command,
                args,
                stdin: tc.input,
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
        rmSync(dir, { recursive: true, force: true });
    }

    if (failures.length) {
        return { ok: false, language, failures };
    }
    return { ok: true, language, passed: testCases.length };
}
