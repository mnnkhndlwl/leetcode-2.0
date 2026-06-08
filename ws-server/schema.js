// Minimal schema slice — only the columns the ws-server needs to read.
// Keep in sync with backend/src/db/schema.js.
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problemId"),
    userId: uuid("userId"),
    status: varchar("status", { length: 255 }).notNull().default("PENDING"),
    language: varchar("language", { length: 255 }).notNull(),
    runtimeMs: integer("runtimeMs"),
    memoryUsedMb: integer("memoryUsedMb"),
    compileError: text("compileError"),
    testCaseResults: jsonb("testCaseResults"),
    createdAt: timestamp("createdAt").defaultNow(),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (table) => [
    index("idx_submissions_userId").on(table.userId),
  ],
);
