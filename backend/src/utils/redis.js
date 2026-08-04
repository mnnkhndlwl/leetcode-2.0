import Redis from "ioredis";

// Read-only from the backend's perspective — results-consumer is the sole
// writer of contest:* keys. Used for the live leaderboard snapshot only;
// once a contest is FINISHED, reads come from Postgres instead.
export const redis = new Redis(process.env.REDIS_URL);
redis.on("error", (err) =>
  console.error("[redis] connection error:", err.message),
);
