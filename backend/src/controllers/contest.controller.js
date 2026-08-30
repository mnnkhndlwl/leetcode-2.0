import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { contest, contestParticipants, contestProblems, problems, users } from "../db/schema.js";
import { HTTP } from "../constants/http.js";
import { CONTEST_STATUS } from "../constants/contest.js";
import { redis } from "../utils/redis.js";

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err) {
  return err?.code === PG_UNIQUE_VIOLATION || err?.cause?.code === PG_UNIQUE_VIOLATION;
}

async function findContestBySlug(slug, columns) {
  const [row] = await db
    .select(columns)
    .from(contest)
    .where(eq(contest.slug, slug))
    .limit(1);
  return row;
}

export const listContests = async (_req, res) => {
  const list = await db
    .select({
      id: contest.id,
      title: contest.title,
      slug: contest.slug,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      registrationStartsAt: contest.registrationStartsAt,
      registrationEndsAt: contest.registrationEndsAt,
      status: contest.status,
    })
    .from(contest)
    .orderBy(asc(contest.startsAt));

  return res.status(HTTP.OK).json(list);
};

export const getContest = async (req, res) => {
  const { slug } = req.params;

  const row = await findContestBySlug(slug, {
    id: contest.id,
    title: contest.title,
    description: contest.description,
    slug: contest.slug,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    registrationStartsAt: contest.registrationStartsAt,
    registrationEndsAt: contest.registrationEndsAt,
    status: contest.status,
  });

  if (!row) {
    return res.status(HTTP.NOT_FOUND).json({ error: "Contest not found" });
  }

  // Problems stay hidden until the contest actually starts — no early peeking
  // at what's coming while it's still DRAFT.
  const contestProblemRows =
    row.status === CONTEST_STATUS.DRAFT
      ? []
      : await db
          .select({
            id: problems.id,
            slug: problems.slug,
            title: problems.title,
            difficulty: problems.difficulty,
            points: contestProblems.points,
            displayOrder: contestProblems.displayOrder,
          })
          .from(contestProblems)
          .innerJoin(problems, eq(problems.id, contestProblems.problemId))
          .where(
            and(
              eq(contestProblems.contestId, row.id),
              eq(contestProblems.isVisible, true),
            ),
          )
          .orderBy(asc(contestProblems.displayOrder));

  return res.status(HTTP.OK).json({ ...row, problems: contestProblemRows });
};

export const registerForContest = async (req, res) => {
  const { id: userId } = req.user;
  const { slug } = req.params;

  const row = await findContestBySlug(slug, {
    id: contest.id,
    registrationStartsAt: contest.registrationStartsAt,
    registrationEndsAt: contest.registrationEndsAt,
  });

  if (!row) {
    return res.status(HTTP.NOT_FOUND).json({ error: "Contest not found" });
  }

  const now = new Date();
  if (now < row.registrationStartsAt || now > row.registrationEndsAt) {
    return res
      .status(HTTP.FORBIDDEN)
      .json({ error: "Registration is not open for this contest" });
  }

  try {
    await db.insert(contestParticipants).values({ contestId: row.id, userId });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(HTTP.OK).json({ registered: true, alreadyRegistered: true });
    }
    throw err;
  }

  return res.status(HTTP.CREATED).json({ registered: true });
};

// Live snapshot from Redis while the contest is RUNNING (the ws-server
// ticker drives ongoing updates for connected clients); Postgres
// (contestParticipants, written by the finalize_contest() DB trigger)
// otherwise. This endpoint is only the initial-load / no-websocket path.
export const getLeaderboard = async (req, res) => {
  const { slug } = req.params;

  const row = await findContestBySlug(slug, {
    id: contest.id,
    status: contest.status,
  });

  if (!row) {
    return res.status(HTTP.NOT_FOUND).json({ error: "Contest not found" });
  }

  if (row.status === CONTEST_STATUS.RUNNING) {
    const entries = await redis.zrevrange(
      `contest:leaderboard:${row.id}`,
      0,
      49,
      "WITHSCORES",
    );

    const userIds = [];
    for (let i = 0; i < entries.length; i += 2) userIds.push(entries[i]);

    const [usernameRows, stats] = await Promise.all([
      userIds.length
        ? db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.id, userIds))
        : [],
      Promise.all(
        userIds.map((id) =>
          redis.hmget(
            `contest:stats:${row.id}:${id}`,
            "solvedCount",
            "totalPenaltySeconds",
          ),
        ),
      ),
    ]);
    const usernameById = new Map(usernameRows.map((u) => [u.id, u.username]));

    const leaderboard = userIds.map((id, i) => ({
      userId: id,
      username: usernameById.get(id) ?? null,
      solvedCount: Number(stats[i]?.[0] ?? 0),
      totalPenalty: Number(stats[i]?.[1] ?? 0),
    }));

    return res.status(HTTP.OK).json({ status: row.status, leaderboard });
  }

  const leaderboard = await db
    .select({
      userId: contestParticipants.userId,
      username: users.username,
      totalScore: contestParticipants.totalScore,
      totalPenalty: contestParticipants.totalPenalty,
      rank: contestParticipants.rank,
    })
    .from(contestParticipants)
    .innerJoin(users, eq(users.id, contestParticipants.userId))
    .where(eq(contestParticipants.contestId, row.id))
    .orderBy(asc(contestParticipants.rank));

  return res.status(HTTP.OK).json({ status: row.status, leaderboard });
};
