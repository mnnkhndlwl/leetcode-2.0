/**
 * Contest concurrency/latency load test.
 *
 * Docker isn't installed on dev machines here, so judge-worker can't actually
 * execute code — a "real" end-to-end load test (HTTP submit -> SQS -> Docker
 * -> verdict) isn't runnable. This instead stresses the parts that are
 * actually contest-specific and actually matter under concurrency:
 *
 *   1. Bulk-create N synthetic users directly in Postgres (shared bcrypt hash,
 *      batched insert — bcrypt cost isn't what we're measuring) and mint
 *      their JWTs directly, skipping the signup HTTP round-trip.
 *   2. POST /contests/:slug/register — real HTTP, under concurrency.
 *   3. updateContestScore() — the exact Redis pipeline results-consumer runs
 *      per verdict — called directly, under concurrency, bypassing SQS/Docker
 *      entirely since that infra isn't what's being tested.
 *   3b. Bulk-insert matching `submissions` rows so the Postgres
 *      finalize_contest() trigger has real data if you finalize afterward.
 *   4. GET /contests/:slug/leaderboard — real HTTP, under concurrency.
 *   5. Real Socket.IO connections doing watch:contest — snapshot latency on
 *      connect, then fanout latency across all of them on the next broadcast
 *      tick after one more score change.
 *
 * Usage (from backend/):
 *   node scripts/load-test-contest.js [--users 1000] [--concurrency 100]
 *     [--reads 500] [--ws-clients 200] [--base-url http://localhost:3000]
 *     [--ws-url http://localhost:3001] [--keep]
 *
 * Requires: backend running at --base-url, ws-server running at --ws-url,
 * Redis reachable at REDIS_URL, at least 2 problems already seeded.
 */
import "@dotenvx/dotenvx/config";
import { performance } from "node:perf_hooks";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import { io as ioClient } from "socket.io-client";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";

import { db } from "../src/db/index.js";
import { users, contest, contestProblems, contestParticipants, submissions, problems } from "../src/db/schema.js";
import { updateContestScore } from "../../results-consumer/updateContestScore.js";

// ── CLI args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const opts = {
    users: 1000,
    concurrency: 100,
    reads: 500,
    wsClients: 200,
    baseUrl: "http://localhost:3000",
    wsUrl: "http://localhost:3001",
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--users") opts.users = Number(argv[++i]);
    else if (a === "--concurrency") opts.concurrency = Number(argv[++i]);
    else if (a === "--reads") opts.reads = Number(argv[++i]);
    else if (a === "--ws-clients") opts.wsClients = Number(argv[++i]);
    else if (a === "--base-url") opts.baseUrl = argv[++i];
    else if (a === "--ws-url") opts.wsUrl = argv[++i];
    else if (a === "--keep") opts.keep = true;
  }
  return opts;
}

// ── Concurrency-limited runner + reporting ──────────────────────────────────

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const wallStart = performance.now();

  async function runOne() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const start = performance.now();
      try {
        await worker(items[i], i);
        results[i] = { ok: true, ms: performance.now() - start };
      } catch (err) {
        results[i] = {
          ok: false,
          ms: performance.now() - start,
          error: err?.message ?? String(err),
        };
      }
    }
  }

  const pool = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runOne(),
  );
  await Promise.all(pool);
  return { results, wallMs: performance.now() - wallStart };
}

function percentile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function report(name, { results, wallMs }) {
  const oks = results.filter((r) => r.ok);
  const errs = results.filter((r) => !r.ok);
  const durations = oks.map((r) => r.ms).sort((a, b) => a - b);
  const throughput = results.length / (wallMs / 1000);

  console.log(`\n── ${name} ──`);
  console.log(
    `  total=${results.length}  ok=${oks.length}  errors=${errs.length}  wall=${(wallMs / 1000).toFixed(2)}s  throughput=${throughput.toFixed(1)}/s`,
  );
  console.log(
    `  latency(ms): min=${durations[0]?.toFixed(1) ?? "n/a"}  p50=${percentile(durations, 0.5)?.toFixed(1) ?? "n/a"}  p95=${percentile(durations, 0.95)?.toFixed(1) ?? "n/a"}  p99=${percentile(durations, 0.99)?.toFixed(1) ?? "n/a"}  max=${durations[durations.length - 1]?.toFixed(1) ?? "n/a"}`,
  );
  if (errs.length) {
    console.log(
      `  sample errors: ${errs.slice(0, 3).map((e) => e.error).join(" | ")}`,
    );
  }

  return {
    name,
    total: results.length,
    ok: oks.length,
    errors: errs.length,
    throughput,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
  };
}

// ── Setup ────────────────────────────────────────────────────────────────

async function createEphemeralContest() {
  const seedProblems = await db
    .select({ id: problems.id, slug: problems.slug, difficulty: problems.difficulty })
    .from(problems)
    .limit(2);

  if (seedProblems.length < 1) {
    throw new Error("Need at least 1 seeded problem in `problems` to run this load test");
  }

  const [row] = await db.execute(sql`
    insert into contest (title, description, slug, "startsAt", "endsAt", "registrationStartsAt", "registrationEndsAt", status)
    values (
      'Load Test Contest',
      'Ephemeral contest created by scripts/load-test-contest.js — safe to delete.',
      ${`load-test-contest-${Date.now()}`},
      now() - interval '5 minutes',
      now() + interval '2 hours',
      now() - interval '10 minutes',
      now() + interval '2 hours',
      'RUNNING'
    )
    returning id, slug
  `).then((r) => r.rows ?? r);

  for (let i = 0; i < seedProblems.length; i++) {
    await db.insert(contestProblems).values({
      contestId: row.id,
      problemId: seedProblems[i].id,
      displayOrder: i,
      points: 100,
    });
  }

  return { contestId: row.id, contestSlug: row.slug, problems: seedProblems };
}

async function createSyntheticUsers(count) {
  const sharedHash = await bcrypt.hash("LoadTest!2026", 4); // low cost — not benchmarking bcrypt
  const stamp = Date.now();
  const rows = Array.from({ length: count }, (_, i) => ({
    username: `loadtest_${stamp}_${i}`,
    email: `loadtest_${stamp}_${i}@loadtest.local`,
    passwordHash: sharedHash,
  }));

  const created = [];
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const inserted = await db
      .insert(users)
      .values(chunk)
      .returning({ id: users.id, username: users.username });
    created.push(...inserted);
  }

  const withTokens = created.map((u) => ({
    ...u,
    token: jwt.sign({ id: u.id, username: u.username, role: "USER" }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    }),
  }));
  return withTokens;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log(
    `Contest load test — users=${opts.users} concurrency=${opts.concurrency} reads=${opts.reads} wsClients=${opts.wsClients}`,
  );
  console.log(`  base-url=${opts.baseUrl}  ws-url=${opts.wsUrl}\n`);

  const redis = new Redis(process.env.REDIS_URL);
  const summary = [];
  let ctx = null;

  try {
    console.log("Setting up ephemeral contest + synthetic users…");
    const setupStart = performance.now();
    const { contestId, contestSlug, problems: contestProblemsRows } = await createEphemeralContest();
    const virtualUsers = await createSyntheticUsers(opts.users);
    ctx = { contestId, contestSlug, contestProblemsRows, virtualUsers };
    console.log(
      `  contest=${contestSlug}  problems=${contestProblemsRows.map((p) => p.slug).join(",")}  users=${virtualUsers.length}  (${((performance.now() - setupStart) / 1000).toFixed(2)}s)`,
    );

    // 1. Registration burst — real HTTP
    summary.push(
      report(
        "Registration (POST /contests/:slug/register)",
        await runWithConcurrency(
          virtualUsers,
          async (u) => {
            const res = await fetch(`${opts.baseUrl}/contests/${contestSlug}/register`, {
              method: "POST",
              headers: { Authorization: `Bearer ${u.token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
          opts.concurrency,
        ),
      ),
    );

    // 2. Scoring burst — the actual contest-scoring hot path (Redis), bypassing
    //    SQS/Docker entirely. One ACCEPTED event per (user, contest problem).
    const scoringJobs = [];
    for (const u of virtualUsers) {
      for (const p of contestProblemsRows) {
        scoringJobs.push({ userId: u.id, problemId: p.id });
      }
    }
    summary.push(
      report(
        `Scoring — updateContestScore() (${scoringJobs.length} verdicts)`,
        await runWithConcurrency(
          scoringJobs,
          (job) =>
            updateContestScore(
              { contestId, problemId: job.problemId, userId: job.userId, status: "ACCEPTED" },
              redis,
            ),
          opts.concurrency,
        ),
      ),
    );

    // 2b. Matching submissions rows so finalize_contest() has real data.
    const bulkStart = performance.now();
    const submissionRows = scoringJobs.map((j) => ({
      problemId: j.problemId,
      userId: j.userId,
      code: "// load-test placeholder",
      status: "ACCEPTED",
      language: "javascript",
      contestId,
    }));
    for (let i = 0; i < submissionRows.length; i += 500) {
      await db.insert(submissions).values(submissionRows.slice(i, i + 500));
    }
    const bulkMs = performance.now() - bulkStart;
    console.log(
      `\n── Bulk submissions insert (finalize-trigger data) ──\n  rows=${submissionRows.length}  wall=${(bulkMs / 1000).toFixed(2)}s  throughput=${(submissionRows.length / (bulkMs / 1000)).toFixed(1)}/s`,
    );

    // 3. Leaderboard read burst — real HTTP
    const readCount = Math.min(opts.reads, virtualUsers.length || opts.reads);
    summary.push(
      report(
        "Leaderboard reads (GET /contests/:slug/leaderboard)",
        await runWithConcurrency(
          Array.from({ length: readCount }),
          async () => {
            const res = await fetch(`${opts.baseUrl}/contests/${contestSlug}/leaderboard`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
          opts.concurrency,
        ),
      ),
    );

    // 4. WS fanout — connect real sockets, measure snapshot latency, then
    //    fanout latency across all of them on the next broadcast tick.
    const wsCount = Math.min(opts.wsClients, virtualUsers.length);
    console.log(`\n── WS connect + snapshot (${wsCount} clients) ──`);
    const sockets = [];
    const snapshotResult = await runWithConcurrency(
      virtualUsers.slice(0, wsCount),
      (u) =>
        new Promise((resolve, reject) => {
          const socket = ioClient(opts.wsUrl, { auth: { token: u.token }, transports: ["websocket"] });
          const timeout = setTimeout(() => reject(new Error("snapshot timeout")), 10000);
          socket.once("connect", () => socket.emit("watch:contest", contestId));
          socket.once("contest:leaderboard", () => {
            clearTimeout(timeout);
            sockets.push(socket);
            resolve();
          });
          socket.once("connect_error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        }),
      opts.concurrency,
    );
    summary.push(report("WS connect -> initial snapshot", snapshotResult));

    if (sockets.length > 0) {
      console.log(`\n── WS fanout on next broadcast tick (${sockets.length} connected clients) ──`);
      const fanoutStart = performance.now();
      const fanoutPromises = sockets.map(
        (socket) =>
          new Promise((resolve) => {
            socket.once("contest:leaderboard", () => resolve(performance.now() - fanoutStart));
          }),
      );
      // One more score change to mark the contest dirty for the ticker.
      const triggerUser = virtualUsers[0];
      const triggerProblem = contestProblemsRows[contestProblemsRows.length - 1];
      await updateContestScore(
        { contestId, problemId: triggerProblem.id, userId: triggerUser.id, status: "WRONG_ANSWER" },
        redis,
      );

      const fanoutTimes = await Promise.race([
        Promise.all(fanoutPromises),
        new Promise((resolve) =>
          setTimeout(() => resolve(fanoutPromises.map(() => null)), 15000),
        ),
      ]);
      const got = fanoutTimes.filter((t) => t != null).sort((a, b) => a - b);
      console.log(
        `  received=${got.length}/${sockets.length}  latency(ms): min=${got[0]?.toFixed(1) ?? "n/a"}  p50=${percentile(got, 0.5)?.toFixed(1) ?? "n/a"}  p99=${percentile(got, 0.99)?.toFixed(1) ?? "n/a"}  max=${got[got.length - 1]?.toFixed(1) ?? "n/a"}`,
      );
      summary.push({
        name: "WS fanout (single tick)",
        total: sockets.length,
        ok: got.length,
        errors: sockets.length - got.length,
        throughput: null,
        p50: percentile(got, 0.5),
        p95: percentile(got, 0.95),
        p99: percentile(got, 0.99),
      });
    }

    for (const s of sockets) s.disconnect();

    // ── Summary ──────────────────────────────────────────────────────────
    console.log("\n\n════════════════ BENCHMARK SUMMARY ════════════════");
    for (const r of summary) {
      const tp = r.throughput != null ? `${r.throughput.toFixed(1)}/s` : "n/a";
      console.log(
        `${r.name.padEnd(45)} ok=${String(r.ok).padStart(5)}/${String(r.total).padEnd(5)} throughput=${tp.padEnd(10)} p50=${r.p50?.toFixed(1) ?? "n/a"}ms p95=${r.p95?.toFixed(1) ?? "n/a"}ms p99=${r.p99?.toFixed(1) ?? "n/a"}ms`,
      );
    }
    console.log("═════════════════════════════════════════════════\n");
  } finally {
    if (ctx && !opts.keep) {
      console.log("Cleaning up load-test data…");
      const { contestId, virtualUsers } = ctx;
      await db.execute(sql`delete from submissions where "contestId" = ${contestId}`);
      await db.execute(sql`delete from "contestParticipants" where "contestId" = ${contestId}`);
      await db.execute(sql`delete from "contestProblems" where "contestId" = ${contestId}`);
      await db.execute(sql`delete from contest where id = ${contestId}`);
      const userIds = virtualUsers.map((u) => u.id);
      for (let i = 0; i < userIds.length; i += 500) {
        await db.execute(
          sql`delete from users where id in (${sql.join(userIds.slice(i, i + 500).map((id) => sql`${id}`), sql`, `)})`,
        );
      }
      const keys = await redis.keys(`contest:*:${contestId}*`);
      const moreKeys = [
        `contest:leaderboard:${contestId}`,
        `contest:dirty:${contestId}`,
        `contest:meta:${contestId}`,
        ...virtualUsers.map((u) => `contest:stats:${contestId}:${u.id}`),
      ];
      const allKeys = [...new Set([...keys, ...moreKeys])];
      if (allKeys.length) await redis.del(allKeys);
      console.log("  done.");
    } else if (ctx) {
      console.log(`\n--keep set — contest ${ctx.contestSlug} (id=${ctx.contestId}) and ${ctx.virtualUsers.length} users left in place.`);
    }
    redis.disconnect();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
