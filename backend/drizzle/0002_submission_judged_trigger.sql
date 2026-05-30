-- Trigger: fn_after_submission_judged
--
-- Fires AFTER every UPDATE on submissions.
-- Guards on status transition: only runs when moving from a queued state
-- (PENDING / RUNNING) to a final verdict, so re-deliveries and admin edits
-- outside the judge flow are harmless.
--
-- Two side-effects, both inside the same transaction as the UPDATE:
--   1. Bump denormalised problem counters (totalSubmissions / totalAccepted)
--   2. Upsert userProblemStatus — never downgrade SOLVED to ATTEMPTED

--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_after_submission_judged()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: only act on PENDING/RUNNING → final-verdict transitions
  IF OLD.status NOT IN ('PENDING', 'RUNNING') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('PENDING', 'RUNNING') THEN
    RETURN NEW;
  END IF;

  -- 1. Bump denormalised problem counters
  UPDATE problems
  SET
    "totalSubmissions" = "totalSubmissions" + 1,
    "totalAccepted"    = "totalAccepted" + CASE WHEN NEW.status = 'ACCEPTED' THEN 1 ELSE 0 END,
    "updatedAt"        = NOW()
  WHERE id = NEW."problemId";

  -- 2. Upsert per-(user, problem) solved/attempted tracking
  --    Rules:
  --      • ACCEPTED        → always write SOLVED; preserve first solvedAt timestamp
  --      • anything else   → write ATTEMPTED, but never overwrite an existing SOLVED
  INSERT INTO "userProblemStatus" ("userId", "problemId", status, "lastAttemptedAt", "solvedAt")
  VALUES (
    NEW."userId",
    NEW."problemId",
    CASE WHEN NEW.status = 'ACCEPTED' THEN 'SOLVED' ELSE 'ATTEMPTED' END,
    NOW(),
    CASE WHEN NEW.status = 'ACCEPTED' THEN NOW() ELSE NULL END
  )
  ON CONFLICT ("userId", "problemId") DO UPDATE SET
    status = CASE
               WHEN NEW.status = 'ACCEPTED'              THEN 'SOLVED'
               WHEN "userProblemStatus".status = 'SOLVED' THEN 'SOLVED'
               ELSE 'ATTEMPTED'
             END,
    "lastAttemptedAt" = NOW(),
    "solvedAt" = CASE
                   WHEN NEW.status = 'ACCEPTED'
                     -- keep the timestamp of the FIRST accepted run
                     THEN COALESCE("userProblemStatus"."solvedAt", NOW())
                   ELSE
                     "userProblemStatus"."solvedAt"
                 END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE OR REPLACE TRIGGER trg_submission_judged
  AFTER UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION fn_after_submission_judged();
