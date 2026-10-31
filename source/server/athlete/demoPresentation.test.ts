import { describe, expect, it } from "vitest";
import type { Video } from "../../shared/athlete";
import type { CoachAssessment } from "../../shared/coaching";
import { demoCoachAssessmentsForSeed, demoPlayersForSeed } from "./referenceSeed";
import { demoPresentationForPlayer } from "./demoPresentation";

const now = new Date("2026-10-31T00:00:00Z");
const seed = demoPlayersForSeed(now)[0]!;
const player = { ...seed, id: 101 };
const saved: CoachAssessment[] = demoCoachAssessmentsForSeed(seed, 0, now).map((assessment, index) => ({ ...assessment, id: index + 1, playerId: 101, assessedAt: assessment.assessedAt.toISOString() }));

describe("one immutable saved snapshot for demo views", () => {
  it("keeps an unmeasured skill null after a newer partial record instead of importing an older score", () => {
    const latest: CoachAssessment = { ...saved.at(-1)!, id: 99, assessedAt: now.toISOString(), skills: [{ name: "التسديد", score: 90 }], overall: 90 };
    const display = demoPresentationForPlayer(player, [...saved, latest], [])!;
    expect(display.overall10).toBe(9);
    expect(display.skills.find(skill => skill.name === "التسديد")?.score).toBe(90);
    const passing = display.skills.find(skill => skill.name === "التمرير")!;
    expect(passing.score).toBeNull();
    expect(passing.level).toBe("لم تُقيّم بعد");
    expect(passing.notes).toContain("لا تُستعار درجة");
    expect(display.skills).toHaveLength(9);
  });

  it("never associates another athlete's video with this athlete's skill", () => {
    const video: Video = { id: 201, playerId: 102, title: "تسديد", skill: "التسديد", recordedAt: now.toISOString(), createdAt: now.toISOString(), mime: "video/mp4", size: 100 };
    const display = demoPresentationForPlayer(player, saved, [video])!;
    expect(display.skills.find(skill => skill.name === "التسديد")?.video).toBeNull();
    const own = demoPresentationForPlayer(player, saved, [{ ...video, playerId: 101 }])!;
    expect(own.skills.find(skill => skill.name === "التسديد")?.video?.id).toBe(201);
  });

  it("does not invent a demo display for a manual or real profile without a server-owned key", () => {
    expect(demoPresentationForPlayer({ ...player, demoProfileKey: null }, saved, [])).toBeNull();
  });
});
