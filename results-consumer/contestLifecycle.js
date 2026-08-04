import { sql } from "drizzle-orm";
import { db } from "./db.js";

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Two blind, timestamp-driven status flips — no lock/lease needed.
 *
 * Postgres row-level locking is what makes this safe to run in every
 * `results-consumer` instance at once: only one instance's UPDATE actually
 * matches+locks+commits a given contest row per tick; every other instance's
 * `WHERE status = '...'` simply matches 0 rows once the winner commits.
 *
 * The RUNNING -> FINISHED flip fires `trg_finalize_contest` (see
 * backend/drizzle/0006_contest_finalize_trigger.sql), which recomputes the
 * final score straight from `submissions` and writes `contestParticipants`
 * in the same transaction as this UPDATE. If that trigger throws, the whole
 * transaction (including this flip) rolls back, so the row stays RUNNING
 * and the next tick retries the whole contest — no separate recovery path.
 */
async function sweepContestLifecycle() {
  try {
    await db.execute(sql`
      update contest
      set status = 'RUNNING', "updatedAt" = now()
      where status = 'DRAFT' and "startsAt" <= now()
    `);

    await db.execute(sql`
      update contest
      set status = 'FINISHED', "updatedAt" = now()
      where status = 'RUNNING' and "endsAt" <= now()
    `);
  } catch (err) {
    console.error("[contest-lifecycle] sweep failed:", err.message);
  }
}

export function startContestLifecycleSweep() {
  sweepContestLifecycle();
  return setInterval(sweepContestLifecycle, SWEEP_INTERVAL_MS);
}
