import { describe, expect, it } from "vitest";
import { bannerFrame, boxRects } from "./wallpaper";

describe("box hotspots", () => {
  it("cover the frames of the original banner", () => {
    const r = boxRects({ lines: ["MODEL_", "CITIZENS"], placement: "lockscreen" }, 7680, 4320);
    // Left top frame starts at banner x 26.08 → 1101.86 + 26.08 · 8.077 px in the 8K wallpaper
    expect(r.L1.x * 7680).toBeCloseTo(1101.86 + 26.08 * 8.077, 0);
    expect(r.L1.y * 4320).toBeCloseTo(0.2284 * 4320 + 30 * 8.077, 0);
    expect(r.R2.h).toBeGreaterThan(r.R1.h);
  });

  it("follow the columns when the text gets shorter", () => {
    const long = boxRects({ lines: ["MODEL_", "CITIZENS"], placement: "centered" }, 1920, 1080);
    const short = boxRects({ lines: ["SELF_", "HOSTED"], placement: "centered" }, 1920, 1080);
    expect(short.L1.x).toBeGreaterThan(long.L1.x);
    expect(short.R1.x).toBeLessThan(long.R1.x);
  });

  it("move down with the banner in the lock-screen layout", () => {
    const c = boxRects({ lines: ["MODEL_", "CITIZENS"], placement: "centered" }, 1920, 1080);
    const l = boxRects({ lines: ["MODEL_", "CITIZENS"], placement: "lockscreen" }, 1920, 1080);
    expect(l.L1.y).toBeGreaterThan(c.L1.y);
    expect(bannerFrame(1920, 1080, "centered").y).toBeCloseTo((1080 - 0.617 * 1080) / 2);
  });
});
