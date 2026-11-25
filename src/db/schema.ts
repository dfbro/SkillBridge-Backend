import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const auth = pgSchema("auth");
const authUsers = auth.table("users", { id: uuid("id").primaryKey() });

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 120 }),
  avatarUrl: text("avatar_url"),
  bio: varchar("bio", { length: 500 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const careerGoals = pgTable("career_goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  description: varchar("description", { length: 1000 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("career_goals_user_id_idx").on(table.userId)]);

export const missions = pgTable("missions", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  title: varchar("title", { length: 180 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  instructions: text("instructions").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("missions_status_created_idx").on(table.status, table.createdAt)]);

export const rubricVersions = pgTable("rubric_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  missionId: uuid("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("rubric_versions_mission_version_uq").on(table.missionId, table.version)]);

export const rubricCriteria = pgTable("rubric_criteria", {
  id: uuid("id").defaultRandom().primaryKey(),
  rubricVersionId: uuid("rubric_version_id").notNull().references(() => rubricVersions.id, { onDelete: "cascade" }),
  criterionKey: varchar("criterion_key", { length: 80 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  maxScore: integer("max_score").notNull(),
  weight: integer("weight").notNull().default(1),
}, (table) => [
  uniqueIndex("rubric_criteria_version_key_uq").on(table.rubricVersionId, table.criterionKey),
  check("rubric_criteria_max_score_positive_ck", sql`${table.maxScore} > 0`),
  check("rubric_criteria_weight_positive_ck", sql`${table.weight} > 0`),
]);

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  missionId: uuid("mission_id").notNull().references(() => missions.id),
  rubricVersionId: uuid("rubric_version_id").notNull().references(() => rubricVersions.id),
  content: text("content").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("submitted"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("submissions_user_created_idx").on(table.userId, table.createdAt)]);

export const assessmentRuns = pgTable("assessment_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  totalScore: integer("total_score"),
  feedback: text("feedback"),
  isFinal: boolean("is_final").notNull().default(false),
  provider: varchar("provider", { length: 40 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("assessment_runs_submission_created_idx").on(table.submissionId, table.createdAt)]);

export const assessmentCriterionResults = pgTable("assessment_criterion_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  assessmentRunId: uuid("assessment_run_id").notNull().references(() => assessmentRuns.id, { onDelete: "cascade" }),
  criterionId: uuid("criterion_id").notNull().references(() => rubricCriteria.id),
  score: integer("score").notNull(),
  feedback: text("feedback").notNull(),
}, (table) => [
  uniqueIndex("assessment_criterion_result_uq").on(table.assessmentRunId, table.criterionId),
  check("assessment_criterion_score_nonnegative_ck", sql`${table.score} >= 0`),
]);

export const xpEvents = pgTable("xp_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  sourceId: uuid("source_id").notNull(),
  points: integer("points").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("xp_events_user_source_uq").on(table.userId, table.sourceType, table.sourceId),
  index("xp_events_user_created_idx").on(table.userId, table.createdAt),
  check("xp_events_points_nonnegative_ck", sql`${table.points} >= 0`),
]);

export const schema = {
  profiles,
  careerGoals,
  missions,
  rubricVersions,
  rubricCriteria,
  submissions,
  assessmentRuns,
  assessmentCriterionResults,
  xpEvents,
};
