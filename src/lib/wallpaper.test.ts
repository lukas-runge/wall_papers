import { describe, expect, it } from "vitest";
import { bannerFrame, boxRects, wallpaperSvg, wordmarkGeometry } from "./wallpaper";
import { CI_MODES } from "./colors";
import { DEFAULT_SLOTS } from "./banner";
import { LOGO_SVG, PATTERNS } from "./assets";

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

describe("wordmark geometry", () => {
  it("puts the first line where the renderer draws it", () => {
    const g = wordmarkGeometry({ lines: ["MODEL_", "CITIZENS"], placement: "lockscreen" }, 7680, 4320);
    expect(g.lines[0].x).toBeCloseTo(1101.86 + 324.715 * 8.077, 0);
    expect(g.lines[1].baseline - g.lines[0].baseline).toBeCloseTo(42.35 * 8.077, 0);
    expect(g.fontSize).toBeCloseTo(274.12, 1);
    expect(g.rect.w).toBeGreaterThan(8 * 165);
  });

  it("can leave the text out but keeps the layout", () => {
    const d = { lines: ["SELF_", "HOSTED"] as [string, string], palette: CI_MODES[0], slots: DEFAULT_SLOTS, placement: "centered" as const };
    const src = { patterns: PATTERNS, logo: LOGO_SVG, assets: [] };
    const hidden = wallpaperSvg({ ...d, hideText: true }, 640, 360, src);
    expect(hidden).not.toContain("HOSTED</text>");
    expect(hidden.match(/data-name="Left column" transform="[^"]+"/)?.[0]).toBe(wallpaperSvg(d, 640, 360, src).match(/data-name="Left column" transform="[^"]+"/)?.[0]);
  });
});
