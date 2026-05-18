import { jsonb, pgTable, uuid, varchar } from "drizzle-orm/pg-core";

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
