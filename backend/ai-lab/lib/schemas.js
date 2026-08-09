import { z } from "zod";

const sampleTestCaseSchema = z.object({
  input: z.string().describe("Human-readable sample input shown in the UI"),
  output: z.string().describe("Human-readable sample output shown in the UI"),
  explanation: z
    .string()
    .nullable()
    .describe("Optional explanation of the sample; use null if none"),
});

const hiddenTestCaseSchema = z.object({
  id: z.number().int().positive().describe("1-based unique test case id"),
  input: z.string().describe("Raw stdin for the judge (may be multi-line)"),
  expectedOutput: z
    .string()
    .describe("Trimmed stdout the judge compares against"),
  explanation: z
    .string()
    .nullable()
    .describe("Optional note for humans; use null if none"),
});

/** Starter / driver / reference maps — only the two dry-run languages. */
const langPairSchema = z.object({
  javascript: z.string().describe("JavaScript source for this field"),
  python3: z.string().describe("Python 3 source for this field"),
});

/**
 * Zod schema matching create_problem's required fields, with tagSlugs
 * constrained to the live DB vocabulary and languages limited to
 * javascript + python3.
 *
 * @param {string[]} tagSlugs non-empty list of existing tag slugs
 */
export function buildProblemDraftSchema(tagSlugs) {
  if (!Array.isArray(tagSlugs) || tagSlugs.length === 0) {
    throw new Error(
      "buildProblemDraftSchema requires a non-empty tagSlugs vocabulary from the DB"
    );
  }

  const tagEnum = z.enum(/** @type {[string, ...string[]]} */ (tagSlugs));

  return z.object({
    title: z.string().describe("Problem title, e.g. 'Two Sum'"),
    description: z
      .string()
      .describe("Full problem statement (markdown or plain text)"),
    difficulty: z.enum(["Easy", "Medium", "Hard"]),
    sampleTestCases: z
      .array(sampleTestCaseSchema)
      .min(1)
      .describe("Visible UI examples"),
    testCases: z
      .array(hiddenTestCaseSchema)
      .min(1)
      .describe(
        "Hidden judge cases: { id, input, expectedOutput }. input = raw stdin; expectedOutput = trimmed stdout"
      ),
    codeTemplates: langPairSchema.describe(
      "Starter code the user edits (function/class stubs only)"
    ),
    driverCode: langPairSchema.describe(
      "Hidden I/O harness appended after user code — must match this project's stdin/stdout convention"
    ),
    referenceSolutions: langPairSchema.describe(
      "Correct solutions used to dry-run testCases before install"
    ),
    tagSlugs: z
      .array(tagEnum)
      .min(1)
      .describe("Existing tag slugs only — pick from the provided vocabulary"),
  });
}

/**
 * Drop null optional fields so create_problem validation stays happy.
 * @param {z.infer<ReturnType<typeof buildProblemDraftSchema>>} draft
 */
export function sanitizeProblemDraft(draft) {
  const dropNullExplanation = ({ explanation, ...rest }) =>
    explanation == null ? rest : { ...rest, explanation };

  return {
    ...draft,
    visibility: "PRIVATE",
    sampleTestCases: draft.sampleTestCases.map(dropNullExplanation),
    testCases: draft.testCases.map(dropNullExplanation),
  };
}
