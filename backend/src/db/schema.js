import {
  jsonb,
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 255 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull().default("USER"),
    profilePicObj: jsonb("profilePicObj"),
    githubUrl: varchar("githubUrl", { length: 255 }),
    linkedinUrl: varchar("linkedinUrl", { length: 255 }),
    ranking: integer("ranking"),
    isDeleted: boolean("isDeleted").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow(),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (table) => [
    index("idx_users_username").on(table.username),
    index("idx_users_email").on(table.email),
  ],
);

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    difficulty: varchar("difficulty", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    visibility: varchar("visibility", { length: 255 })
      .notNull()
      .default("PUBLIC"),
    timeLimitMs: integer("timeLimitMs").notNull().default(2000),
    memoryLimitMb: integer("memoryLimitMb").notNull().default(256),
    sampleTestCases: jsonb("sampleTestCases"),
    testCasesFileUrl: varchar("testCasesFileUrl", { length: 255 }),
    codeTemplates: jsonb("codeTemplates"),
    driverCode: jsonb("driverCode"),
    totalSubmissions: integer("totalSubmissions").notNull().default(0),
    totalAccepted: integer("totalAccepted").notNull().default(0),
    createdByUserId: uuid("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow(),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (table) => [
    index("idx_problems_title").on(table.title),
    index("idx_problems_difficulty").on(table.difficulty),
    index("idx_problems_slug").on(table.slug),
    index("idx_problems_visibility").on(table.visibility),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow(),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (table) => [
    index("idx_tags_name").on(table.name),
    index("idx_tags_slug").on(table.slug),
  ],
);

export const problemTags = pgTable(
  "problemTags",
  {
    problemId: uuid("problemId").references(() => problems.id),
    tagId: uuid("tagId").references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.problemId, table.tagId] })],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problemId").references(() => problems.id),
    userId: uuid("userId").references(() => users.id),
    code: text("code").notNull(),
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
    index("idx_submissions_problemId").on(table.problemId),
    index("idx_submissions_userId").on(table.userId),
  ],
);

export const userProblemStatus = pgTable(
  "userProblemStatus",
  {
    userId: uuid("userId").references(() => users.id),
    problemId: uuid("problemId").references(() => problems.id),
    status: varchar("status", { length: 255 }).notNull().default("UNSOLVED"),
    lastAttemptedAt: timestamp("lastAttemptedAt"),
    solvedAt: timestamp("solvedAt"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.problemId] })],
);

// TODO :  ADD CONTEST TABLE AND RELATED TABLES , HINT TABLE , EDITORIAL TABLE , COMMENT TABLE , CONTEST ENTRY TABLE
