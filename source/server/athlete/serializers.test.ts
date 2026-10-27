import { describe, expect, it } from "vitest";
import {
  serializeAnalysis,
  serializePlayer,
  serializePlayerCard,
  serializeVideo,
} from "./serializers";

const storedPlayer = {
  id: 1,
  academyId: 2,
  name: "لاعب تجريبي",
  age: 16,
  nationality: "سعودي",
  position: "مهاجم",
  foot: "أيمن",
  height: 175,
  weight: 64,
  region: "الرياض",
  photoKey: "/brand/player-1.jpg",
  overall: 8.5,
  improvement: 0.5,
  skills: [{ name: "التسديد", value: 88 }],
  discoverable: true,
  lastAnalysisAt: new Date("2026-10-01T00:00:00.000Z"),
  birthDate: "2010-01-15",
  jersey: 10,
  strengths: ["التحكم"],
  weaknesses: ["التحمل"],
  physicalTests: [{ name: "سرعة 30م", value: "4.7", unit: "ث" }],
  history: [
    {
      date: "2026-09-01T00:00:00.000Z",
      label: "2026-09",
      score: 8,
      skill: "التسديد",
    },
  ],
};

describe("player serializers", () => {
  it("does not expose full profile fields in a discovery card", () => {
    const card = serializePlayerCard(storedPlayer, "أكاديمية تجريبية");
    expect(card).not.toHaveProperty("birthDate");
    expect(card).not.toHaveProperty("strengths");
    expect(card).not.toHaveProperty("weaknesses");
    expect(card).not.toHaveProperty("physicalTests");
    expect(card).not.toHaveProperty("history");
  });

  it("returns complete profile only through the full serializer", () => {
    const player = serializePlayer(storedPlayer, "أكاديمية تجريبية");
    expect(player.birthDate).toBe("2010-01-15");
    expect(player.history).toEqual([
      { date: "2026-09-01T00:00:00.000Z", label: "2026-09", score: 8 },
    ]);
  });

  it("preserves a nullable video id when reading a historical analysis", () => {
    expect(
      serializeAnalysis({
        id: 9,
        playerId: 1,
        videoId: null,
        skill: "التسديد",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        score: 8,
      }).videoId
    ).toBeNull();
  });

  it("defaults video state to not analyzed and only completes from supplied saved pose state", () => {
    const video = {
      id: 22,
      playerId: 1,
      title: "مقطع مرخّص",
      skill: "التسديد",
      recordedAt: new Date("2026-10-01T00:00:00.000Z"),
      size: 100,
      mime: "video/mp4",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      source: {
        url: "https://media.example.test/clip.mp4",
        license: "CC BY 4.0",
        credit: "أرشيف مرخّص",
        description: "مصدر للفيديو فقط",
      },
    };
    expect(serializeVideo(video)).toMatchObject({
      analysisStatus: "not_analyzed",
      latestAnalysisId: null,
      latestAnalysisMethod: null,
      analysisAt: null,
      source: video.source,
    });
    expect(
      serializeVideo(video, {
        latestAnalysisId: 91,
        latestAnalysisMethod: "pose",
        analysisAt: new Date("2026-10-02T00:00:00.000Z"),
      })
    ).toMatchObject({
      analysisStatus: "completed",
      latestAnalysisId: 91,
      latestAnalysisMethod: "pose",
      analysisAt: "2026-10-02T00:00:00.000Z",
    });
  });
});
