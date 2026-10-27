import {
  boolean,
  customType,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  unique,
  varchar,
  text,
} from "drizzle-orm/mysql-core";
import type {
  AnalysisMetric,
  HistoryPoint,
  PhysicalTest,
  SkillValue,
  VideoSource,
} from "../shared/athlete";
import type { PoseResult } from "../shared/pose";
import type {
  AnalysisContext,
  ExercisePlan,
  NoteRevision,
  SessionEvaluation,
} from "../shared/evaluation-types";

/** Core user table backing the existing Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** MySQL MEDIUMBLOB accepts the 1 MiB private video chunks without public storage. */
const mediumBlob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "mediumblob";
  },
});

type StoredHistoryPoint = HistoryPoint & { skill?: string };

export const organizations = mysqlTable(
  "organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    type: mysqlEnum("type", ["academy", "club"]).notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    isDemo: boolean("isDemo").default(false).notNull(),
    demoOwnerUserId: int("demoOwnerUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    demoSeededAt: timestamp("demoSeededAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    unique("organizations_demo_owner_type_unique").on(
      table.demoOwnerUserId,
      table.type
    ),
  ]
);

/** Opaque anonymous-demo capabilities; only a SHA-256 token hash is stored. */
export const demoSessions = mysqlTable(
  "demo_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clubId: int("clubId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt").notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("demo_sessions_expiry_idx").on(table.expiresAt),
    index("demo_sessions_workspace_idx").on(table.academyId, table.clubId),
  ]
);

export const memberships = mysqlTable(
  "memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["owner", "staff"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    unique("memberships_organization_user_unique").on(
      table.organizationId,
      table.userId
    ),
    index("memberships_user_idx").on(table.userId),
  ]
);

export const players = mysqlTable(
  "players",
  {
    id: int("id").autoincrement().primaryKey(),
    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    age: int("age").notNull(),
    nationality: varchar("nationality", { length: 80 }).notNull(),
    position: varchar("position", { length: 40 }).notNull(),
    foot: varchar("foot", { length: 30 }).notNull(),
    height: int("height").notNull(),
    weight: double("weight").notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    birthDate: varchar("birthDate", { length: 10 }).notNull().default(""),
    jersey: int("jersey").notNull(),
    photoKey: varchar("photoKey", { length: 255 }).notNull().default(""),
    overall: double("overall").notNull().default(0),
    improvement: double("improvement").notNull().default(0),
    discoverable: boolean("discoverable").notNull().default(false),
    strengths: json("strengths").$type<string[]>().notNull(),
    weaknesses: json("weaknesses").$type<string[]>().notNull(),
    skills: json("skills").$type<SkillValue[]>().notNull(),
    physicalTests: json("physicalTests").$type<PhysicalTest[]>().notNull(),
    history: json("history").$type<StoredHistoryPoint[]>().notNull(),
    /** Historical fake demo rows are retained but omitted from operational lists. */
    demoArchived: boolean("demoArchived").notNull().default(false),
    lastAnalysisAt: timestamp("lastAnalysisAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("players_academy_idx").on(table.academyId),
    index("players_discovery_idx").on(
      table.discoverable,
      table.position,
      table.region
    ),
  ]
);

export const accessRequests = mysqlTable(
  "access_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clubId: int("clubId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "revoked"])
      .notNull()
      .default("pending"),
    message: varchar("message", { length: 500 }).notNull().default(""),
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("access_requests_academy_idx").on(table.academyId, table.status),
    index("access_requests_club_idx").on(table.clubId, table.status),
    index("access_requests_player_club_idx").on(table.playerId, table.clubId),
  ]
);

export const accessGrants = mysqlTable(
  "access_grants",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    clubId: int("clubId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accessRequestId: int("accessRequestId")
      .notNull()
      .references(() => accessRequests.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(true),
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    unique("access_grants_player_club_unique").on(table.playerId, table.clubId),
    index("access_grants_club_active_idx").on(table.clubId, table.active),
  ]
);

export const favorites = mysqlTable(
  "favorites",
  {
    id: int("id").autoincrement().primaryKey(),
    clubId: int("clubId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    unique("favorites_club_player_unique").on(table.clubId, table.playerId),
    index("favorites_club_idx").on(table.clubId),
  ]
);

export const videos = mysqlTable(
  "videos",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    skill: varchar("skill", { length: 60 }).notNull(),
    recordedAt: timestamp("recordedAt").notNull(),
    size: int("size").notNull(),
    mime: varchar("mime", { length: 30 }).notNull(),
    /** Optional provenance for this uploaded video; it is never player identity data. */
    source: json("source").$type<VideoSource | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("videos_player_recorded_idx").on(table.playerId, table.recordedAt),
  ]
);

export const videoChunks = mysqlTable(
  "video_chunks",
  {
    id: int("id").autoincrement().primaryKey(),
    videoId: int("videoId")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    chunkIndex: int("chunkIndex").notNull(),
    data: mediumBlob("data").notNull(),
  },
  table => [
    unique("video_chunks_video_index_unique").on(
      table.videoId,
      table.chunkIndex
    ),
  ]
);

export const analyses = mysqlTable(
  "analyses",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    videoId: int("videoId").references(() => videos.id, {
      onDelete: "set null",
    }),
    skill: varchar("skill", { length: 60 }).notNull(),
    isDemo: boolean("isDemo").notNull().default(true),
    score: double("score"),
    poseResult: json("poseResult").$type<PoseResult | null>(),
    context: json("context").$type<AnalysisContext | null>(),
    evaluationSnapshot: json("evaluationSnapshot").$type<SessionEvaluation | null>(),
    metrics: json("metrics").$type<AnalysisMetric[]>().notNull(),
    jointAngles: json("jointAngles")
      .$type<{ name: string; angle: number }[]>()
      .notNull(),
    observations: json("observations")
      .$type<
        { type: "good" | "warning" | "info"; title: string; detail: string }[]
      >()
      .notNull(),
    exercises: json("exercises")
      .$type<{ title: string; description: string }[]>()
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("analyses_player_created_idx").on(table.playerId, table.createdAt),
    index("analyses_video_created_idx").on(table.videoId, table.createdAt),
  ]
);

export const notes = mysqlTable(
  "notes",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: int("authorUserId")
      .references(() => users.id, { onDelete: "cascade" }),
    analysisId: int("analysisId").references(() => analyses.id, {
      onDelete: "set null",
    }),
    source: mysqlEnum("source", ["automatic", "coach"])
      .notNull()
      .default("coach"),
    authorName: varchar("authorName", { length: 160 })
      .notNull()
      .default("سجل تاريخي غير منسوب"),
    requiredAction: varchar("requiredAction", { length: 500 })
      .notNull()
      .default(""),
    visibility: mysqlEnum("visibility", ["academy_internal", "shared"])
      .notNull()
      .default("academy_internal"),
    /** The original submitted wording is never modified. */
    originalText: varchar("originalText", { length: 1000 })
      .notNull()
      .default(""),
    revisions: json("revisions").$type<NoteRevision[]>().notNull(),
    text: varchar("text", { length: 1000 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("notes_player_created_idx").on(table.playerId, table.createdAt),
    index("notes_player_visibility_idx").on(
      table.playerId,
      table.visibility,
      table.createdAt
    ),
    index("notes_analysis_idx").on(table.analysisId),
  ]
);
export const exercisePlans = mysqlTable(
  "exercise_plans",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    analysisId: int("analysisId")
      .notNull()
      .references(() => analyses.id),
    developmentId: varchar("developmentId", { length: 200 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    goal: varchar("goal", { length: 1000 }).notNull(),
    steps: json("steps").$type<ExercisePlan["steps"]>().notNull(),
    tools: varchar("tools", { length: 500 }).notNull(),
    sets: int("sets"),
    repetitions: int("repetitions"),
    durationSeconds: int("durationSeconds"),
    restSeconds: int("restSeconds"),
    progression: varchar("progression", { length: 1000 }).notNull(),
    reassessAt: varchar("reassessAt", { length: 40 }).notNull(),
    reassessMethod: varchar("reassessMethod", { length: 1000 }).notNull(),
    reassessIndicatorCode: varchar("reassessIndicatorCode", {
      length: 160,
    }).notNull(),
    authorName: varchar("authorName", { length: 160 }).notNull(),
    reviewed: boolean("reviewed").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("exercise_plans_player_updated_idx").on(
      table.playerId,
      table.updatedAt
    ),
    index("exercise_plans_analysis_idx").on(table.analysisId),
  ]
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorUserId: int("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: varchar("entityType", { length: 60 }).notNull(),
    entityId: int("entityId"),
    action: varchar("action", { length: 100 }).notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_events_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type AccessRequestRow = typeof accessRequests.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
