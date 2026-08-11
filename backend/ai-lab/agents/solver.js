/**
 * Node B — Solver: bounded reflection loop (Phase 3) against a problem draft.
 */

import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { runAgainstDraft } from "../lib/localJudge.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-2024-08-06";
const MAX_ATTEMPTS = 3;

const solutionSchema = z.object({
  language: z.enum(["javascript", "python3"]),
  code: z
    .string()
    .describe(
      "Complete solution source ONLY (no driver / I/O). Must match the draft's codeTemplates entry point."
    ),
});

/**
 * @param {object} draft sanitizeProblemDraft-shaped problem
 * @returns {Promise<{
 *   ok: boolean,
 *   code: string | null,
 *   language: string,
 *   attempts: number,
 *   lastVerdict: object | null,
 * }>}
 */
export async function runSolver(draft) {
  const openai = new OpenAI();
  const language = "javascript";
  const template = draft.codeTemplates?.[language] ?? "";

  const messages = [
    {
      role: "system",
      content: `You are a coding-problem solver for a LeetCode-style judge.

Write a correct ${language} solution for the given problem.
- Return ONLY the user solution code (function / class) — the hidden driver is appended automatically.
- Match the entry point implied by the starter template.
- Do not print anything yourself; the driver handles stdin/stdout.`,
    },
    {
      role: "user",
      content: `Solve this problem.

Title: ${draft.title}
Difficulty: ${draft.difficulty}

Description:
${draft.description}

Starter template (${language}):
\`\`\`
${template}
\`\`\`

Sample cases (for understanding — hidden cases may differ):
${JSON.stringify(draft.sampleTestCases, null, 2)}`,
    },
  ];

  let lastVerdict = null;
  let lastCode = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.error(`[solver] attempt ${attempt}/${MAX_ATTEMPTS}`);

    const completion = await openai.chat.completions.parse({
      model: MODEL,
      messages,
      response_format: zodResponseFormat(solutionSchema, "solution"),
    });

    const message = completion.choices[0].message;
    if (message.refusal || !message.parsed?.code) {
      messages.push(message);
      messages.push({
        role: "user",
        content: "Produce a valid solution object with language + code.",
      });
      continue;
    }

    const { code } = message.parsed;
    lastCode = code;
    messages.push(message);

    const verdict = await runAgainstDraft({ code, language, draft });
    lastVerdict = verdict;
    console.error(
      `[solver] verdict=${verdict.status} passed=${verdict.passedCount}/${verdict.totalCount} via ${verdict.backend}`
    );

    if (verdict.status === "ACCEPTED") {
      return {
        ok: true,
        code,
        language,
        attempts: attempt,
        lastVerdict: verdict,
      };
    }

    const failed = (verdict.testCaseResults ?? [])
      .filter((t) => !t.passed)
      .map((t) => t.id)
      .slice(0, 5);

    messages.push({
      role: "user",
      content: `Verdict: ${verdict.status}. Passed ${verdict.passedCount}/${verdict.totalCount}. Failed case ids: [${failed.join(", ")}].${
        verdict.compileError ? ` stderr: ${verdict.compileError}` : ""
      } Fix the solution and try again.`,
    });
  }

  return {
    ok: false,
    code: lastCode,
    language,
    attempts: MAX_ATTEMPTS,
    lastVerdict,
  };
}
