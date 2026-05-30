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
  },
  (table) => [index("idx_submissions_id").on(table.id)],
);
