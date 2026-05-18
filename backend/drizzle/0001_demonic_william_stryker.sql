CREATE TABLE "problemTags" (
	"problemId" uuid,
	"tagId" uuid,
	CONSTRAINT "problemTags_problemId_tagId_pk" PRIMARY KEY("problemId","tagId")
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"difficulty" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"visibility" varchar(255) DEFAULT 'PUBLIC' NOT NULL,
	"timeLimitMs" integer DEFAULT 2000 NOT NULL,
	"memoryLimitMb" integer DEFAULT 256 NOT NULL,
	"sampleTestCases" jsonb,
	"testCasesFileUrl" varchar(255),
	"totalSubmissions" integer DEFAULT 0 NOT NULL,
	"totalAccepted" integer DEFAULT 0 NOT NULL,
	"createdByUserId" uuid,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "problems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problemId" uuid,
	"userId" uuid,
	"code" text NOT NULL,
	"status" varchar(255) DEFAULT 'PENDING' NOT NULL,
	"language" varchar(255) NOT NULL,
	"runtimeMs" integer,
	"memoryUsedMb" integer,
	"compileError" text,
	"testCaseResults" jsonb,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "userProblemStatus" (
	"userId" uuid,
	"problemId" uuid,
	"status" varchar(255) DEFAULT 'UNSOLVED' NOT NULL,
	"lastAttemptedAt" timestamp,
	"solvedAt" timestamp,
	CONSTRAINT "userProblemStatus_userId_problemId_pk" PRIMARY KEY("userId","problemId")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "passwordHash" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(255) DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profilePicObj" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "githubUrl" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "linkedinUrl" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ranking" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "createdAt" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updatedAt" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "problemTags" ADD CONSTRAINT "problemTags_problemId_problems_id_fk" FOREIGN KEY ("problemId") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problemTags" ADD CONSTRAINT "problemTags_tagId_tags_id_fk" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problemId_problems_id_fk" FOREIGN KEY ("problemId") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userProblemStatus" ADD CONSTRAINT "userProblemStatus_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userProblemStatus" ADD CONSTRAINT "userProblemStatus_problemId_problems_id_fk" FOREIGN KEY ("problemId") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_problems_title" ON "problems" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_problems_difficulty" ON "problems" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_problems_slug" ON "problems" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_problems_visibility" ON "problems" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_submissions_problemId" ON "submissions" USING btree ("problemId");--> statement-breakpoint
CREATE INDEX "idx_submissions_userId" ON "submissions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_tags_name" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_tags_slug" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");