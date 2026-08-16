import { z } from "zod";
import { db } from "../db/index.js";
import { HTTP } from "../constants/http.js";
import { problems, userProblemStatus, contest, contestParticipants } from "../db/schema.js";
import { asc, and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

function requireUserId(req) {
  const userId = req?.user?.id;
  if (!userId || typeof userId !== "string") {
    throw new Error("requireAuth middleware did not attach req.user.id");
  }
  return userId;
}

const problemStatusQuerySchema = z.object({
  status: z.enum(["SOLVED", "UNSOLVED"]).optional().default("UNSOLVED"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function getMyProblemStatus(req, res) {
  let parsed;
  try {
    parsed = problemStatusQuerySchema.parse(req.query);
  } catch (err) {
    return res.status(HTTP.BAD_REQUEST).json({
      error: "Invalid query parameters",
    });
  }

  const { status, limit } = parsed;
  const userId = requireUserId(req);

  const whereClause =
    status === "SOLVED"
      ? eq(userProblemStatus.status, "SOLVED")
      : // "UNSOLVED" means "not solved": includes both never-attempted (NULL)
        // and attempted-but-not-AC (ATTEMPTED/UNSOLVED).
        sql`${userProblemStatus.status} IS DISTINCT FROM 'SOLVED'`;

  const orderExpr =
    status === "SOLVED"
      ? userProblemStatus.solvedAt
      : userProblemStatus.lastAttemptedAt;

  const rows = await db
    .select({
      problemId: problems.id,
      slug: problems.slug,
      title: problems.title,
      rawStatus: userProblemStatus.status,
      solvedAt: userProblemStatus.solvedAt,
      lastAttemptedAt: userProblemStatus.lastAttemptedAt,
    })
    .from(problems)
    .leftJoin(
      userProblemStatus,
      and(
        eq(userProblemStatus.userId, userId),
        eq(userProblemStatus.problemId, problems.id)
      )
    )
    .where(
      and(
        eq(problems.visibility, "PUBLIC"),
        whereClause
      )
    )
    .orderBy(sql`${orderExpr} DESC`)
    .limit(limit);

  const normalized = rows.map((r) => ({
    problemId: r.problemId,
    slug: r.slug,
    title: r.title,
    status: r.rawStatus === "SOLVED" ? "SOLVED" : "UNSOLVED",
    solvedAt: r.solvedAt ?? null,
    lastAttemptedAt: r.lastAttemptedAt ?? null,
  }));

  return res.status(HTTP.OK).json(normalized);
}

export async function getMyContests(req, res) {
  const userId = requireUserId(req);

  const rows = await db
    .select({
      contestId: contest.id,
      slug: contest.slug,
      title: contest.title,
      status: contest.status,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      registeredUserId: contestParticipants.userId,
    })
    .from(contest)
    .leftJoin(
      contestParticipants,
      and(
        eq(contestParticipants.contestId, contest.id),
        eq(contestParticipants.userId, userId)
      )
    )
    .orderBy(asc(contest.startsAt));

  return res.status(HTTP.OK).json(
    rows.map((r) => ({
      contestId: r.contestId,
      slug: r.slug,
      title: r.title,
      status: r.status,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      registered: r.registeredUserId != null,
    }))
  );
}

