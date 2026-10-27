import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  organizations,
  players,
  videoChunks,
  videos,
} from "../../drizzle/schema";
import { MAX_VIDEO_BYTES, type VideoSource } from "../../shared/athlete";

const ONE_MIB = 1024 * 1024;
export const DEMO_SHOOTING_TITLE = "ملف تجريبي — عينة تسديد";
const DEMO_FIXTURE_POSITION = "ملف فيديو تجريبي";
const DEMO_FIXTURE_SHA256 =
  "6658c89b2a8298e74fc5d6d81e12232fe84d83f716a10339d757f78bcfb3f564";
const DEMO_FIXTURE_BYTES = 1_009_285;

/** Provenance applies to this video only; it never identifies the depicted person. */
const DEMO_SHOOTING_SOURCE: VideoSource = {
  url: "https://www.pexels.com/video/a-player-kicking-a-soccer-ball-6078273/",
  license: "Pexels License — https://www.pexels.com/license/",
  credit:
    "Tima Miroshnichenko — https://www.pexels.com/@tima-miroshnichenko/",
  description:
    "Dynamic indoor soccer training emphasizing practice and skill. Pexels video ID 6078273; source range 00:00:02.500–00:00:12.500, proportionally scaled to 1280×720. Original filming date is unknown. The depicted person’s identity is unknown and is not the demo record.",
};

let verifiedFixture: Promise<Buffer> | undefined;

function fixturePath(): string {
  return join(process.cwd(), "demo-assets", "shooting-example.mp4");
}

function isMp4(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}

/** Reads only the checked-in private asset and rejects any modified or invalid source file. */
export async function loadVerifiedDemoShootingFixture(): Promise<Buffer> {
  if (!verifiedFixture) {
    verifiedFixture = (async () => {
      let data: Buffer;
      try {
        data = await readFile(fixturePath());
      } catch {
        throw new Error("تعذر العثور على ملف عينة التسديد المرخّص للتحقق");
      }
      const hash = createHash("sha256").update(data).digest("hex");
      if (
        data.length !== DEMO_FIXTURE_BYTES ||
        data.length > MAX_VIDEO_BYTES ||
        !isMp4(data) ||
        hash !== DEMO_FIXTURE_SHA256
      ) {
        throw new Error("ملف عينة التسديد المرخّص لم يجتز التحقق");
      }
      return data;
    })();
  }
  return Buffer.from(await verifiedFixture);
}

function insertId(result: unknown): number {
  const first = Array.isArray(result) ? result[0] : result;
  const id = Number((first as { insertId?: unknown } | undefined)?.insertId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("لم يُرجع إدراج عينة الفيديو معرّفًا صالحًا");
  return id;
}

/**
 * Inserts no analyses and updates no existing rows. The workspace organization row
 * is locked only to serialize concurrent idempotent fixture checks.
 */
export async function ensureLicensedDemoShootingFixtureInTransaction(
  tx: any,
  academyId: number
): Promise<{ playerId: number; videoId: number; created: boolean }> {
  const workspaceRows = await tx
    .select({ id: organizations.id, type: organizations.type, isDemo: organizations.isDemo })
    .from(organizations)
    .where(eq(organizations.id, academyId))
    .limit(1)
    .for("update");
  const workspace = workspaceRows[0];
  if (!workspace || workspace.type !== "academy" || !workspace.isDemo)
    throw new Error("مساحة عينة التسديد ليست أكاديمية عرض صالحة");

  const fixturePlayers = await tx
    .select()
    .from(players)
    .where(
      and(
        eq(players.academyId, academyId),
        eq(players.name, DEMO_SHOOTING_TITLE),
        eq(players.position, DEMO_FIXTURE_POSITION)
      )
    )
    .limit(1)
    .for("update");
  let playerId = fixturePlayers[0]?.id;
  const now = new Date();
  if (!playerId) {
    const created = await tx.insert(players).values({
      academyId,
      name: DEMO_SHOOTING_TITLE,
      age: 0,
      nationality: "غير منسوب",
      position: DEMO_FIXTURE_POSITION,
      foot: "غير منسوب",
      height: 0,
      weight: 0,
      region: "مصدر مرخّص",
      birthDate: "",
      jersey: 0,
      photoKey: "",
      overall: 0,
      improvement: 0,
      discoverable: false,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
      lastAnalysisAt: null,
      createdAt: now,
    });
    playerId = insertId(created);
  }

  const existingVideos = await tx
    .select({ id: videos.id })
    .from(videos)
    .where(
      and(eq(videos.playerId, playerId), eq(videos.title, DEMO_SHOOTING_TITLE))
    )
    .limit(1)
    .for("update");
  if (existingVideos[0])
    return { playerId, videoId: existingVideos[0].id, created: false };

  const data = await loadVerifiedDemoShootingFixture();
  const createdVideo = await tx.insert(videos).values({
    playerId,
    title: DEMO_SHOOTING_TITLE,
    skill: "التسديد",
    recordedAt: now,
    size: data.length,
    mime: "video/mp4",
    source: DEMO_SHOOTING_SOURCE,
    createdAt: now,
  });
  const videoId = insertId(createdVideo);
  await tx.insert(videoChunks).values(
    Array.from({ length: Math.ceil(data.length / ONE_MIB) }, (_, chunkIndex) => ({
      videoId,
      chunkIndex,
      data: data.subarray(
        chunkIndex * ONE_MIB,
        Math.min((chunkIndex + 1) * ONE_MIB, data.length)
      ),
    }))
  );
  await tx.insert(auditEvents).values({
    organizationId: academyId,
    actorUserId: null,
    entityType: "video",
    entityId: videoId,
    action: "video.demo_licensed_fixture_seeded",
    metadata: {
      title: DEMO_SHOOTING_TITLE,
      skill: "التسديد",
      sha256: DEMO_FIXTURE_SHA256,
      sourcePage: DEMO_SHOOTING_SOURCE.url,
      fixtureOnly: true,
      noDepictedPersonIdentity: true,
      analysisSeeded: false,
    },
  });
  return { playerId, videoId, created: true };
}

/** Uses a short transaction so `/session` can repair older demo workspaces safely. */
export async function ensureLicensedDemoShootingFixture(
  db: any,
  academyId: number
): Promise<{ playerId: number; videoId: number; created: boolean }> {
  return db.transaction((tx: any) =>
    ensureLicensedDemoShootingFixtureInTransaction(tx, academyId)
  );
}
