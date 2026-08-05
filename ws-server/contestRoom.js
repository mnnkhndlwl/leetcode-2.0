import { inArray } from "drizzle-orm";
import { db } from "./db.js";
import { users } from "./schema.js";
import { publisher as redis } from "./redis.js";

const TOP_N = 50;
const BROADCAST_INTERVAL_MS = 10_000;

const roomName = (contestId) => `contest:${contestId}`;

async function hydrateUsernames(userIds) {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.username]));
}

// Top N + solved/penalty per entry. Two Redis round-trips total (ZREVRANGE,
// then one pipelined HMGET per member) regardless of N.
async function getTop50(contestId) {
  const entries = await redis.zrevrange(
    `contest:leaderboard:${contestId}`,
    0,
    TOP_N - 1,
    "WITHSCORES",
  );

  const userIds = [];
  for (let i = 0; i < entries.length; i += 2) userIds.push(entries[i]);
  if (!userIds.length) return [];

  const statsPipeline = redis.pipeline();
  for (const id of userIds) {
    statsPipeline.hmget(
      `contest:stats:${contestId}:${id}`,
      "solvedCount",
      "totalPenaltySeconds",
    );
  }
  const [usernames, statsResults] = await Promise.all([
    hydrateUsernames(userIds),
    statsPipeline.exec(),
  ]);

  return userIds.map((id, i) => {
    const [solvedCount, totalPenaltySeconds] = statsResults[i][1] ?? [];
    return {
      userId: id,
      username: usernames.get(id) ?? null,
      solvedCount: Number(solvedCount ?? 0),
      totalPenalty: Number(totalPenaltySeconds ?? 0),
    };
  });
}

// One-shot snapshot sent right after a client joins — so it isn't waiting
// up to BROADCAST_INTERVAL_MS for first paint.
export async function sendContestSnapshot(socket, contestId) {
  const top50 = await getTop50(contestId);
  socket.emit("contest:leaderboard", { top50, updatedAt: Date.now() });

  if (!top50.some((e) => e.userId === socket.user.id)) {
    const rank = await redis.zrevrank(
      `contest:leaderboard:${contestId}`,
      socket.user.id,
    );
    socket.emit("contest:rank", { rank: rank === null ? null : rank + 1 });
  }
}

// Every socket's rank can shift on any single AC (everyone below the old/new
// position moves by one) — there's no way to know "whose rank changed" from
// the dirty set alone, so this has to re-derive rank for every connected
// viewer outside the top 50 each tick. The one thing that matters for cost
// is batching those lookups into a single pipelined round-trip rather than
// awaiting one ZREVRANK per socket in a loop.
export function startContestBroadcastTicker(io) {
  return setInterval(async () => {
    const rooms = [...io.sockets.adapter.rooms.keys()].filter((r) =>
      r.startsWith("contest:"),
    );

    for (const room of rooms) {
      const contestId = room.slice("contest:".length);
      const dirtyKey = `contest:dirty:${contestId}`;

      try {
        const dirtyCount = await redis.scard(dirtyKey);
        if (dirtyCount === 0) continue;

        const top50 = await getTop50(contestId);
        io.to(room).emit("contest:leaderboard", { top50, updatedAt: Date.now() });

        const topUserIds = new Set(top50.map((e) => e.userId));
        const socketsInRoom = await io.in(room).fetchSockets();
        const outsideTop = socketsInRoom.filter((s) => !topUserIds.has(s.user.id));

        if (outsideTop.length) {
          const rankPipeline = redis.pipeline();
          for (const s of outsideTop) {
            rankPipeline.zrevrank(`contest:leaderboard:${contestId}`, s.user.id);
          }
          const rankResults = await rankPipeline.exec();
          outsideTop.forEach((s, i) => {
            const rank = rankResults[i][1];
            s.emit("contest:rank", { rank: rank === null ? null : rank + 1 });
          });
        }

        await redis.del(dirtyKey);
      } catch (err) {
        console.error(`[contest-ticker] room=${room} failed:`, err.message);
      }
    }
  }, BROADCAST_INTERVAL_MS);
}

export { roomName };
