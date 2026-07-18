import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import postgres from "postgres";
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to db-explorer-mcp/.env");
}

const SUPPORTED_LANGUAGES = ["python3", "javascript", "cpp", "java", "go"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const VISIBILITIES = ["PUBLIC", "PRIVATE"];

const queryClient = postgres(process.env.DATABASE_URL);

const server = new Server(
    { name: "db-explorer", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

function slugify(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 255);
}

/**
 * Validate create_problem args before any DB write.
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 */
function validateCreateProblem(args) {
    const errors = [];
    const a = args ?? {};

    const title = typeof a.title === "string" ? a.title.trim() : "";
    const description = typeof a.description === "string" ? a.description.trim() : "";
    if (!title) errors.push("title is required (non-empty string)");
    if (!description) errors.push("description is required (non-empty string)");

    const difficulty = a.difficulty;
    if (!DIFFICULTIES.includes(difficulty)) {
        errors.push(`difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
    }

    let slug = typeof a.slug === "string" ? a.slug.trim() : "";
    if (!slug && title) slug = slugify(title);
    if (!slug) {
        errors.push("slug is required (or provide a title to auto-generate one)");
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        errors.push("slug must be kebab-case (lowercase letters, numbers, hyphens)");
    }

    const visibility = a.visibility ?? "PRIVATE";
    if (!VISIBILITIES.includes(visibility)) {
        errors.push(`visibility must be one of: ${VISIBILITIES.join(", ")}`);
    }

    const timeLimitMs = a.timeLimitMs ?? 2000;
    const memoryLimitMb = a.memoryLimitMb ?? 256;
    if (!Number.isInteger(timeLimitMs) || timeLimitMs < 100 || timeLimitMs > 30000) {
        errors.push("timeLimitMs must be an integer between 100 and 30000");
    }
    if (!Number.isInteger(memoryLimitMb) || memoryLimitMb < 16 || memoryLimitMb > 1024) {
        errors.push("memoryLimitMb must be an integer between 16 and 1024");
    }

    // sampleTestCases: [{ input, output, explanation? }, ...]
    const sampleTestCases = a.sampleTestCases;
    if (!Array.isArray(sampleTestCases) || sampleTestCases.length === 0) {
        errors.push("sampleTestCases must be a non-empty array");
    } else {
        sampleTestCases.forEach((tc, i) => {
            if (!tc || typeof tc !== "object") {
                errors.push(`sampleTestCases[${i}] must be an object`);
                return;
            }
            if (typeof tc.input !== "string" || !tc.input.trim()) {
                errors.push(`sampleTestCases[${i}].input must be a non-empty string`);
            }
            if (typeof tc.output !== "string" || !tc.output.trim()) {
                errors.push(`sampleTestCases[${i}].output must be a non-empty string`);
            }
            if (tc.explanation != null && typeof tc.explanation !== "string") {
                errors.push(`sampleTestCases[${i}].explanation must be a string if provided`);
            }
        });
    }

    // codeTemplates: { python3?: string, javascript?: string, ... }
    const codeTemplates = a.codeTemplates;
    if (!codeTemplates || typeof codeTemplates !== "object" || Array.isArray(codeTemplates)) {
        errors.push("codeTemplates must be an object keyed by language");
    } else {
        const keys = Object.keys(codeTemplates);
        if (keys.length === 0) {
            errors.push("codeTemplates must include at least one language");
        }
        for (const lang of keys) {
            if (!SUPPORTED_LANGUAGES.includes(lang)) {
                errors.push(
                    `codeTemplates.${lang}: unsupported language (use: ${SUPPORTED_LANGUAGES.join(", ")})`
                );
            } else if (typeof codeTemplates[lang] !== "string" || !codeTemplates[lang].trim()) {
                errors.push(`codeTemplates.${lang} must be a non-empty string`);
            }
        }
    }

    // driverCode: same shape; every template language must have a driver
    const driverCode = a.driverCode;
    if (!driverCode || typeof driverCode !== "object" || Array.isArray(driverCode)) {
        errors.push("driverCode must be an object keyed by language");
    } else if (codeTemplates && typeof codeTemplates === "object" && !Array.isArray(codeTemplates)) {
        for (const lang of Object.keys(codeTemplates)) {
            if (!SUPPORTED_LANGUAGES.includes(lang)) continue;
            if (typeof driverCode[lang] !== "string" || !driverCode[lang].trim()) {
                errors.push(`driverCode.${lang} is required to match codeTemplates.${lang}`);
            }
        }
        for (const lang of Object.keys(driverCode)) {
            if (!SUPPORTED_LANGUAGES.includes(lang)) {
                errors.push(
                    `driverCode.${lang}: unsupported language (use: ${SUPPORTED_LANGUAGES.join(", ")})`
                );
            }
        }
    }

    const testCasesFileUrl =
        a.testCasesFileUrl == null
            ? null
            : typeof a.testCasesFileUrl === "string"
              ? a.testCasesFileUrl.trim() || null
              : null;
    if (a.testCasesFileUrl != null && testCasesFileUrl === null && typeof a.testCasesFileUrl !== "string") {
        errors.push("testCasesFileUrl must be a string if provided");
    }

    const createdByUserId =
        a.createdByUserId == null
            ? null
            : typeof a.createdByUserId === "string"
              ? a.createdByUserId.trim()
              : null;
    if (a.createdByUserId != null) {
        if (
            typeof a.createdByUserId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdByUserId)
        ) {
            errors.push("createdByUserId must be a valid UUID if provided");
        }
    }

    const tagSlugs = a.tagSlugs ?? [];
    if (!Array.isArray(tagSlugs)) {
        errors.push("tagSlugs must be an array of tag slug strings");
    } else {
        tagSlugs.forEach((s, i) => {
            if (typeof s !== "string" || !s.trim()) {
                errors.push(`tagSlugs[${i}] must be a non-empty string`);
            }
        });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            title,
            description,
            difficulty,
            slug,
            visibility,
            timeLimitMs,
            memoryLimitMb,
            sampleTestCases,
            codeTemplates,
            driverCode,
            testCasesFileUrl,
            createdByUserId,
            tagSlugs: tagSlugs.map((s) => s.trim()),
        },
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
                    "Architect and install a new coding problem into the platform. Validates title, slug uniqueness, difficulty, sampleTestCases, codeTemplates, and driverCode before INSERT. Defaults visibility to PRIVATE so drafts are not public until reviewed. Optional tagSlugs link existing tags.",
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
                                "Visible examples shown to the user. Each item: { input, output, explanation? }",
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
                        codeTemplates: {
                            type: "object",
                            description:
                                "Starter code per language. Keys must be from: python3, javascript, cpp, java, go. Example: { \"python3\": \"class Solution:\\n    def twoSum(self, nums, target):\\n        pass\", \"javascript\": \"var twoSum = function(nums, target) {}\" }",
                            additionalProperties: { type: "string" },
                        },
                        driverCode: {
                            type: "object",
                            description:
                                "Hidden I/O harness appended after user code for each language in codeTemplates. Same language keys required.",
                            additionalProperties: { type: "string" },
                        },
                        testCasesFileUrl: {
                            type: "string",
                            description:
                                "Optional S3 key for hidden judge cases, e.g. 'test-cases/two-sum/cases.json'",
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
                        "codeTemplates",
                        "driverCode",
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

            const stats = {
                profile,
                submissionsByStatus,
                problems: problemStats ?? { solved: 0, attempted: 0, unsolved: 0 },
            };

            return {
                content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
            };
        }

        if (name === "create_problem") {
            const parsed = validateCreateProblem(request.params.arguments);
            if (!parsed.ok) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    success: false,
                                    error: "Validation failed",
                                    details: parsed.errors,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                    isError: true,
                };
            }

            const v = parsed.value;

            const [existing] = await queryClient`
                SELECT id FROM problems WHERE slug = ${v.slug} LIMIT 1
            `;
            if (existing) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    success: false,
                                    error: `Slug already exists: "${v.slug}"`,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                    isError: true,
                };
            }

            if (v.createdByUserId) {
                const [author] = await queryClient`
                    SELECT id FROM users WHERE id = ${v.createdByUserId} AND "isDeleted" = false
                `;
                if (!author) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(
                                    {
                                        success: false,
                                        error: `createdByUserId not found: ${v.createdByUserId}`,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                        isError: true,
                    };
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
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(
                                    {
                                        success: false,
                                        error: "Unknown tag slugs",
                                        details: missing,
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                        isError: true,
                    };
                }
            }

            const inserted = await queryClient.begin(async (sql) => {
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
                        ${v.testCasesFileUrl},
                        ${v.createdByUserId}
                    )
                    RETURNING id, title, slug, difficulty, visibility, "createdAt"
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

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                success: true,
                                problem: inserted,
                                tagsLinked: tagRows.map((t) => t.slug),
                                note: !v.testCasesFileUrl
                                    ? "No testCasesFileUrl set — submissions cannot be judged until hidden cases are uploaded to S3 and this field is updated."
                                    : undefined,
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
