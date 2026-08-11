/**
 * Node C — Adversary: deliberately submit a *bad* solution.
 * If the judge wrongly ACCEPTs it, the Architect's hidden tests are too weak.
 */

import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { runAgainstDraft } from "../lib/localJudge.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-2024-08-06";

const badSolutionSchema = z.object({
  language: z.enum(["javascript", "python3"]),
  code: z
    .string()
    .describe("Intentionally incorrect solution (wrong algorithm / off-by-one / ignores edge cases)"),
  attackStrategy: z
    .string()
    .describe(
      "Short note on how this solution is wrong, e.g. 'off-by-one on empty input', 'brute force that still passes samples'"
    ),
  expectedBreakDescription: z
    .string()
    .describe(
      "What edge case / property a strong test suite should catch that this bad code mishandles"
    ),
});

/**
 * @param {object} draft
 * @returns {Promise<{
 *   brokeTests: boolean,
 *   attackStrategy: string,
 *   expectedBreakDescription: string,
 *   code: string,
 *   language: string,
 *   verdict: object,
 *   feedbackForArchitect: string | null,
 * }>}
 */
export async function runAdversary(draft) {
  const openai = new OpenAI();
  const language = "javascript";
  const template = draft.codeTemplates?.[language] ?? "";

  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are an adversarial tester for coding problems.

Write a deliberately *incorrect* ${language} solution that:
- Still matches the starter template's entry point (so it runs under the driver)
- Looks plausible enough to pass weak sample-only tests
- Fails on a real edge case (empty input, duplicates, overflow, off-by-one boundaries, wrong complexity that returns wrong answers on large/corner inputs, etc.)

Do NOT write a correct solution. The goal is to expose weak hidden test cases.`,
      },
      {
        role: "user",
        content: `Attack this problem draft.

Title: ${draft.title}
Difficulty: ${draft.difficulty}

Description:
${draft.description}

Starter (${language}):
\`\`\`
${template}
\`\`\`

Known samples (your bad code may still pass these — that is fine):
${JSON.stringify(draft.sampleTestCases, null, 2)}

Hidden case count: ${draft.testCases?.length ?? 0}`,
      },
    ],
    response_format: zodResponseFormat(badSolutionSchema, "bad_solution"),
  });

  const parsed = completion.choices[0].message.parsed;
  if (!parsed?.code) {
    throw new Error("Adversary model did not return a bad solution");
  }

  const { code, attackStrategy, expectedBreakDescription } = parsed;
  const verdict = await runAgainstDraft({ code, language, draft });

  const brokeTests = verdict.status === "ACCEPTED";
  console.error(
    `[adversary] strategy="${attackStrategy}" verdict=${verdict.status} brokeTests=${brokeTests}`
  );

  return {
    brokeTests,
    attackStrategy,
    expectedBreakDescription,
    code,
    language,
    verdict,
    feedbackForArchitect: brokeTests
      ? `Add edge cases for: ${expectedBreakDescription} (adversary attack: ${attackStrategy}; bad code was wrongly ACCEPTED)`
      : null,
  };
}
