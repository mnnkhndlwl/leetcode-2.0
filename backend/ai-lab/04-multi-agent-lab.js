/**
 * Phase 4 — Multi-agent lab (Architect → Solver → Adversary) as a LangGraph
 * state machine.
 *
 * Usage (from backend/):
 *   node ai-lab/04-multi-agent-lab.js "binary search on answer"
 *
 * Flow:
 *   architect → solver → adversary → (weak tests? revise architect : approve+insert)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { inArray } from "drizzle-orm";

import { db } from "../src/db/index.js";
import { problems, problemTags, tags } from "../src/db/schema.js";
import { generateProblemDraft } from "./agents/problem-architect.js";
import { runSolver } from "./agents/solver.js";
import { runAdversary } from "./agents/adversary.js";
import { slugify } from "../../db-explorer-mcp/lib/validate-problem.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_REVISIONS = 2;
const CASES_DIR = join(__dirname, "tmp", "cases");

const LabState = Annotation.Root({
  topic: Annotation(),
  problemDraft: Annotation({ default: () => null }),
  solverCode: Annotation({ default: () => null }),
  solverReport: Annotation({ default: () => null }),
  adversaryReport: Annotation({ default: () => null }),
  architectFeedback: Annotation({ default: () => null }),
  revisionCount: Annotation({ default: () => 0 }),
  isApproved: Annotation({ default: () => false }),
  insertedProblem: Annotation({ default: () => null }),
});

// ── Nodes ───────────────────────────────────────────────────────────────────

async function architectNode(state) {
  const feedback = state.architectFeedback;
  console.error(
    `\n=== NODE A: Architect ===${feedback ? ` (revision: ${feedback})` : ""}`
  );

  const draft = await generateProblemDraft(state.topic, {
    revisionFeedback: feedback,
  });

  console.error(
    `[architect] draft="${draft.title}" difficulty=${draft.difficulty} hiddenCases=${draft.testCases.length}`
  );

  return {
    problemDraft: draft,
    architectFeedback: null,
    // Clear downstream artifacts when revising
    solverCode: null,
    solverReport: null,
    adversaryReport: null,
    isApproved: false,
  };
}

async function solverNode(state) {
  console.error("\n=== NODE B: Solver ===");
  const result = await runSolver(state.problemDraft);
  return {
    solverCode: result.code,
    solverReport: {
      ok: result.ok,
      language: result.language,
      attempts: result.attempts,
      status: result.lastVerdict?.status ?? null,
      passedCount: result.lastVerdict?.passedCount ?? null,
      totalCount: result.lastVerdict?.totalCount ?? null,
    },
  };
}

async function adversaryNode(state) {
  console.error("\n=== NODE C: Adversary ===");

  // If the honest solver couldn't pass, the draft itself is likely broken —
  // treat that as feedback for the Architect instead of probing weakness.
  if (state.solverReport && !state.solverReport.ok) {
    const feedback = `Solver could not ACCEPTED the draft after ${state.solverReport.attempts} attempts (last status: ${state.solverReport.status}). Fix testCases expectedOutput, driverCode, or referenceSolutions so a correct solution can pass.`;
    console.error(`[adversary] skipping attack — ${feedback}`);
    return {
      adversaryReport: {
        skipped: true,
        brokeTests: true,
        reason: "solver_failed",
        feedbackForArchitect: feedback,
      },
      architectFeedback: feedback,
      revisionCount: (state.revisionCount ?? 0) + 1,
    };
  }

  const report = await runAdversary(state.problemDraft);
  const update = {
    adversaryReport: {
      brokeTests: report.brokeTests,
      attackStrategy: report.attackStrategy,
      expectedBreakDescription: report.expectedBreakDescription,
      verdictStatus: report.verdict?.status,
      feedbackForArchitect: report.feedbackForArchitect,
    },
  };

  if (report.brokeTests) {
    update.architectFeedback = report.feedbackForArchitect;
    update.revisionCount = (state.revisionCount ?? 0) + 1;
  }

  return update;
}

async function approveNode(state) {
  console.error("\n=== APPROVE: insert into Postgres ===");
  const draft = state.problemDraft;
  const baseSlug = slugify(draft.title) || "lab-problem";
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  await mkdir(CASES_DIR, { recursive: true });
  const casesPath = join(CASES_DIR, `${slug}.json`);
  await writeFile(casesPath, JSON.stringify(draft.testCases, null, 2), "utf8");

  const tagRows =
    draft.tagSlugs?.length > 0
      ? await db
          .select({ id: tags.id, slug: tags.slug })
          .from(tags)
          .where(inArray(tags.slug, draft.tagSlugs))
      : [];

  const [inserted] = await db
    .insert(problems)
    .values({
      title: draft.title,
      description: draft.description,
      difficulty: draft.difficulty,
      slug,
      visibility: draft.visibility ?? "PRIVATE",
      timeLimitMs: draft.timeLimitMs ?? 2000,
      memoryLimitMb: draft.memoryLimitMb ?? 256,
      sampleTestCases: draft.sampleTestCases,
      codeTemplates: draft.codeTemplates,
      driverCode: draft.driverCode,
      // Lab: local path (production uses S3 key via MCP create_problem)
      testCasesFileUrl: casesPath,
    })
    .returning({
      id: problems.id,
      title: problems.title,
      slug: problems.slug,
      difficulty: problems.difficulty,
      visibility: problems.visibility,
    });

  for (const tag of tagRows) {
    await db.insert(problemTags).values({
      problemId: inserted.id,
      tagId: tag.id,
    });
  }

  console.error(
    `[approve] inserted id=${inserted.id} slug=${inserted.slug} tags=${tagRows.map((t) => t.slug).join(",")}`
  );

  return {
    isApproved: true,
    insertedProblem: {
      ...inserted,
      tagsLinked: tagRows.map((t) => t.slug),
      testCasesFileUrl: casesPath,
    },
  };
}

// ── Routing ─────────────────────────────────────────────────────────────────

function afterAdversary(state) {
  const broke = state.adversaryReport?.brokeTests;
  if (broke && (state.revisionCount ?? 0) <= MAX_REVISIONS) {
    console.error(
      `[route] weak tests / broken draft → back to Architect (revision ${state.revisionCount}/${MAX_REVISIONS})`
    );
    return "architect";
  }
  if (broke) {
    console.error(
      `[route] still broken after ${MAX_REVISIONS} revisions — ending without approve`
    );
    return END;
  }
  console.error("[route] adversary failed to break tests → approve");
  return "approve";
}

function buildGraph() {
  return new StateGraph(LabState)
    .addNode("architect", architectNode)
    .addNode("solver", solverNode)
    .addNode("adversary", adversaryNode)
    .addNode("approve", approveNode)
    .addEdge(START, "architect")
    .addEdge("architect", "solver")
    .addEdge("solver", "adversary")
    .addConditionalEdges("adversary", afterAdversary, {
      architect: "architect",
      approve: "approve",
      [END]: END,
    })
    .addEdge("approve", END)
    .compile();
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: node ai-lab/04-multi-agent-lab.js "<topic>"');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — add it to backend/.env");
    process.exit(1);
  }

  const graph = buildGraph();
  const finalState = await graph.invoke({ topic });

  console.log(
    JSON.stringify(
      {
        topic: finalState.topic,
        isApproved: finalState.isApproved,
        revisionCount: finalState.revisionCount,
        problem: finalState.problemDraft
          ? {
              title: finalState.problemDraft.title,
              difficulty: finalState.problemDraft.difficulty,
              hiddenCases: finalState.problemDraft.testCases?.length,
              tags: finalState.problemDraft.tagSlugs,
            }
          : null,
        solverReport: finalState.solverReport,
        adversaryReport: finalState.adversaryReport,
        insertedProblem: finalState.insertedProblem,
      },
      null,
      2
    )
  );

  process.exit(finalState.isApproved ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}

export { buildGraph, LabState };
