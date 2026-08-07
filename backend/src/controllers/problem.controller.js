import { HTTP } from "../constants/http.js";
import { searchProblems } from "../utils/problemSearch.js";
import { db } from "../db/index.js";
import { problems } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const getProblems = async (req, res) => {
  const { q, limit } = req.validatedQuery;
  const list = await searchProblems(q, { limit });
  return res.status(HTTP.OK).json(list);
};

export const getProblem = async (req, res) => {
  const { slug } = req.params;

  const [problem] = await db
    .select({
      id: problems.id,
      title: problems.title,
      description: problems.description,
      difficulty: problems.difficulty,
      slug: problems.slug,
      visibility: problems.visibility,
      timeLimitMs: problems.timeLimitMs,
      memoryLimitMb: problems.memoryLimitMb,
      sampleTestCases: problems.sampleTestCases,
      totalSubmissions: problems.totalSubmissions,
      totalAccepted: problems.totalAccepted,
      codeTemplates: problems.codeTemplates,
      driverCode: problems.driverCode,
      createdAt: problems.createdAt,
      updatedAt: problems.updatedAt,
    })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(1);

  if (!problem) {
    return res.status(HTTP.NOT_FOUND).json({ error: "Problem not found" });
  }

  if (problem.visibility !== "PUBLIC") {
    return res.status(HTTP.FORBIDDEN).json({ error: "Problem is not publicly available" });
  }

  return res.status(HTTP.OK).json(problem);
};
