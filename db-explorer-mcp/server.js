import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import postgres from "postgres";
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { validateCreateProblem } from "./lib/validate-problem.js";
import { DRY_RUN_LANGUAGES, dryRunReference } from "./lib/dry-run.js";
import {
    createS3Client,
    uploadAndVerifyTestCases,
    deleteTestCases,
} from "./lib/s3-test-cases.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to db-explorer-mcp/.env");
}

const queryClient = postgres(process.env.DATABASE_URL);

const server = new Server(
    { name: "db-explorer", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

function errorResult(payload) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        isError: true,
    };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_submission_trends",
                description: "Get the count of submissions grouped by status (PENDING, SUCCESS, etc.)",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_recent_errors",
                description: "Get the last 5 failed submissions with their compile errors",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_user_stats",
                description:
                    "Get profile and submission stats for a user (solved count, submissions by status, ranking)",
                inputSchema: {
                    type: "object",
                    properties: {
                        user_id: { type: "string", description: "The UUID of the user" },
                    },
                    required: ["user_id"],
                },
            },
            {
                name: "create_problem",
                description:
                    "Architect and install a new coding problem. Validates fields, dry-runs referenceSolutions (javascript/python3) against hidden testCases + driverCode, uploads cases.json to S3 and verifies the round-trip, then INSERTs the problem with testCasesFileUrl set. Defaults visibility to PRIVATE. Do not pass testCasesFileUrl — it is assigned after upload.",
                inputSchema: {
                    type: "object",
                    properties: {
                        title: {
                            type: "string",
                            description: "Problem title, e.g. 'Two Sum'",
                        },
                        description: {
                            type: "string",
                            description: "Full problem statement (markdown/plain text)",
                        },
                        difficulty: {
                            type: "string",
                            enum: ["Easy", "Medium", "Hard"],
                            description: "Problem difficulty",
                        },
                        slug: {
                            type: "string",
                            description:
                                "URL slug (kebab-case). Auto-generated from title if omitted.",
                        },
                        visibility: {
                            type: "string",
                            enum: ["PUBLIC", "PRIVATE"],
                            description: "Defaults to PRIVATE for safe AI installs",
                        },
                        timeLimitMs: {
                            type: "integer",
                            description: "Judge time limit in ms (default 2000)",
                        },
                        memoryLimitMb: {
                            type: "integer",
                            description: "Judge memory limit in MB (default 256)",
                        },
                        sampleTestCases: {
                            type: "array",
                            description:
                                "Visible UI examples. Each item: { input, output, explanation? } (human-readable).",
                            items: {
                                type: "object",
                                properties: {
                                    input: { type: "string" },
                                    output: { type: "string" },
                                    explanation: { type: "string" },
                                },
                                required: ["input", "output"],
                            },
                        },
                        testCases: {
                            type: "array",
                            description:
                                "Hidden judge cases uploaded to S3. Each item: { id, input, expectedOutput, explanation? }. input = raw stdin; expectedOutput = trimmed stdout. NOT the same shape as sampleTestCases.",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "integer" },
                                    input: { type: "string" },
                                    expectedOutput: { type: "string" },
                                    explanation: { type: "string" },
                                },
                                required: ["id", "input", "expectedOutput"],
                            },
                        },
                        codeTemplates: {
                            type: "object",
                            description:
                                "Starter code per language. Keys: python3, javascript, cpp, java, go.",
                            additionalProperties: { type: "string" },
                        },
                        driverCode: {
                            type: "object",
                            description:
                                "Hidden I/O harness appended after user code. Must include every language in codeTemplates.",
                            additionalProperties: { type: "string" },
                        },
                        referenceSolutions: {
                            type: "object",
                            description:
                                "Correct solutions used to dry-run testCases locally before install. Must include at least javascript and/or python3 (with matching driverCode).",
                            additionalProperties: { type: "string" },
                        },
                        tagSlugs: {
                            type: "array",
                            items: { type: "string" },
                            description:
                                "Existing tag slugs to attach (e.g. ['array', 'hash-table']). Unknown slugs are rejected.",
                        },
                        createdByUserId: {
                            type: "string",
                            description: "Optional UUID of the authoring user",
                        },
                    },
                    required: [
                        "title",
                        "description",
                        "difficulty",
                        "sampleTestCases",
                        "testCases",
                        "codeTemplates",
                        "driverCode",
                        "referenceSolutions",
                    ],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

    try {
        if (name === "get_submission_trends") {
            const results = await queryClient`SELECT status, count(*) FROM submissions GROUP BY status`;
            return {
                content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
            };
        }

        if (name === "get_recent_errors") {
            const errors = await queryClient`
                SELECT id, "compileError" FROM submissions WHERE status = 'ERROR' LIMIT 5
            `;
            return {
                content: [{ type: "text", text: JSON.stringify(errors, null, 2) }],
            };
        }

        if (name === "get_user_stats") {
            const { user_id } = request.params.arguments ?? {};
            if (!user_id) {
                throw new Error("user_id is required");
            }

            const [profile] = await queryClient`
                SELECT id, username, email, role, ranking, "createdAt"
                FROM users
                WHERE id = ${user_id} AND "isDeleted" = false
            `;
            if (!profile) {
                throw new Error(`User not found: ${user_id}`);
            }

            const submissionsByStatus = await queryClient`
                SELECT status, count(*)::int AS count
                FROM submissions
                WHERE "userId" = ${user_id}
                GROUP BY status
            `;

            const [problemStats] = await queryClient`
                SELECT
                    count(*) FILTER (WHERE status = 'SOLVED')::int AS solved,
                    count(*) FILTER (WHERE status = 'ATTEMPTED')::int AS attempted,
                    count(*) FILTER (WHERE status = 'UNSOLVED')::int AS unsolved
                FROM "userProblemStatus"
                WHERE "userId" = ${user_id}
            `;

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                profile,
                                submissionsByStatus,
                                problems: problemStats ?? { solved: 0, attempted: 0, unsolved: 0 },
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        }

        if (name === "create_problem") {
            const parsed = validateCreateProblem(request.params.arguments);
            if (!parsed.ok) {
                return errorResult({
                    success: false,
                    error: "Validation failed",
                    details: parsed.errors,
                });
            }

            const v = parsed.value;

            const [existing] = await queryClient`
                SELECT id FROM problems WHERE slug = ${v.slug} LIMIT 1
            `;
            if (existing) {
                return errorResult({
                    success: false,
                    error: `Slug already exists: "${v.slug}"`,
                });
            }

            if (v.createdByUserId) {
                const [author] = await queryClient`
                    SELECT id FROM users WHERE id = ${v.createdByUserId} AND "isDeleted" = false
                `;
                if (!author) {
                    return errorResult({
                        success: false,
                        error: `createdByUserId not found: ${v.createdByUserId}`,
                    });
                }
            }

            let tagRows = [];
            if (v.tagSlugs.length > 0) {
                tagRows = await queryClient`
                    SELECT id, slug FROM tags WHERE slug IN ${queryClient(v.tagSlugs)}
                `;
                const found = new Set(tagRows.map((t) => t.slug));
                const missing = v.tagSlugs.filter((s) => !found.has(s));
                if (missing.length) {
                    return errorResult({
                        success: false,
                        error: "Unknown tag slugs",
                        details: missing,
                    });
                }
            }

            // ── Dry-run: reference + driver vs hidden cases (blocks install on failure)
            const dryRunResults = [];
            const langsToRun = DRY_RUN_LANGUAGES.filter(
                (lang) =>
                    typeof v.referenceSolutions[lang] === "string" &&
                    v.referenceSolutions[lang].trim() &&
                    typeof v.driverCode[lang] === "string" &&
                    v.driverCode[lang].trim()
            );

            for (const lang of langsToRun) {
                const result = await dryRunReference({
                    language: lang,
                    referenceSolution: v.referenceSolutions[lang],
                    driverCode: v.driverCode[lang],
                    testCases: v.testCases,
                    timeLimitMs: v.timeLimitMs,
                });
                dryRunResults.push(result);
            }

            const dryRunFailures = dryRunResults.filter((r) => !r.ok);
            if (dryRunFailures.length > 0) {
                return errorResult({
                    success: false,
                    error: "Dry-run failed — fix referenceSolutions, driverCode, or testCases and retry",
                    dryRun: dryRunFailures,
                });
            }

            // ── S3 upload + GetObject verify (before DB insert)
            let s3;
            let uploaded;
            try {
                s3 = createS3Client();
                uploaded = await uploadAndVerifyTestCases(s3, v.slug, v.testCases);
            } catch (err) {
                return errorResult({
                    success: false,
                    error: "S3 upload/verify failed",
                    details: err instanceof Error ? err.message : String(err),
                });
            }

            let inserted;
            try {
                inserted = await queryClient.begin(async (sql) => {
                    const [problem] = await sql`
                        INSERT INTO problems (
                            title,
                            description,
                            difficulty,
                            slug,
                            visibility,
                            "timeLimitMs",
                            "memoryLimitMb",
                            "sampleTestCases",
                            "codeTemplates",
                            "driverCode",
                            "testCasesFileUrl",
                            "createdByUserId"
                        ) VALUES (
                            ${v.title},
                            ${v.description},
                            ${v.difficulty},
                            ${v.slug},
                            ${v.visibility},
                            ${v.timeLimitMs},
                            ${v.memoryLimitMb},
                            ${v.sampleTestCases},
                            ${v.codeTemplates},
                            ${v.driverCode},
                            ${uploaded.key},
                            ${v.createdByUserId}
                        )
                        RETURNING id, title, slug, difficulty, visibility, "testCasesFileUrl", "createdAt"
                    `;

                    if (tagRows.length > 0) {
                        for (const tag of tagRows) {
                            await sql`
                                INSERT INTO "problemTags" ("problemId", "tagId")
                                VALUES (${problem.id}, ${tag.id})
                            `;
                        }
                    }

                    return problem;
                });
            } catch (err) {
                // Roll back orphaned S3 object if DB insert fails
                await deleteTestCases(s3, uploaded.key).catch(() => {});
                throw err;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                problem: inserted,
                                tagsLinked: tagRows.map((t) => t.slug),
                                s3: {
                                    key: uploaded.key,
                                    uri: uploaded.s3Uri,
                                    caseCount: uploaded.caseCount,
                                },
                                dryRun: dryRunResults.map((r) => ({
                                    language: r.language,
                                    passed: r.passed,
                                })),
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        }

        throw new Error(`Tool not found: ${name}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("DB Explorer MCP Server running on stdio");
