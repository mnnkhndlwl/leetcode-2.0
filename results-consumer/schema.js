// Only the submissions table is needed here — the trigger in the DB handles
// updating problems counters and userProblemStatus automatically.
// Kept in sync with backend/src/db/schema.js (same column names / types).

import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const contest = pgTable(
  "contest" , {
    id : uuid("id").primaryKey().defaultRandom(),
    title : varchar("title", { length: 255 }).notNull(),
    description : text("description").notNull(),
    slug : text("slug").notNull().unique(),
    startsAt : timestamp("startsAt").notNull(),
    endsAt : timestamp("endsAt").notNull(),
    registrationStartsAt : timestamp("registrationStartsAt").notNull(),
    registrationEndsAt : timestamp("registrationEndsAt").notNull(),
    status : varchar("status", { length: 255 }).notNull().default("DRAFT"),
    createdByUserId : uuid("createdByUserId"),
    createdAt : timestamp("createdAt").defaultNow(),
    updatedAt : timestamp("updatedAt").defaultNow(),
  }
)
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId"),
    problemId: uuid("problemId"),
    status: varchar("status", { length: 255 }).notNull().default("PENDING"),
    runtimeMs: integer("runtimeMs"),
    memoryUsedMb: integer("memoryUsedMb"),
    compileError: text("compileError"),
    testCaseResults: jsonb("testCaseResults"),
    updatedAt: timestamp("updatedAt").defaultNow(),
    createdAt: timestamp("createdAt").defaultNow(),
    contestId: uuid("contestId").references(() => contest.id),
  },
  (table) => [index("idx_submissions_id").on(table.id)],
);


