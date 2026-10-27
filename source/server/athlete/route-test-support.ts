import {
  accessGrants,
  analyses,
  auditEvents,
  exercisePlans,
  memberships,
  notes,
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
  } | null;
  players: Array<Record<string, any>>;
  videos: Array<Record<string, any>>;
  chunks: Array<Record<string, any>>;
  analyses: Array<Record<string, any>>;
  notes: Array<Record<string, any>>;
  exercisePlans: Array<Record<string, any>>;
  grants: Array<Record<string, any>>;
  audit: Array<Record<string, any>>;
  writes: {
    transactions: number;
    inserts: Array<{ table: unknown; values: unknown }>;
    playerUpdates: Array<Record<string, any>>;
  };
  nextVideoId: number;
  nextAnalysisId: number;
  nextExercisePlanId: number;
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
    },
    players: [testPlayer()],
    videos: [],
    chunks: [],
    analyses: [],
    notes: [],
    exercisePlans: [],
    grants: [],
    audit: [],
    writes: { transactions: 0, inserts: [], playerUpdates: [] },
    nextVideoId: 302,
    nextAnalysisId: 501,
    nextExercisePlanId: 801,
    ...overrides,
  };
}

function rowsFor(
  fixture: AthleteRouteFixture,
  table: unknown,
  selection: Record<string, unknown> | undefined
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
  return [];
}

/** Creates only the chain methods called by the athlete routes under test. */
export function createAthleteRouteDb(fixture: AthleteRouteFixture): any {
  const db: any = {
    select(selection?: Record<string, unknown>) {
      let table: unknown;
      const chain: any = {
        from(value: unknown) {
          table = value;
          return chain;
        },
        innerJoin: () => chain,
        where: () => chain,
        limit: () => chain,
        for: () => chain,
        orderBy: () => chain,
        then(
          resolve: (rows: Array<Record<string, any>>) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(rowsFor(fixture, table, selection)).then(
            resolve,
            reject
          );
        },
      };
      return chain;
    },
    insert(table: unknown) {
      return {
        values: async (values: any) => {
          fixture.writes.inserts.push({ table, values });
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
          return [{ insertId: 1 }];
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, any>) {
          return {
            where: async () => {
              if (table === players && fixture.players[0]) {
                Object.assign(fixture.players[0], values);
                fixture.writes.playerUpdates.push(values);
              }
              if (table === analyses && fixture.analyses[0]) {
                Object.assign(fixture.analyses.at(-1)!, values);
              }
              if (table === notes && fixture.notes[0]) {
                Object.assign(fixture.notes.at(-1)!, values);
              }
              if (table === exercisePlans && fixture.exercisePlans[0]) {
                Object.assign(fixture.exercisePlans.at(-1)!, values);
              }
              return [];
            },
          };
        },
      };
    },
    delete() {
      return { where: async () => [] };
    },
  };
  db.transaction = async (callback: (tx: any) => Promise<unknown>) => {
    fixture.writes.transactions += 1;
    return callback(db);
  };
  return db;
}
