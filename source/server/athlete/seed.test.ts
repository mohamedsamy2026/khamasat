import { describe, expect, it } from "vitest";
import { demoPlayersForSeed } from "./seed";

describe("ATHLETE AI demo seed", () => {
  it("creates only the unmeasured Messi record without identity media or inferred statistics", () => {
    const players = demoPlayersForSeed(new Date("2026-10-24T00:00:00.000Z"));

    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      name: "ميسي",
      age: 0,
      height: 0,
      weight: 0,
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
    });
  });

  it("does not create a fixed simulated analysis or zero-valued history as performance statistics", () => {
    const [player] = demoPlayersForSeed();

    expect(player?.history).toEqual([]);
    expect(player?.skills).toEqual([]);
    expect(player?.physicalTests).toEqual([]);
    expect("demoAnalysisPayload" in (player ?? {})).toBe(false);
  });
});
