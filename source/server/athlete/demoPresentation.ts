import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { auditEvents, players, videos } from "../../drizzle/schema";
import type { Video, VideoSource } from "../../shared/athlete";
import {
  DEMO_DISPLAY_VERSION,
  catalogForPlayer,
  overall10,
  performanceLevel,
  type DemoDisplay,
} from "../../shared/demo-display";
import type { CoachAssessment } from "../../shared/coaching";

const DEMO_SKILLS_DIRECTORY = resolve(process.cwd(), "demo-assets", "skills");
const DEMO_MANIFEST_PATH = join(DEMO_SKILLS_DIRECTORY, "manifest.json");
const MAX_DEMO_ASSET_BYTES = 100 * 1024 * 1024;
const DEMO_COLLECTIONS = new Set([
  "striker",
  "winger",
  "goalkeeper",
  "wag-vault",
  "wag-uneven_bars",
  "wag-balance_beam",
  "wag-floor",
  "mag-floor",
  "mag-pommel_horse",
  "mag-rings",
  "mag-vault",
  "mag-parallel_bars",
  "mag-horizontal_bar",
]);

export type DemoAssetManifestClip = {
  key: string;
  collection: string;
  skill: string;
  file: string;
  posterKey: string;
  duration: number;
  sha256: string;
  size: number;
  source: VideoSource;
};

type VerifiedDemoAsset = DemoAssetManifestClip & { data: Buffer };

type VerifiedAssetCacheEntry = {
  mtimeMs: number;
  size: number;
  data: Buffer;
};

// Cache bytes, never the manifest. Each caller still parses the current
// manifest, so newly checked-in clips appear immediately and updated source
// metadata is returned with the current manifest object.
const verifiedAssetCache = new Map<string, VerifiedAssetCacheEntry>();
const MAX_VERIFIED_ASSET_CACHE_ENTRIES = 256;

type DemoSeedPlayer = {
  id: number;
  academyId: number;
  sport: string;
  position: string;
  primaryApparatus: string | null;
  demoProfileKey: string | null;
};

function safeAssetKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,159}$/i.test(value);
}

function safeRelativeMp4(value: unknown): value is string {
  if (typeof value !== "string" || !value || !value.endsWith(".mp4")) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  const normalized = value.replaceAll("\\", "/");
  return (
    !normalized.startsWith("/") &&
    !normalized.split("/").some(segment => segment === ".." || !segment)
  );
}

function safeSource(value: unknown): VideoSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    typeof source.url !== "string" ||
    typeof source.license !== "string" ||
    typeof source.credit !== "string" ||
    typeof source.description !== "string"
  )
    return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
  } catch {
    return null;
  }
  return {
    url: source.url,
    license: source.license,
    credit: source.credit,
    description: source.description,
  };
}

function validClip(value: unknown): value is DemoAssetManifestClip {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const clip = value as Record<string, unknown>;
  const source = safeSource(clip.source);
  return (
    safeAssetKey(clip.key) &&
    typeof clip.collection === "string" &&
    DEMO_COLLECTIONS.has(clip.collection) &&
    typeof clip.skill === "string" &&
    clip.skill.trim().length > 0 &&
    clip.skill.length <= 80 &&
    safeRelativeMp4(clip.file) &&
    typeof clip.posterKey === "string" &&
    clip.posterKey.length <= 255 &&
    typeof clip.duration === "number" &&
    Number.isFinite(clip.duration) &&
    clip.duration > 0 &&
    clip.duration <= 3600 &&
    typeof clip.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(clip.sha256) &&
    typeof clip.size === "number" &&
    Number.isSafeInteger(clip.size) &&
    clip.size > 0 &&
    clip.size <= MAX_DEMO_ASSET_BYTES &&
    source !== null
  );
}

/**
 * Reads the checked-in manifest defensively. A missing/invalid manifest is a
 * normal pending-assets condition: callers seed ratings but no demo media.
 */
export async function readDemoAssetManifest(): Promise<DemoAssetManifestClip[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(DEMO_MANIFEST_PATH, "utf8"));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const rawClips = (parsed as { clips?: unknown }).clips;
  if (!Array.isArray(rawClips)) return [];

  const keys = new Set<string>();
  const hashes = new Set<string>();
  const clips: DemoAssetManifestClip[] = [];
  for (const rawClip of rawClips) {
    if (!validClip(rawClip)) continue;
    const clip = rawClip as DemoAssetManifestClip;
    // A repeated complete file would be the same scene, not an independent
    // meaningful skill example. Ignore it rather than attach duplicate media.
    if (keys.has(clip.key) || hashes.has(clip.sha256.toLowerCase())) continue;
    keys.add(clip.key);
    hashes.add(clip.sha256.toLowerCase());
    clips.push({ ...clip, source: safeSource(clip.source)! });
  }
  return clips;
}

function assetFilePath(clip: DemoAssetManifestClip): string | null {
  const path = resolve(DEMO_SKILLS_DIRECTORY, clip.file);
  const insideDirectory = relative(DEMO_SKILLS_DIRECTORY, path);
  if (!insideDirectory || insideDirectory.startsWith("..") || path === DEMO_SKILLS_DIRECTORY)
    return null;
  return path;
}

async function verifiedDemoAssetForClip(
  clip: DemoAssetManifestClip
): Promise<VerifiedDemoAsset | null> {
  const path = assetFilePath(clip);
  if (!path) return null;
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(path);
  } catch {
    return null;
  }
  if (
    !fileStat.isFile() ||
    fileStat.size !== clip.size ||
    fileStat.size > MAX_DEMO_ASSET_BYTES
  ) {
    return null;
  }

  const cacheKey = `${path}\0${clip.sha256.toLowerCase()}\0${clip.size}`;
  const cached = verifiedAssetCache.get(cacheKey);
  if (
    cached &&
    cached.size === fileStat.size &&
    cached.mtimeMs === fileStat.mtimeMs
  ) {
    return { ...clip, data: cached.data };
  }

  let data: Buffer;
  try {
    data = await readFile(path);
  } catch {
    return null;
  }
  const hash = createHash("sha256").update(data).digest("hex");
  if (
    data.length !== clip.size ||
    data.length > MAX_DEMO_ASSET_BYTES ||
    hash !== clip.sha256.toLowerCase() ||
    data.length < 12 ||
    data.subarray(4, 8).toString("ascii") !== "ftyp"
  ) {
    return null;
  }
  if (verifiedAssetCache.size >= MAX_VERIFIED_ASSET_CACHE_ENTRIES)
    verifiedAssetCache.clear();
  verifiedAssetCache.set(cacheKey, {
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    data,
  });
  return { ...clip, data };
}

/** Hash-verifies a safe manifest asset before it is ever served or referenced. */
export async function verifiedDemoAssetForKey(
  key: string
): Promise<VerifiedDemoAsset | null> {
  if (!safeAssetKey(key)) return null;
  const clip = (await readDemoAssetManifest()).find(item => item.key === key);
  if (!clip) return null;
  return verifiedDemoAssetForClip(clip);
}

function demoSourceForClip(clip: DemoAssetManifestClip, addedAt: Date): VideoSource {
  const generatedSimulation = clip.source.license.startsWith(
    "AI-generated simulation"
  );
  return {
    ...clip.source,
    description: `${clip.source.description} ${
      generatedSimulation
        ? "محاكاة مولدة لأغراض العرض؛ لا تصوّر اللاعب الخيالي ولا تثبت هويته."
        : "مثال مهارة مرخّص عام؛ لا يصوّر اللاعب الخيالي ولا يثبت هويته."
    } تاريخ إضافة عينة العرض: ${addedAt.toISOString().slice(0, 10)}.`.trim(),
  };
}

function demoTitleForClip(clip: DemoAssetManifestClip): string {
  return clip.source.license.startsWith("AI-generated simulation")
    ? `محاكاة مولدة — ${clip.skill}`
    : `عينة مهارة مرخّصة — ${clip.skill}`;
}

function collectionForProfileKey(key: string | null): string | null {
  return key && DEMO_COLLECTIONS.has(key) ? key : null;
}

/**
 * Stores metadata/reference rows only. It never copies the checked-in MP4 into
 * video_chunks, creates no analyses, and is safe to rerun as assets appear.
 */
export async function refreshDemoMediaReferencesInTransaction(
  tx: any,
  academyId: number,
  now: Date
): Promise<number> {
  const manifest = await readDemoAssetManifest();
  if (!manifest.length) return 0;
  const playerRows = (await tx
    .select({
      id: players.id,
      academyId: players.academyId,
      sport: players.sport,
      position: players.position,
      primaryApparatus: players.primaryApparatus,
      demoProfileKey: players.demoProfileKey,
    })
    .from(players)
    .where(eq(players.academyId, academyId))
    .for("update")) as DemoSeedPlayer[];

  const candidates: { player: DemoSeedPlayer; clip: DemoAssetManifestClip }[] = [];
  const candidateClipsByKey = new Map<string, DemoAssetManifestClip>();
  for (const player of playerRows) {
    const collection = collectionForProfileKey(player.demoProfileKey);
    if (!collection) continue;
    const allowedSkills = new Set(
      catalogForPlayer(
        player.sport,
        player.position,
        player.primaryApparatus
      ).map(item => item.name)
    );
    for (const clip of manifest) {
      if (clip.collection !== collection || !allowedSkills.has(clip.skill)) continue;
      candidates.push({ player, clip });
      candidateClipsByKey.set(clip.key, clip);
    }
  }
  if (!candidates.length) return 0;

  // Verify once per manifest clip before storing any playable reference. The
  // verifier uses the current manifest plus a file-stat keyed byte cache.
  const verifiedByKey = new Map<string, VerifiedDemoAsset>();
  const verificationResults = await Promise.all(
    [...candidateClipsByKey.values()].map(async clip => [
      clip.key,
      await verifiedDemoAssetForClip(clip),
    ] as const)
  );
  for (const [key, asset] of verificationResults)
    if (asset) verifiedByKey.set(key, asset);
  if (!verifiedByKey.size) return 0;

  const candidatePlayerIds = [...new Set(candidates.map(item => item.player.id))];
  const verifiedKeys = [...verifiedByKey.keys()];
  const existingRows = await tx
    .select({ playerId: videos.playerId, demoAssetKey: videos.demoAssetKey })
    .from(videos)
    .where(
      and(
        inArray(videos.playerId, candidatePlayerIds),
        inArray(videos.demoAssetKey, verifiedKeys)
      )
    )
    .for("update");
  const existingReferences = new Set(
    existingRows.flatMap((row: { playerId: number; demoAssetKey: string | null }) =>
      typeof row.demoAssetKey === "string"
        ? [`${row.playerId}\0${row.demoAssetKey}`]
        : []
    )
  );
  const rowsToInsert = candidates.filter(
    ({ player, clip }) =>
      verifiedByKey.has(clip.key) &&
      !existingReferences.has(`${player.id}\0${clip.key}`)
  );
  if (!rowsToInsert.length) return 0;

  await tx.insert(videos).values(
    rowsToInsert.map(({ player, clip }) => ({
      playerId: player.id,
      title: demoTitleForClip(clip),
      skill: clip.skill,
      // This is deliberately the demo-record addition date. The original
      // recording date, if supplied, remains in the immutable source text.
      recordedAt: now,
      size: clip.size,
      mime: "video/mp4",
      source: demoSourceForClip(clip, now),
      demoAssetKey: clip.key,
      // Values under one second intentionally round to zero for this integer
      // column; the verified file remains playable and is not discarded.
      durationSeconds: Math.round(clip.duration),
      posterKey: clip.posterKey || null,
      createdAt: now,
    }))
  );

  // Do not infer multi-row insert IDs: re-read the exact newly missing pairs so
  // audit records keep their correct entity ID on every MySQL configuration.
  const insertedReferences = new Set(
    rowsToInsert.map(({ player, clip }) => `${player.id}\0${clip.key}`)
  );
  const insertedVideoRows = await tx
    .select({ id: videos.id, playerId: videos.playerId, demoAssetKey: videos.demoAssetKey })
    .from(videos)
    .where(
      and(
        inArray(videos.playerId, candidatePlayerIds),
        inArray(videos.demoAssetKey, verifiedKeys)
      )
    )
    .for("update");
  const candidateByReference = new Map(
    rowsToInsert.map(item => [`${item.player.id}\0${item.clip.key}`, item])
  );
  const auditRows = insertedVideoRows.flatMap((video: {
    id: number;
    playerId: number;
    demoAssetKey: string | null;
  }) => {
    if (typeof video.demoAssetKey !== "string") return [];
    const reference = `${video.playerId}\0${video.demoAssetKey}`;
    const candidate = candidateByReference.get(reference);
    if (!insertedReferences.has(reference) || !candidate) return [];
    return [{
      organizationId: academyId,
      actorUserId: null,
      entityType: "video",
      entityId: video.id,
      action: "video.demo_manifest_reference_seeded",
      metadata: {
        playerId: candidate.player.id,
        demoAssetKey: candidate.clip.key,
        collection: candidate.clip.collection,
        skill: candidate.clip.skill,
        sha256: candidate.clip.sha256,
        noDepictedPersonIdentity: true,
        noVideoChunksCopied: true,
        analysisSeeded: false,
      },
    }];
  });
  if (auditRows.length) await tx.insert(auditEvents).values(auditRows);
  return rowsToInsert.length;
}

export function isManifestBackedDemoVideo(video: Record<string, unknown>): boolean {
  return typeof video.demoAssetKey === "string" && video.demoAssetKey.length > 0;
}

/** Hide only superseded copied legacy training samples once a verified asset exists. */
export function withoutSupersededLegacyDemoVideos<T extends object>(
  player: Record<string, unknown>,
  videoRows: readonly T[]
): T[] {
  if (
    typeof player.demoProfileKey !== "string" ||
    !videoRows.some(video =>
      isManifestBackedDemoVideo(video as Record<string, unknown>)
    )
  )
    return [...videoRows];
  return videoRows.filter(video => {
    const title =
      typeof (video as Record<string, unknown>).title === "string"
        ? String((video as Record<string, unknown>).title)
        : "";
    return !title.startsWith("عينة تدريب مرخّصة — لا تمثل اللاعب");
  });
}

function sortedAssessments(
  assessments: readonly CoachAssessment[]
): CoachAssessment[] {
  return [...assessments].sort((left, right) => {
    const leftAt = new Date(left.assessedAt).getTime();
    const rightAt = new Date(right.assessedAt).getTime();
    const safeLeft = Number.isFinite(leftAt) ? leftAt : Number.NEGATIVE_INFINITY;
    const safeRight = Number.isFinite(rightAt) ? rightAt : Number.NEGATIVE_INFINITY;
    return safeLeft - safeRight || left.id - right.id;
  });
}

/** Latest selection is deterministic by assessment timestamp and then database id. */
export function latestDemoAssessment(
  assessments: readonly CoachAssessment[]
): CoachAssessment | null {
  return sortedAssessments(assessments).at(-1) ?? null;
}

/**
 * Constructs no synthetic score fallback: every displayed score comes from the
 * same latest saved assessment as the overall. A partial manual assessment
 * leaves its unmeasured catalog skills null, rather than mixing older snapshots.
 */
export function demoPresentationForPlayer(
  player: Record<string, unknown>,
  assessments: readonly CoachAssessment[],
  videoRows: readonly Video[]
): DemoDisplay | null {
  if (typeof player.demoProfileKey !== "string" || !player.demoProfileKey)
    return null;
  const ordered = sortedAssessments(assessments);
  const latest = ordered.at(-1);
  if (!latest) return null;
  const catalog = catalogForPlayer(
    String(player.sport ?? ""),
    String(player.position ?? ""),
    typeof player.primaryApparatus === "string"
      ? player.primaryApparatus
      : null
  );
  if (!catalog.length) return null;
  const latestScoreBySkill = new Map<string, number>();
  for (const skill of latest.skills) {
    if (typeof skill.score === "number" && Number.isFinite(skill.score)) {
      latestScoreBySkill.set(skill.name, skill.score);
    }
  }

  const visibleVideos = withoutSupersededLegacyDemoVideos(
    player,
    videoRows.filter(video => video.playerId === Number(player.id))
  );
  const demoVariation = Array.from(String(player.demoProfileKey)).reduce(
    (total, character) => total + character.charCodeAt(0), 0
  ) % 11;
  return {
    source: "demo",
    version: DEMO_DISPLAY_VERSION,
    overall10: overall10(latest),
    level: performanceLevel(
      typeof latest.overall === "number" ? latest.overall : overall10(latest) * 10
    ),
    assessments: [...ordered].reverse(),
    skills: catalog.map(skill => {
      const score = latestScoreBySkill.get(skill.name) ?? null;
      const focus = skill.criteria.at(-1) ?? skill.name;
      return {
        ...skill,
        score,
        level: score === null ? "لم تُقيّم بعد" : performanceLevel(score),
        strengths: score === null ? [] : [score >= 75
          ? `نقطة قوة في مثال ${skill.name}: ${skill.criteria[0] ?? skill.name}`
          : `أساس أولي في ${skill.name} قابل للبناء ضمن مثال العرض`],
        development: score === null ? [] : [`مجال تطوير ${skill.name}: ${focus}`],
        notes: score === null
          ? "لم تتضمن جلسة المدرب الأخيرة قياسًا لهذه المهارة؛ لا تُستعار درجة من جلسة سابقة."
          : `ملخص عرض ${skill.name}: التقييم المحفوظ ${score}/100. يركز المثال التدريبي على ${focus}. هذه صياغة توضيحية من الدرجة المسجلة، وليست استنتاجًا من الفيديو أو نصًا منسوبًا للمدرب؛ أقوال المدرب الأصلية في سجل الملاحظات.`,
        exercises: score === null ? [] : [{
          title: `تمرين تصحيحي تجريبي — ${skill.name}`,
          description: `تدرّب بالتدرج على ${focus} تحت إشراف المدرب، باستخدام المساندة ومعدات السلامة الملائمة للجهاز أو المركز. هذا اقتراح عرض عام وليس وصفة فردية أو معيارًا علميًا.`,
        }],
        video:
          visibleVideos
            .filter(video => video.skill === skill.name)
            .sort(
              (left, right) =>
                new Date(right.recordedAt).getTime() -
                  new Date(left.recordedAt).getTime() ||
                right.id - left.id
            )[0] ?? null,
      };
    }),
    // These panels are explicitly display metadata, not player physical or
    // motion measurements, and no records are written to assessment tables.
    physicalTests: [
      {
        name: "قفزة عمودية — مثال افتراضي غير مقاس",
        value: String(35 + demoVariation),
        unit: "سم",
      },
      {
        name: "ثبات توازن — مثال افتراضي غير مقاس",
        value: String(20 + demoVariation),
        unit: "ثانية",
      },
      {
        name: "تكرارات تمرين — مثال افتراضي غير مقاس",
        value: String(12 + demoVariation),
        unit: "تكرار",
      },
    ],
    motionIndicators: [
      {
        name: "زاوية ركبة توضيحية — ليست من الفيديو",
        value: 100 + demoVariation,
        unit: "درجة افتراضية",
      },
      {
        name: "زاوية كتف توضيحية — ليست من الفيديو",
        value: 140 + demoVariation,
        unit: "درجة افتراضية",
      },
      {
        name: "زاوية ورك توضيحية — ليست من الفيديو",
        value: 120 + demoVariation,
        unit: "درجة افتراضية",
      },
    ],
  };
}

/** A stable non-sensitive filename is used only inside the protected endpoint. */
export function demoContentFilename(asset: DemoAssetManifestClip): string {
  return `demo-${basename(asset.file).replace(/[^a-zA-Z0-9._-]/g, "")}`;
}
