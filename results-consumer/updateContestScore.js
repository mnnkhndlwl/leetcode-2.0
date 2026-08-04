import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { contest } from "./schema.js";

const PENALTY_PER_WRONG = 300;
const SOLVED_SCORE_WEIGHT = 1e7;

// How long the live leaderboard keys stick around after the contest ends —
// lets stragglers still see the "final" live board for a while. Not a
// correctness mechanism: Postgres (via the finalize_contest() DB trigger)
// is the durable result regardless of when these keys expire.
const KEY_TTL_AFTER_END_MS = 4 * 60 * 60 * 1000;

/** @type {Map<string, { startsAtEpochMs: number, endsAtEpochMs: number, expireAtMs: number }>} */
const contestMetaCache = new Map();

/**
 * Get/cache contest:meta:<contestId> once per contest per process.
 * If Redis is empty, SELECT from contest and HSET (TTL'd — see KEY_TTL_AFTER_END_MS).
 */
async function getContestMeta(contestId, redis) {
  const cached = contestMetaCache.get(contestId);
  if (cached) return cached;

  const key = `contest:meta:${contestId}`;
  const existing = await redis.hgetall(key);
  if (existing?.startsAtEpochMs) {
    const meta = {
      startsAtEpochMs: Number(existing.startsAtEpochMs),
      endsAtEpochMs: Number(existing.endsAtEpochMs),
      expireAtMs: Number(existing.endsAtEpochMs) + KEY_TTL_AFTER_END_MS,
    };
    contestMetaCache.set(contestId, meta);
    return meta;
  }

  const [row] = await db
    .select({ startsAt: contest.startsAt, endsAt: contest.endsAt })
    .from(contest)
    .where(eq(contest.id, contestId))
    .limit(1);

  if (!row) {
    throw new Error(`Contest not found: ${contestId}`);
  }

  const endsAtEpochMs = new Date(row.endsAt).getTime();
  const meta = {
    startsAtEpochMs: new Date(row.startsAt).getTime(),
    endsAtEpochMs,
    expireAtMs: endsAtEpochMs + KEY_TTL_AFTER_END_MS,
  };

  await redis
    .multi()
    .hset(key, {
      startsAtEpochMs: String(meta.startsAtEpochMs),
      endsAtEpochMs: String(meta.endsAtEpochMs),
    })
    .pexpireat(key, meta.expireAtMs)
    .exec();
  contestMetaCache.set(contestId, meta);
  return meta;
}

/**
 * Update Redis contest leaderboard state for a single verdict.
 * First-AC only. Penalty = (# wrong submits before this AC) * 300 — no elapsed-time component.
 *
 * @param {{ contestId: string, problemId: string, userId: string, createdAt?: Date|string, status: string }} params
 * @param {import("ioredis").default} redis
 */
export async function updateContestScore(
  { contestId, problemId, userId, status },
  redis,
) {
  const meta = await getContestMeta(contestId, redis);

  const statsKey = `contest:stats:${contestId}:${userId}`;
  const leaderboardKey = `contest:leaderboard:${contestId}`;
  const dirtyKey = `contest:dirty:${contestId}`;
  const statusField = `problem:${problemId}:status`;
  const failsField = `problem:${problemId}:fails`;

  const existingStatus = await redis.hget(statsKey, statusField);
  if (existingStatus === "AC") return;

  if (status === "ACCEPTED") {
    // fails were incremented on prior non-AC verdicts for this problem
    const fails = Number((await redis.hget(statsKey, failsField)) ?? 0);
    const penalty = fails * PENALTY_PER_WRONG;

    const results = await redis
      .multi()
      .hincrby(statsKey, "solvedCount", 1)
      .hincrbyfloat(statsKey, "totalPenaltySeconds", penalty)
      .hset(statsKey, statusField, "AC")
      .sadd(dirtyKey, userId)
      .pexpireat(statsKey, meta.expireAtMs)
      .pexpireat(dirtyKey, meta.expireAtMs)
      .exec();

    const solvedCount = Number(results[0][1]);
    const totalPenaltySeconds = Number(results[1][1]);
    const score = solvedCount * SOLVED_SCORE_WEIGHT - totalPenaltySeconds;

    await redis
      .multi()
      .zadd(leaderboardKey, score, userId)
      .pexpireat(leaderboardKey, meta.expireAtMs)
      .exec();
    return;
  }

  // WA / TLE / RE / MLE / etc.
  await redis
    .multi()
    .hincrby(statsKey, failsField, 1)
    .sadd(dirtyKey, userId)
    .pexpireat(statsKey, meta.expireAtMs)
    .pexpireat(dirtyKey, meta.expireAtMs)
    .exec();
}
