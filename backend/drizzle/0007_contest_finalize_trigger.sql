-- Trigger: trg_finalize_contest
--
-- Fires BEFORE the status transition RUNNING -> FINISHED on `contest`
-- (that flip itself comes from a blind timestamp sweep in results-consumer,
-- see results-consumer/contestLifecycle.js).
--
-- Recomputes the final rank/score directly from `submissions` — the
-- durable source of truth — so any drift or bug in the live Redis
-- leaderboard during the contest can never corrupt the recorded result.
-- Runs in the same transaction as the status flip: if this fails, the
-- flip rolls back too, and the next sweep tick retries the whole contest.
--
-- Penalty = (# non-accepted submissions before the first AC, per problem)
-- * 300s. Matches the live formula in
-- results-consumer/updateContestScore.js exactly.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION finalize_contest()
RETURNS TRIGGER AS $$
BEGIN
  WITH first_ac AS (
    SELECT DISTINCT ON ("userId", "problemId") "userId", "problemId", "createdAt" AS ac_at
    FROM submissions
    WHERE "contestId" = NEW.id AND status = 'ACCEPTED'
    ORDER BY "userId", "problemId", "createdAt" ASC
  ),
  fails_before_ac AS (
    SELECT s."userId", s."problemId", COUNT(*) AS fails
    FROM submissions s
    JOIN first_ac f USING ("userId", "problemId")
    WHERE s."contestId" = NEW.id
      AND s.status NOT IN ('ACCEPTED', 'PENDING', 'RUNNING')
      AND s."createdAt" < f.ac_at
    GROUP BY s."userId", s."problemId"
  ),
  per_user AS (
    SELECT f."userId",
           COUNT(*) AS solved_count,
           SUM(COALESCE(fb.fails, 0) * 300) AS total_penalty
    FROM first_ac f
    LEFT JOIN fails_before_ac fb USING ("userId", "problemId")
    GROUP BY f."userId"
  ),
  ranked AS (
    SELECT "userId", solved_count, total_penalty,
           RANK() OVER (ORDER BY solved_count DESC, total_penalty ASC) AS rnk
    FROM per_user
  )
  UPDATE "contestParticipants" cp
  SET "totalScore" = r.solved_count::integer,
      "totalPenalty" = r.total_penalty::integer,
      rank = r.rnk::integer,
      "updatedAt" = now()
  FROM ranked r
  WHERE cp."contestId" = NEW.id AND cp."userId" = r."userId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_finalize_contest
  BEFORE UPDATE OF status ON contest
  FOR EACH ROW
  WHEN (OLD.status = 'RUNNING' AND NEW.status = 'FINISHED')
  EXECUTE FUNCTION finalize_contest();
