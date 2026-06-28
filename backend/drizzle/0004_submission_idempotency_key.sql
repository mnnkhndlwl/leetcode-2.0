ALTER TABLE "submissions" ADD COLUMN "idempotencyKey" varchar(255);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_submissions_user_idem"
  ON "submissions" ("userId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
