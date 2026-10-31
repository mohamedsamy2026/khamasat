import {
  accessGrants,
  analyses,
  auditEvents,
  coachAssessments,
  exercisePlans,
  memberships,
  notes,
  organizations,
  playerEmergencyContacts,
  playerHealthProfiles,
  playerPhysicalAssessments,
  playerSensitiveGrants,
  players,
  videoChunks,
  videos,
} from "../../drizzle/schema";
import {
  POSE_ENGINE,
  POSE_MODEL,
  POSE_MODEL_VERSION,
  type PoseResult,
} from "../../shared/pose";

/**
 * Test-only in-memory Drizzle-shaped fixture. It is intentionally not imported
 * by application code and never opens a real database connection.
 */
export type AthleteRouteFixture = {
  membership: {
    organizationId: number;
    userId: number;
    role: "owner" | "staff";
    name: string;
    type: "academy" | "club";
    region: string;
    isDemo: boolean;
    sports?: string[];
  } | null;
  players: Array<Record<string, any>>;
  videos: Array<Record<string, any>>;
  chunks: Array<Record<string, any>>;
  analyses: Array<Record<string, any>>;
  notes: Array<Record<string, any>>;
  exercisePlans: Array<Record<string, any>>;
  grants: Array<Record<string, any>>;
  audit: Array<Record<string, any>>;
  organizations: Array<Record<string, any>>;
  healthProfiles: Array<Record<string, any>>;
  emergencyContacts: Array<Record<string, any>>;
  sensitiveGrants: Array<Record<string, any>>;
  assessments: Array<Record<string, any>>;
  coachAssessments: Array<Record<string, any>>;
  writes: {
    transactions: number;
    inserts: Array<{ table: unknown; values: unknown }>;
    playerUpdates: Array<Record<string, any>>;
  };
  nextVideoId: number;
  nextAnalysisId: number;
  nextExercisePlanId: number;
  nextAssessmentId: number;
  nextCoachAssessmentId: number;
  nextSensitiveGrantId: number;
};

export function testPlayer(
  overrides: Partial<Record<string, any>> = {}
): Record<string, any> {
  return {
    id: 101,
    academyId: 11,
    name: "لاعب اختبار",
    age: 16,
    nationality: "سعودي",
    sport: "football",
    gymnasticsCategory: "",
    position: "مهاجم",
    foot: "أيمن",
    height: 175,
    weight: 64,
    region: "الرياض",
    photoKey: "",
    overall: 7.5,
    improvement: 0,
    skills: [{ name: "التسديد", value: 75 }],
    discoverable: true,
    lastAnalysisAt: null,
    birthDate: "2010-01-01",
    jersey: 9,
    strengths: [],
    weaknesses: [],
    physicalTests: [],
    history: [],
    demoArchived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function testVideo(
  overrides: Partial<Record<string, any>> = {}
): Record<string, any> {
  return {
    id: 301,
    playerId: 101,
    title: "فيديو اختبار",
    skill: "التسديد",
    recordedAt: new Date("2026-10-01T00:00:00.000Z"),
    size: 12,
    mime: "video/mp4",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** A 90° elbow from explicit 2D points; this is test geometry, not inference. */
export function validPoseResult(): PoseResult {
  const angleAt = (
    first: { x: number; y: number },
    vertex: { x: number; y: number },
    third: { x: number; y: number }
  ) => {
    const left = { x: first.x - vertex.x, y: first.y - vertex.y };
    const right = { x: third.x - vertex.x, y: third.y - vertex.y };
    const cosine =
      (left.x * right.x + left.y * right.y) /
      (Math.hypot(left.x, left.y) * Math.hypot(right.x, right.y));
    return Number((Math.acos(cosine) * (180 / Math.PI)).toFixed(2));
  };
  const leftElbow = angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 });
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
    presence: 0,
  }));
  landmarks[11] = { x: 0.3, y: 0.3, visibility: 0.99, presence: 0.99 };
  landmarks[13] = { x: 0.3, y: 0.5, visibility: 0.99, presence: 0.99 };
  landmarks[15] = { x: 0.6, y: 0.5, visibility: 0.99, presence: 0.99 };
  return {
    engine: POSE_ENGINE,
    model: POSE_MODEL,
    modelVersion: POSE_MODEL_VERSION,
    packageVersion: "@mediapipe/tasks-vision@1.1.1",
    duration: 1,
    videoWidth: 1280,
    videoHeight: 720,
    sampleFps: 5,
    confidenceThreshold: 0.6,
    totalFrames: 1,
    detectedFrames: 1,
    frames: [{ timestamp: 0, landmarks, angles: { left_elbow: leftElbow } }],
    joints: [
      {
        key: "left_elbow",
        label: "المرفق الأيسر",
        samples: 1,
        min: leftElbow,
        max: leftElbow,
        mean: leftElbow,
      },
    ],
    limitations: ["قياس هندسي ثنائي الأبعاد ضمن بيانات اختبار."],
  };
}

export function createAthleteRouteFixture(
  overrides: Partial<AthleteRouteFixture> = {}
): AthleteRouteFixture {
  return {
    membership: {
      organizationId: 11,
      userId: 7,
      role: "owner",
      name: "أكاديمية اختبار",
      type: "academy",
      region: "الرياض",
      isDemo: false,
      // The organization-level sport switch is enforced on player writes.
      sports: ["football", "gymnastics"],
    },
    players: [testPlayer()],
    videos: [],
    chunks: [],
    analyses: [],
    notes: [],
    exercisePlans: [],
    grants: [],
    audit: [],
    organizations: [
      {
        id: 11,
        name: "أكاديمية اختبار",
        type: "academy",
        region: "الرياض",
        isDemo: false,
        sports: ["football", "gymnastics"],
      },
      {
        id: 20,
        name: "نادي اختبار",
        type: "club",
        region: "الرياض",
        isDemo: false,
        sports: ["football", "gymnastics"],
      },
      {
        id: 21,
        name: "نادٍ آخر",
        type: "club",
        region: "جدة",
        isDemo: false,
        sports: ["football"],
      },
    ],
    healthProfiles: [],
    emergencyContacts: [],
    sensitiveGrants: [],
    assessments: [],
    coachAssessments: [],
    writes: { transactions: 0, inserts: [], playerUpdates: [] },
    nextVideoId: 302,
    nextAnalysisId: 501,
    nextExercisePlanId: 801,
    nextAssessmentId: 901,
    nextCoachAssessmentId: 1001,
    nextSensitiveGrantId: 951,
    ...overrides,
  };
}

function rowsFor(
  fixture: AthleteRouteFixture,
  table: unknown,
  selection?: Record<string, unknown>
): Array<Record<string, any>> {
  if (table === memberships)
    return fixture.membership ? [{ ...fixture.membership }] : [];
  if (table === players) {
    if (selection && "player" in selection)
      return fixture.players.map(player => ({
        player,
        academyName: "أكاديمية اختبار",
      }));
    return fixture.players;
  }
  if (table === videos) return fixture.videos;
  if (table === videoChunks) return fixture.chunks;
  if (table === analyses) return fixture.analyses;
  if (table === notes) return fixture.notes;
  if (table === exercisePlans) return fixture.exercisePlans;
  if (table === accessGrants) return fixture.grants;
  if (table === organizations) return fixture.organizations;
  if (table === playerHealthProfiles) return fixture.healthProfiles;
  if (table === playerEmergencyContacts) return fixture.emergencyContacts;
  if (table === playerSensitiveGrants) return fixture.sensitiveGrants;
  if (table === playerPhysicalAssessments) return fixture.assessments;
  if (table === coachAssessments) return fixture.coachAssessments;
  return [];
}

/**
 * Minimal `where` support for the test double: it applies the simple
 * `eq(column, value)` conjunctions used by the routes. Anything more complex is
 * deliberately left unfiltered instead of being guessed.
 */
type EqualityFilter = { column: string; value: unknown };

function flattenCondition(where: any): Array<Record<string, any>> {
  const flat: Array<Record<string, any>> = [];
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    const name = node.constructor?.name;
    if (name === "Param") {
      flat.push({ kind: "param", value: node.value });
      return;
    }
    if (typeof node.name === "string" && node.dataType !== undefined) {
      flat.push({ kind: "column", name: node.name });
      return;
    }
    if (Array.isArray(node.queryChunks)) {
      for (const chunk of node.queryChunks) walk(chunk);
      return;
    }
    if (typeof node.value === "string") {
      flat.push({ kind: "text", text: node.value });
      return;
    }
    if (Array.isArray(node.value)) {
      flat.push({
        kind: "text",
        text: node.value
          .filter((part: unknown) => typeof part === "string")
          .join(""),
      });
    }
  };
  walk(where);
  return flat;
}

function equalityFilters(where: any): EqualityFilter[] | null {
  if (!where) return null;
  const flat = flattenCondition(where);
  const filters: EqualityFilter[] = [];
  for (let index = 0; index < flat.length; index += 1) {
    const item = flat[index]!;
    if (item.kind !== "column") continue;
    let cursor = index + 1;
    let operator = "";
    let value: unknown;
    let hasValue = false;
    while (cursor < flat.length) {
      const next = flat[cursor]!;
      if (next.kind === "text") {
        operator += next.text;
        cursor += 1;
        continue;
      }
      if (next.kind === "param") {
        value = next.value;
        hasValue = true;
      }
      break;
    }
    if (operator.replace(/[()\s]/g, "") !== "=" || !hasValue) return null;
    filters.push({ column: String(item.name), value });
    index = cursor;
  }
  return filters.length ? filters : null;
}

function rowValue(row: Record<string, any>, column: string): unknown {
  if (column in row) return row[column];
  // Joined selections are returned as { player: {...}, academyName } by the
  // fixture, so a filter on the joined table's column must look inside.
  for (const value of Object.values(row)) {
    if (value && typeof value === "object" && column in value)
      return (value as Record<string, unknown>)[column];
  }
  return undefined;
}

function filterRows(
  rows: Array<Record<string, any>>,
  where: unknown
): Array<Record<string, any>> {
  const filters = equalityFilters(where);
  if (!filters) return rows;
  return rows.filter(row =>
    filters.every(
      filter => String(rowValue(row, filter.column)) === String(filter.value)
    )
  );
}

/** Creates only the chain methods called by the athlete routes under test. */
export function createAthleteRouteDb(fixture: AthleteRouteFixture): any {
  const db: any = {
    select(selection?: Record<string, unknown>) {
      let table: unknown;
      let condition: unknown;
      const chain: any = {
        from(value: unknown) {
          table = value;
          return chain;
        },
        innerJoin: () => chain,
        where(value: unknown) {
          condition = value;
          return chain;
        },
        limit: () => chain,
        for: () => chain,
        orderBy: () => chain,
        then(
          resolve: (rows: Array<Record<string, any>>) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          const rows = filterRows(
            rowsFor(fixture, table, selection),
            condition
          ).map(row => ({ ...row }));
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return chain;
    },
    insert(table: unknown) {
      return {
        values: async (values: any) => {
          fixture.writes.inserts.push({ table, values });
          if (table === players) {
            const id =
              fixture.players.reduce(
                (max, row) => Math.max(max, Number(row.id) || 0),
                0
              ) + 1;
            const row = {
              demoArchived: false,
              photoKey: "",
              overall: 0,
              improvement: 0,
              history: [],
              strengths: [],
              weaknesses: [],
              skills: [],
              physicalTests: [],
              lastAnalysisAt: null,
              createdAt: new Date("2026-10-01T00:00:00.000Z"),
              ...values,
              id,
            };
            fixture.players.push(row);
            return [{ insertId: id }];
          }
          if (table === videos) {
            const id = fixture.nextVideoId++;
            fixture.videos.push({ ...values, id });
            return [{ insertId: id }];
          }
          if (table === videoChunks) {
            const rows = Array.isArray(values) ? values : [values];
            fixture.chunks.push(...rows.map(row => ({ ...row })));
            return [{ insertId: 1 }];
          }
          if (table === analyses) {
            const id = fixture.nextAnalysisId++;
            fixture.analyses.push({ ...values, id });
            return [{ insertId: id }];
          }
          if (table === notes) {
            const rows = Array.isArray(values) ? values : [values];
            const startId = fixture.notes.length + 701;
            fixture.notes.push(
              ...rows.map((row, index) => ({ ...row, id: startId + index }))
            );
            return [{ insertId: startId }];
          }
          if (table === exercisePlans) {
            const id = fixture.nextExercisePlanId++;
            fixture.exercisePlans.push({ ...values, id });
            return [{ insertId: id }];
          }
          if (table === auditEvents) {
            fixture.audit.push({ ...values });
            return [{ insertId: fixture.audit.length }];
          }
          if (table === playerPhysicalAssessments) {
            const rows = Array.isArray(values) ? values : [values];
            const startId = fixture.nextAssessmentId;
            fixture.assessments.push(
              ...rows.map((row, index) => ({ ...row, id: startId + index }))
            );
            fixture.nextAssessmentId += rows.length;
            return [{ insertId: startId }];
          }
          if (table === coachAssessments) {
            const id = fixture.nextCoachAssessmentId++;
            fixture.coachAssessments.push({ ...values, id });
            return [{ insertId: id }];
          }
          if (table === playerSensitiveGrants) {
            const id = fixture.nextSensitiveGrantId++;
            fixture.sensitiveGrants.push({ ...values, id });
            return [{ insertId: id }];
          }
          if (table === playerHealthProfiles) {
            fixture.healthProfiles.push({ ...values, id: 1 });
            return [{ insertId: 1 }];
          }
          if (table === playerEmergencyContacts) {
            fixture.emergencyContacts.push({ ...values, id: 1 });
            return [{ insertId: 1 }];
          }
          return [{ insertId: 1 }];
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, any>) {
          return {
            where: async (condition?: unknown) => {
              const rows = rowsFor(fixture, table);
              const matched = filterRows(rows, condition);
              const targets = matched.length ? matched : rows.slice(-1);
              for (const target of targets) Object.assign(target, values);
              if (table === players) fixture.writes.playerUpdates.push(values);
              return [];
            },
          };
        },
      };
    },
    delete(table?: unknown) {
      return {
        where: async (condition?: unknown) => {
          const rows = rowsFor(fixture, table);
          const matched = filterRows(rows, condition);
          if (table === playerPhysicalAssessments) {
            for (const row of matched) {
              const index = fixture.assessments.indexOf(row);
              if (index >= 0) fixture.assessments.splice(index, 1);
            }
          }
          return [];
        },
      };
    },
  };
  db.transaction = async (callback: (tx: any) => Promise<unknown>) => {
    fixture.writes.transactions += 1;
    return callback(db);
  };
  return db;
}
