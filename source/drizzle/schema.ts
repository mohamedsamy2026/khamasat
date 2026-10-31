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
import type { GymnasticsCategoryId, SportId } from "../shared/sports/types";
import type { PhysicalAssessmentCriterionStatus } from "../shared/physical-assessment";
import type { PoseResult } from "../shared/pose";
import type {
  AnalysisContext,
  ExercisePlan,
  NoteRevision,
  SessionEvaluation,
} from "../shared/evaluation-types";
import type { CoachAssessment } from "../shared/coaching";

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
    /** Sports the organization operates; validated against the sport registry. */
    sports: json("sports").$type<SportId[]>().notNull(),
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


/**
 * Independent regulatory authorities such as a ministry
 * or an authorized regional sports administration.
 */
export const regulatoryAuthorities = mysqlTable(
  "regulatory_authorities",
  {
    id: int("id").autoincrement().primaryKey(),

    name: varchar("name", { length: 180 }).notNull(),

    code: varchar("code", { length: 40 })
      .notNull()
      .unique(),

    region: varchar("region", { length: 120 }).notNull(),

    status: mysqlEnum("status", [
      "active",
      "suspended",
    ])
      .notNull()
      .default("active"),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => [
    index("regulatory_authorities_region_idx").on(
      table.region
    ),
  ]
);

/**
 * Users authorized to manage a regulatory authority.
 * An application admin is not automatically a ministry employee.
 */
export const authorityMemberships = mysqlTable(
  "authority_memberships",
  {
    id: int("id").autoincrement().primaryKey(),

    authorityId: int("authorityId")
      .notNull()
      .references(() => regulatoryAuthorities.id, {
        onDelete: "cascade",
      }),

    userId: int("userId")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    role: mysqlEnum("role", [
      "admin",
      "reviewer",
      "viewer",
    ]).notNull(),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),
  },
  table => [
    unique("authority_memberships_unique").on(
      table.authorityId,
      table.userId
    ),

    index("authority_memberships_user_idx").on(
      table.userId
    ),
  ]
);

/**
 * Links an academy to a regulatory authority.
 *
 * Pending links grant no regulatory access.
 * Only approved links may be used for authorized
 * regulatory operations.
 */
export const academyAuthorityLinks = mysqlTable(
  "academy_authority_links",
  {
    id: int("id").autoincrement().primaryKey(),

    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),

    authorityId: int("authorityId")
      .notNull()
      .references(() => regulatoryAuthorities.id, {
        onDelete: "cascade",
      }),

    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "revoked",
    ])
      .notNull()
      .default("pending"),

    approvedByUserId: int("approvedByUserId")
      .references(() => users.id, {
        onDelete: "set null",
      }),

    approvedAt: timestamp("approvedAt"),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => [
    unique("academy_authority_unique").on(
      table.academyId,
      table.authorityId
    ),

    index("academy_authority_status_idx").on(
      table.authorityId,
      table.status
    ),
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
    /** Sport plus optional gymnastics category; both are server-validated. */
    sport: varchar("sport", { length: 40 })
      .$type<SportId>()
      .notNull()
      .default("football"),
    gymnasticsCategory: varchar("gymnasticsCategory", { length: 40 })
      .$type<GymnasticsCategoryId | "">()
      .notNull()
      .default(""),
    /** Optional selected apparatus, validated from the player's category server-side. */
    primaryApparatus: varchar("primaryApparatus", { length: 40 }),
    /** Seed-only opaque key; public player input can never supply it. */
    demoProfileKey: varchar("demoProfileKey", { length: 80 }),
    age: int("age").notNull(),
    nationality: varchar("nationality", { length: 80 }).notNull(),
    position: varchar("position", { length: 40 }).notNull(),
    foot: varchar("foot", { length: 30 }).notNull(),
    height: int("height").notNull(),
    weight: double("weight").notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    birthDate: varchar("birthDate", { length: 10 }).notNull().default(""),
    /** Null for legacy/unknown profiles; never inferred from another timestamp. */
    academyJoinDate: varchar("academyJoinDate", { length: 10 }),
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
    /** Verified checked-in demo asset key; absent for ordinary private uploads. */
    demoAssetKey: varchar("demoAssetKey", { length: 160 }),
    durationSeconds: int("durationSeconds"),
    posterKey: varchar("posterKey", { length: 255 }),
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
    evaluationSnapshot: json(
      "evaluationSnapshot"
    ).$type<SessionEvaluation | null>(),
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
    authorUserId: int("authorUserId").references(() => users.id, {
      onDelete: "cascade",
    }),
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
    /** Editor of the latest revision; the original author is never overwritten. */
    lastEditedByName: varchar("lastEditedByName", { length: 160 })
      .notNull()
      .default(""),
    lastEditedByUserId: int("lastEditedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
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

/**
 * Sensitive athlete data. Both tables are written only by the owning academy
 * owner and read only through an explicit, scope-specific grant.
 */
export const playerHealthProfiles = mysqlTable("player_health_profiles", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId")
    .notNull()
    .unique()
    .references(() => players.id, { onDelete: "cascade" }),
  previousInjuries: varchar("previousInjuries", { length: 2000 })
    .notNull()
    .default(""),
  chronicDiseases: varchar("chronicDiseases", { length: 2000 })
    .notNull()
    .default(""),
  currentMedications: varchar("currentMedications", { length: 2000 })
    .notNull()
    .default(""),
  physiotherapy: varchar("physiotherapy", { length: 2000 })
    .notNull()
    .default(""),
  availableExams: varchar("availableExams", { length: 2000 })
    .notNull()
    .default(""),
  otherNotes: varchar("otherNotes", { length: 2000 }).notNull().default(""),
  updatedByName: varchar("updatedByName", { length: 160 })
    .notNull()
    .default(""),
  updatedByUserId: int("updatedByUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const playerEmergencyContacts = mysqlTable("player_emergency_contacts", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId")
    .notNull()
    .unique()
    .references(() => players.id, { onDelete: "cascade" }),
  contactName: varchar("contactName", { length: 140 }).notNull().default(""),
  relationship: varchar("relationship", { length: 80 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  alternatePhone: varchar("alternatePhone", { length: 32 })
    .notNull()
    .default(""),
  notes: varchar("notes", { length: 500 }).notNull().default(""),
  updatedByName: varchar("updatedByName", { length: 160 })
    .notNull()
    .default(""),
  updatedByUserId: int("updatedByUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** One row per (player, organization, scope); no scope implies another. */
export const playerSensitiveGrants = mysqlTable(
  "player_sensitive_grants",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: mysqlEnum("scope", ["health", "emergency"]).notNull(),
    active: boolean("active").notNull().default(true),
    grantedByUserId: int("grantedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedByName: varchar("grantedByName", { length: 160 })
      .notNull()
      .default(""),
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    unique("player_sensitive_grants_unique").on(
      table.playerId,
      table.organizationId,
      table.scope
    ),
    index("player_sensitive_grants_lookup_idx").on(
      table.organizationId,
      table.scope,
      table.active
    ),
  ]
);

/**
 * Standardized, sport-scoped physical indicator records. Criterion status is
 * stored explicitly so a provisional indicator can never be presented as an
 * approved standard by accident.
 */
export const playerPhysicalAssessments = mysqlTable(
  "player_physical_assessments",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    sport: varchar("sport", { length: 40 })
      .$type<SportId>()
      .notNull()
      .default("football"),
    apparatus: varchar("apparatus", { length: 40 }).notNull().default(""),
    skill: varchar("skill", { length: 80 }).notNull().default(""),
    indicatorCode: varchar("indicatorCode", { length: 120 }).notNull(),
    indicatorLabel: varchar("indicatorLabel", { length: 160 }).notNull(),
    indicatorGroup: varchar("indicatorGroup", { length: 80 })
      .notNull()
      .default(""),
    indicatorVersion: varchar("indicatorVersion", { length: 60 })
      .notNull()
      .default(""),
    value: double("value").notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    note: varchar("note", { length: 500 }).notNull().default(""),
    criterionStatus: varchar("criterionStatus", { length: 40 })
      .$type<PhysicalAssessmentCriterionStatus>()
      .notNull()
      .default("provisional_unvalidated"),
    sessionKey: varchar("sessionKey", { length: 40 }).notNull().default(""),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
    authorName: varchar("authorName", { length: 160 }).notNull().default(""),
    recordedByUserId: int("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("player_physical_assessments_player_idx").on(
      table.playerId,
      table.recordedAt
    ),
    index("player_physical_assessments_apparatus_idx").on(
      table.playerId,
      table.sport,
      table.apparatus
    ),
  ]
);

/**
 * Append-only, human-authored assessment records. The displayed overall is
 * persisted only after the server derives it from non-null submitted scores.
 */
export const coachAssessments = mysqlTable(
  "coach_assessments",
  {
    id: int("id").autoincrement().primaryKey(),
    playerId: int("playerId")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    coachName: varchar("coachName", { length: 160 }).notNull(),
    coachPhotoKey: varchar("coachPhotoKey", { length: 255 })
      .notNull()
      .default(""),
    assessedAt: timestamp("assessedAt").notNull(),
    protocol: varchar("protocol", { length: 160 }).notNull(),
    notes: varchar("notes", { length: 2000 }).notNull().default(""),
    skills: json("skills").$type<CoachAssessment["skills"]>().notNull(),
    overall: double("overall"),
    strengths: json("strengths").$type<string[]>().notNull(),
    development: json("development").$type<string[]>().notNull(),
    exercises: json("exercises")
      .$type<CoachAssessment["exercises"]>()
      .notNull(),
    isDemo: boolean("isDemo").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("coach_assessments_player_assessed_idx").on(
      table.playerId,
      table.assessedAt
    ),
  ]
);

import * as authSql from "drizzle-orm/mysql-core";

export const authCredentials = authSql.mysqlTable(
  "auth_credentials",
  {
    id: authSql.int("id").primaryKey().autoincrement(),

    userId: authSql
      .int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    email: authSql.varchar("email", { length: 255 }).notNull(),

    passwordHash: authSql
      .varchar("password_hash", { length: 255 })
      .notNull(),

    createdAt: authSql.timestamp("created_at").defaultNow().notNull(),
    updatedAt: authSql.timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    authSql.uniqueIndex("auth_credentials_user_id_unique").on(table.userId),
    authSql.uniqueIndex("auth_credentials_email_unique").on(table.email),
  ]
);

export const authSessions = authSql.mysqlTable(
  "auth_sessions",
  {
    id: authSql.int("id").primaryKey().autoincrement(),

    userId: authSql
      .int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    tokenHash: authSql
      .varchar("token_hash", { length: 64 })
      .notNull(),

    expiresAt: authSql.timestamp("expires_at").notNull(),

    revokedAt: authSql.timestamp("revoked_at"),

    createdAt: authSql.timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    authSql.uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    authSql.index("auth_sessions_user_id_idx").on(table.userId),
    authSql.index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ]
);


export const coaches = mysqlTable(
  "coaches",
  {
    id: int("id").autoincrement().primaryKey(),

    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),

    name: varchar("name", { length: 160 }).notNull(),

    email: varchar("email", { length: 320 }),

    phone: varchar("phone", { length: 30 }),

    specialization: varchar("specialization", {
      length: 120,
    }).notNull().default(""),

    status: mysqlEnum("status", [
      "active",
      "inactive",
    ]).notNull().default("active"),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .onUpdateNow()
      .notNull(),
  },
  table => [
    index("coaches_academy_idx").on(table.academyId),
  ]
);


export const academyLicenses = mysqlTable(
  "academy_licenses",
  {
    id: int("id").autoincrement().primaryKey(),

    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),

    authorityId: int("authorityId")
      .notNull()
      .references(() => regulatoryAuthorities.id),

    licenseNumber: varchar("licenseNumber", {
      length: 100,
    }).notNull(),

    issuedAt: timestamp("issuedAt").notNull(),

    expiresAt: timestamp("expiresAt").notNull(),

    status: mysqlEnum("status", [
      "active",
      "suspended",
      "revoked",
    ]).notNull().default("active"),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),
  },
  table => [
    unique("academy_license_number_unique").on(
      table.authorityId,
      table.licenseNumber
    ),

    index("academy_licenses_expiry_idx").on(
      table.expiresAt
    ),

    index("academy_licenses_academy_idx").on(
      table.academyId
    ),
  ]
);



export const coachLicenses = mysqlTable(
  "coach_licenses",
  {
    id: int("id").autoincrement().primaryKey(),

    coachId: int("coachId")
      .notNull()
      .references(() => coaches.id, {
        onDelete: "cascade",
      }),

    authorityId: int("authorityId")
      .notNull()
      .references(() => regulatoryAuthorities.id),

    licenseNumber: varchar("licenseNumber", {
      length: 100,
    }).notNull(),

    issuedAt: timestamp("issuedAt").notNull(),

    expiresAt: timestamp("expiresAt").notNull(),

    status: mysqlEnum("status", [
      "active",
      "suspended",
      "revoked",
    ]).notNull().default("active"),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),
  },
  table => [
    unique("coach_license_number_unique").on(
      table.authorityId,
      table.licenseNumber
    ),

    index("coach_licenses_coach_idx").on(
      table.coachId
    ),

    index("coach_licenses_expiry_idx").on(
      table.expiresAt
    ),
  ]
);


export const regulatoryReports = mysqlTable(
  "regulatory_reports",
  {
    id: int("id").autoincrement().primaryKey(),

    academyId: int("academyId")
      .notNull()
      .references(() => organizations.id),

    authorityId: int("authorityId")
      .notNull()
      .references(() => regulatoryAuthorities.id),

    title: varchar("title", {
      length: 220,
    }).notNull(),

    reportType: mysqlEnum("reportType", [
      "performance",
      "compliance",
      "annual",
      "other",
    ]).notNull(),

    // Immutable snapshot of the submitted report.
    content: json("content")
      .$type<Record<string, unknown>>()
      .notNull(),

    status: mysqlEnum("status", [
      "submitted",
      "under_review",
      "reviewed",
      "returned",
    ]).notNull().default("submitted"),

    submittedByUserId: int("submittedByUserId")
      .references(() => users.id, {
        onDelete: "set null",
      }),

    reviewedByUserId: int("reviewedByUserId")
      .references(() => users.id, {
        onDelete: "set null",
      }),

    reviewedAt: timestamp("reviewedAt"),

    submittedAt: timestamp("submittedAt")
      .defaultNow()
      .notNull(),
  },
  table => [
    index("regulatory_reports_authority_idx").on(
      table.authorityId,
      table.submittedAt
    ),

    index("regulatory_reports_academy_idx").on(
      table.academyId,
      table.submittedAt
    ),
  ]
);



export const licenseNotifications = mysqlTable(
  "license_notifications",
  {
    id: int("id").autoincrement().primaryKey(),

    authorityId: int("authorityId")
      .notNull()
      .references(() => regulatoryAuthorities.id),

    academyLicenseId: int("academyLicenseId")
      .references(() => academyLicenses.id, {
        onDelete: "cascade",
      }),

    coachLicenseId: int("coachLicenseId")
      .references(() => coachLicenses.id, {
        onDelete: "cascade",
      }),

    notificationType: mysqlEnum("notificationType", [
      "expiring_soon",
      "expired",
    ]).notNull(),

    recipientUserId: int("recipientUserId")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    message: text("message").notNull(),

    isRead: boolean("isRead")
      .notNull()
      .default(false),

    createdAt: timestamp("createdAt")
      .defaultNow()
      .notNull(),
  },
  table => [
    index("license_notifications_recipient_idx").on(
      table.recipientUserId,
      table.isRead
    ),
  ]
);

export type RegulatoryAuthority =
  typeof regulatoryAuthorities.$inferSelect;

export type AuthorityMembership =
  typeof authorityMemberships.$inferSelect;

export type AcademyAuthorityLink =
  typeof academyAuthorityLinks.$inferSelect;

export type Coach =
  typeof coaches.$inferSelect;

export type AcademyLicense =
  typeof academyLicenses.$inferSelect;

export type CoachLicense =
  typeof coachLicenses.$inferSelect;

export type RegulatoryReport =
  typeof regulatoryReports.$inferSelect;

export type LicenseNotification =
  typeof licenseNotifications.$inferSelect;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type AccessRequestRow = typeof accessRequests.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
