import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEMO_SHOOTING_TITLE,
  loadVerifiedDemoShootingFixture,
} from "./demoVideoFixture";

describe("licensed private shooting demo fixture", () => {
  it("loads only the checksum-verified source file for the non-person demo record", async () => {
    const data = await loadVerifiedDemoShootingFixture();
    expect(DEMO_SHOOTING_TITLE).toBe("ملف تجريبي — عينة تسديد");
    expect(DEMO_SHOOTING_TITLE.startsWith("ملف تجريبي")).toBe(true);
    expect(data.length).toBe(1_009_285);
    expect(data.subarray(4, 8).toString("ascii")).toBe("ftyp");
    expect(createHash("sha256").update(data).digest("hex")).toBe(
      "6658c89b2a8298e74fc5d6d81e12232fe84d83f716a10339d757f78bcfb3f564"
    );
  });
});
