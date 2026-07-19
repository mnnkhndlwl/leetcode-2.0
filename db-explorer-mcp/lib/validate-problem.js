import { DRY_RUN_LANGUAGES } from "./dry-run.js";

export const SUPPORTED_LANGUAGES = ["python3", "javascript", "cpp", "java", "go"];
export const DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const VISIBILITIES = ["PUBLIC", "PRIVATE"];

export function slugify(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 255);
}

/**
 * Validate create_problem args before any S3/DB write.
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 */
export function validateCreateProblem(args) {
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

    // sampleTestCases: UI examples [{ input, output, explanation? }, ...]
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

    // Hidden judge cases — same shape as S3 / judge-worker
    const testCases = a.testCases;
    if (!Array.isArray(testCases) || testCases.length === 0) {
        errors.push(
            "testCases is required: non-empty array of { id, input, expectedOutput } (judge stdin/stdout format)"
        );
    } else {
        const seenIds = new Set();
        testCases.forEach((tc, i) => {
            if (!tc || typeof tc !== "object") {
                errors.push(`testCases[${i}] must be an object`);
                return;
            }
            if (!Number.isInteger(tc.id) || tc.id < 1) {
                errors.push(`testCases[${i}].id must be a positive integer`);
            } else if (seenIds.has(tc.id)) {
                errors.push(`testCases[${i}].id ${tc.id} is duplicated`);
            } else {
                seenIds.add(tc.id);
            }
            if (typeof tc.input !== "string") {
                errors.push(`testCases[${i}].input must be a string (raw stdin; may be multi-line)`);
            }
            if (typeof tc.expectedOutput !== "string") {
                errors.push(
                    `testCases[${i}].expectedOutput must be a string (trimmed stdout the judge compares)`
                );
            }
            // Catch common mix-up with sampleTestCases shape
            if (tc.output != null && tc.expectedOutput == null) {
                errors.push(
                    `testCases[${i}]: use expectedOutput (not output) — this is the hidden judge format`
                );
            }
            if (tc.explanation != null && typeof tc.explanation !== "string") {
                errors.push(`testCases[${i}].explanation must be a string if provided`);
            }
        });
    }

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

    // referenceSolutions: at least one dry-runnable language with matching driver
    const referenceSolutions = a.referenceSolutions;
    if (!referenceSolutions || typeof referenceSolutions !== "object" || Array.isArray(referenceSolutions)) {
        errors.push(
            `referenceSolutions is required: object with at least one of ${DRY_RUN_LANGUAGES.join(", ")} containing a correct solution used to dry-run testCases`
        );
    } else {
        const dryRunKeys = Object.keys(referenceSolutions).filter((k) => DRY_RUN_LANGUAGES.includes(k));
        if (dryRunKeys.length === 0) {
            errors.push(
                `referenceSolutions must include at least one dry-run language: ${DRY_RUN_LANGUAGES.join(", ")}`
            );
        }
        for (const lang of Object.keys(referenceSolutions)) {
            if (!SUPPORTED_LANGUAGES.includes(lang)) {
                errors.push(`referenceSolutions.${lang}: unsupported language`);
            } else if (
                typeof referenceSolutions[lang] !== "string" ||
                !referenceSolutions[lang].trim()
            ) {
                errors.push(`referenceSolutions.${lang} must be a non-empty string`);
            } else if (
                DRY_RUN_LANGUAGES.includes(lang) &&
                driverCode &&
                typeof driverCode === "object" &&
                (typeof driverCode[lang] !== "string" || !driverCode[lang].trim())
            ) {
                errors.push(
                    `referenceSolutions.${lang} requires driverCode.${lang} for dry-run validation`
                );
            }
        }
    }

    if (a.testCasesFileUrl != null) {
        errors.push(
            "testCasesFileUrl must not be set by the agent — it is assigned after S3 upload of testCases"
        );
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

    // Normalize hidden cases for S3 (keep optional explanation)
    const normalizedCases = testCases.map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        ...(typeof tc.explanation === "string" ? { explanation: tc.explanation } : {}),
    }));

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
            testCases: normalizedCases,
            codeTemplates,
            driverCode,
            referenceSolutions,
            createdByUserId,
            tagSlugs: tagSlugs.map((s) => s.trim()),
        },
    };
}
