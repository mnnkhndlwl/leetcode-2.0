CREATE TABLE "contest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"slug" text NOT NULL,
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp NOT NULL,
	"registrationStartsAt" timestamp NOT NULL,
	"registrationEndsAt" timestamp NOT NULL,
	"status" varchar(255) DEFAULT 'DRAFT' NOT NULL,
	"createdByUserId" uuid,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "contest_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contestProblems" (
	"contestId" uuid,
	"problemId" uuid,
	"displayOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"isVisible" boolean DEFAULT true NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "contestProblems_contestId_problemId_pk" PRIMARY KEY("contestId","problemId")
);
--> statement-breakpoint
CREATE TABLE "contestParticipants" (
	"contestId" uuid,
	"userId" uuid,
	"registeredAt" timestamp DEFAULT now(),
	"joinedAt" timestamp,
	"lastActivityAt" timestamp,
	"totalScore" integer DEFAULT 0 NOT NULL,
	"totalPenalty" integer DEFAULT 0 NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "contestParticipants_contestId_userId_pk" PRIMARY KEY("contestId","userId")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "contestId" uuid;
--> statement-breakpoint
ALTER TABLE "contest" ADD CONSTRAINT "contest_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contestProblems" ADD CONSTRAINT "contestProblems_contestId_contest_id_fk" FOREIGN KEY ("contestId") REFERENCES "public"."contest"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contestProblems" ADD CONSTRAINT "contestProblems_problemId_problems_id_fk" FOREIGN KEY ("problemId") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contestParticipants" ADD CONSTRAINT "contestParticipants_contestId_contest_id_fk" FOREIGN KEY ("contestId") REFERENCES "public"."contest"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contestParticipants" ADD CONSTRAINT "contestParticipants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contestId_contest_id_fk" FOREIGN KEY ("contestId") REFERENCES "public"."contest"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_submissions_contestId" ON "submissions" USING btree ("contestId");
