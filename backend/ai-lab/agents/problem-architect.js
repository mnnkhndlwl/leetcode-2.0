/**
 * Problem Architect (Phase 4 Node A).
 *
 * Standalone (install via MCP):
 *   node ai-lab/agents/problem-architect.js "binary search on answer"
 *
 * Graph use: import { generateProblemDraft } from this module.
 */

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { eq, sql } from "drizzle-orm";

import { db } from "../../src/db/index.js";
import { problems, tags } from "../../src/db/schema.js";
import {
  buildProblemDraftSchema,
  sanitizeProblemDraft,
} from "../lib/schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = join(
  __dirname,
  "../../../db-explorer-mcp/server.js"
);
const MAX_ATTEMPTS = 3;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-2024-08-06";

// ── DB helpers ──────────────────────────────────────────────────────────────

async function loadTagVocabulary() {
  const rows = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .orderBy(tags.slug);

  if (rows.length === 0) {
    throw new Error(
      "No rows in tags — seed the DB before running the architect"
    );
  }
  return rows;
}

/**
 * Prefer Two Sum; otherwise any problem that has both JS and Python3 drivers.
 */
async function loadDriverCodeExemplar() {
  const [twoSum] = await db
    .select({
      title: problems.title,
      slug: problems.slug,
      driverCode: problems.driverCode,
      codeTemplates: problems.codeTemplates,
    })
    .from(problems)
    .where(eq(problems.slug, "two-sum"))
    .limit(1);

  if (
    twoSum?.driverCode?.javascript?.trim() &&
    twoSum?.driverCode?.python3?.trim()
  ) {
    return twoSum;
  }

  const [fallback] = await db
    .select({
      title: problems.title,
      slug: problems.slug,
      driverCode: problems.driverCode,
      codeTemplates: problems.codeTemplates,
    })
    .from(problems)
    .where(sql`"driverCode" ? 'javascript' AND "driverCode" ? 'python3'`)
    .limit(1);

  if (!fallback) {
    throw new Error(
      "No problem with driverCode.javascript + driverCode.python3 found for few-shot exemplar"
    );
  }
  return fallback;
}

// ── Prompt / feedback ───────────────────────────────────────────────────────

function buildSystemPrompt(tagRows, exemplar) {
  const vocab = tagRows.map((t) => `- ${t.slug} (${t.name})`).join("\n");

  return `You are a problem architect for a LeetCode-style judge.

Produce a complete coding problem draft that will be installed via create_problem.

Hard constraints:
- tagSlugs MUST be chosen only from the vocabulary below (unknown slugs are rejected).
- codeTemplates, driverCode, and referenceSolutions MUST include exactly javascript and python3.
- Hidden testCases use judge format: { id, input, expectedOutput } where input is raw stdin and expectedOutput is trimmed stdout.
- sampleTestCases use UI format: { input, output, explanation? } — different shape from testCases.
- driverCode is a hidden I/O harness appended AFTER the user's code (same concatenate model as production). Match this project's conventions — see the few-shot exemplar.
- referenceSolutions must be correct for every hidden test case (they are dry-run before install).
- Prefer PRIVATE-ready drafts: clear statement, ≥2 samples, ≥5 hidden cases covering edge cases.
- javascript templates are usually a function declaration; python3 templates usually a class Solution with a method. Drivers must call those entry points.

Allowed tag vocabulary:
${vocab}

Few-shot driver-code exemplar from existing problem "${exemplar.title}" (${exemplar.slug}):

--- driverCode.javascript ---
${exemplar.driverCode.javascript}

--- driverCode.python3 ---
${exemplar.driverCode.python3}

${
  exemplar.codeTemplates?.javascript
    ? `--- codeTemplates.javascript (for pairing context) ---
${exemplar.codeTemplates.javascript}
`
    : ""
}${
  exemplar.codeTemplates?.python3
    ? `--- codeTemplates.python3 (for pairing context) ---
${exemplar.codeTemplates.python3}
`
    : ""
}`;
}

function formatCreateProblemFailure(payload) {
  if (Array.isArray(payload.details) && payload.details.length) {
    return `create_problem validation failed: ${payload.error ?? "Validation failed"}. Fix these issues: ${payload.details.join("; ")}`;
  }
  if (payload.details != null && !Array.isArray(payload.details)) {
    return `create_problem failed: ${payload.error}. Details: ${payload.details}`;
  }

  if (Array.isArray(payload.dryRun) && payload.dryRun.length) {
    const lines = [];
    for (const run of payload.dryRun) {
      for (const f of run.failures ?? []) {
        const lang = run.language ?? "?";
        if (f.reason === "wrong_answer") {
          lines.push(
            `Test case ${f.caseId} (${lang}) expected '${f.expected}' but your reference solution produced '${f.actual}' — fix the reference solution or the test case.`
          );
        } else if (f.reason === "runtime_error") {
          lines.push(
            `Test case ${f.caseId} (${lang}) hit a runtime error: ${(f.stderr || "unknown").slice(0, 300)}. Fix referenceSolutions or driverCode.`
          );
        } else if (f.reason === "timeout") {
          lines.push(
            `Test case ${f.caseId} (${lang}) timed out. Simplify the reference solution or the case.`
          );
        } else {
          lines.push(
            `Test case ${f.caseId ?? "?"} (${lang}): ${f.reason ?? JSON.stringify(f)}`
          );
        }
      }
    }
    return (
      lines.join(" ") ||
      `Dry-run failed: ${payload.error ?? "fix referenceSolutions, driverCode, or testCases"}`
    );
  }

  return `create_problem failed: ${payload.error ?? JSON.stringify(payload)}`;
}

function parseToolPayload(result) {
  const text =
    result?.content?.find((c) => c.type === "text")?.text ??
    (typeof result === "string" ? result : "");
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: text || "Unparseable MCP tool response",
    };
  }
}

// ── MCP ─────────────────────────────────────────────────────────────────────

async function connectMcp() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [MCP_SERVER_PATH],
    stderr: "inherit",
  });
  const client = new Client({
    name: "problem-architect",
    version: "1.0.0",
  });
  await client.connect(transport);
  return { client, transport };
}

/**
 * Structured-output draft only (Node A). No MCP install.
 *
 * @param {string} topic
 * @param {{ revisionFeedback?: string | null }} [opts]
 * @returns {Promise<object>} sanitized create_problem-shaped draft
 */
export async function generateProblemDraft(topic, opts = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set — add it to backend/.env before running the architect"
    );
  }
  if (!topic?.trim()) {
    throw new Error("topic is required");
  }

  const [tagRows, exemplar] = await Promise.all([
    loadTagVocabulary(),
    loadDriverCodeExemplar(),
  ]);
  const problemSchema = buildProblemDraftSchema(tagRows.map((t) => t.slug));
  const openai = new OpenAI();

  const userParts = [
    `Design and fully specify a coding problem for this topic:\n<user_topic>\n${topic.trim()}\n</user_topic>`,
  ];
  if (opts.revisionFeedback?.trim()) {
    userParts.push(
      `\nRevision required from the Adversary / Solver pipeline:\n${opts.revisionFeedback.trim()}\nStrengthen hidden testCases (and fix expectedOutput / referenceSolutions to stay consistent). Keep the same topic.`
    );
  }

  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(tagRows, exemplar) },
      { role: "user", content: userParts.join("\n") },
    ],
    response_format: zodResponseFormat(problemSchema, "problem_draft"),
  });

  const message = completion.choices[0].message;
  if (message.refusal) {
    throw new Error(`Architect refused: ${message.refusal}`);
  }
  if (!message.parsed) {
    throw new Error("Architect returned no parsed problem_draft");
  }

  return sanitizeProblemDraft(message.parsed);
}

// ── Standalone install loop (MCP) ───────────────────────────────────────────

/**
 * @param {string} topic
 * @returns {Promise<{ ok: true, problem: object, tagsLinked: string[] } | { ok: false, lastFailure: object }>}
 */
export async function runArchitect(topic) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set — add it to backend/.env before running the architect"
    );
  }
  if (!topic?.trim()) {
    throw new Error("topic is required");
  }

  const [tagRows, exemplar] = await Promise.all([
    loadTagVocabulary(),
    loadDriverCodeExemplar(),
  ]);
  const tagSlugs = tagRows.map((t) => t.slug);
  const problemSchema = buildProblemDraftSchema(tagSlugs);
  const openai = new OpenAI();

  const messages = [
    { role: "system", content: buildSystemPrompt(tagRows, exemplar) },
    {
      role: "user",
      content: `Design and fully specify a coding problem for this topic:\n<user_topic>\n${topic.trim()}\n</user_topic>`,
    },
  ];

  let mcp;
  let lastFailure = null;

  try {
    mcp = await connectMcp();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.error(
        `\n[architect] attempt ${attempt}/${MAX_ATTEMPTS} — generating…`
      );

      const completion = await openai.chat.completions.parse({
        model: MODEL,
        messages,
        response_format: zodResponseFormat(problemSchema, "problem_draft"),
      });

      const message = completion.choices[0].message;
      if (message.refusal) {
        lastFailure = {
          success: false,
          error: `Model refused: ${message.refusal}`,
        };
        console.error("[architect] model refused:", message.refusal);
        messages.push(message);
        messages.push({
          role: "user",
          content:
            "Do not refuse. Produce a valid problem draft for the topic inside <user_topic>.",
        });
        continue;
      }

      const draft = message.parsed;
      if (!draft) {
        lastFailure = {
          success: false,
          error: "No parsed draft from model",
          raw: message.content,
        };
        messages.push(message);
        messages.push({
          role: "user",
          content:
            "Your previous reply did not parse. Emit a complete valid problem_draft.",
        });
        continue;
      }

      messages.push(message);

      const args = sanitizeProblemDraft(draft);
      console.error(
        `[architect] calling create_problem — "${args.title}" (${args.difficulty}), tags=${args.tagSlugs.join(",")}`
      );

      const toolResult = await mcp.client.callTool({
        name: "create_problem",
        arguments: args,
      });
      const payload = parseToolPayload(toolResult);

      if (payload.success === true) {
        console.log(
          JSON.stringify(
            {
              success: true,
              attempt,
              problem: {
                id: payload.problem?.id,
                slug: payload.problem?.slug,
                title: payload.problem?.title,
              },
              tagsLinked: payload.tagsLinked ?? [],
            },
            null,
            2
          )
        );
        return {
          ok: true,
          problem: payload.problem,
          tagsLinked: payload.tagsLinked ?? [],
        };
      }

      lastFailure = payload;
      const feedback = formatCreateProblemFailure(payload);
      console.error(`[architect] create_problem failed: ${feedback}`);
      messages.push({
        role: "user",
        content: `${feedback}\nRevise the entire problem draft to fix these issues and try again.`,
      });
    }

    console.error("\n[architect] exhausted retries. Last failure:");
    console.error(JSON.stringify(lastFailure, null, 2));
    return { ok: false, lastFailure };
  } finally {
    if (mcp) {
      try {
        await mcp.client.close();
      } catch (err) {
        console.error(
          "[architect] MCP close error:",
          err instanceof Error ? err.message : err
        );
      }
    }
  }
}

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: node ai-lab/agents/problem-architect.js "<topic>"');
    process.exit(1);
  }

  try {
    const result = await runArchitect(topic);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(
      "[architect] fatal:",
      err instanceof Error ? err.stack ?? err.message : err
    );
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}
