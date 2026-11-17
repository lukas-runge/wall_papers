import { describe, expect, it } from "vitest";
import { ADVANCE, ORIGINAL_LINES, TEXT, layoutWordmark, patternTiles, slug } from "./layout";

describe("wordmark layout", () => {
  it("keeps the hand-kerned original exactly where it was", () => {
    const l = layoutWordmark(ORIGINAL_LINES);
    expect(l.shift).toBe(0);
    expect(l.glyphs.map((g) => g.char).join("")).toBe("MODEL_CITIZENS");
    expect(l.glyphs[0]).toEqual({ char: "M", x: 324.715, y: TEXT.baselines[0] });
    expect(l.glyphs[13]).toEqual({ char: "S", x: 479.237, y: TEXT.baselines[1] });
  });

  it("centres shorter text and moves the columns in (as built by hand for SELF_ HOSTED)", () => {
    const l = layoutWordmark(["SELF_", "HOSTED"]);
    // 176.5 px in the 8K wallpaper = 21.85 banner units
    expect(l.shift).toBeCloseTo(21.85, 0);
    expect(l.columnShift).toBe(l.shift);
    expect(l.glyphs[1].x - l.glyphs[0].x).toBeCloseTo(ADVANCE + TEXT.spacing, 6);
  });

  it("moves the columns out for longer text", () => {
    expect(layoutWordmark(["WALL_", "PAPERS_ROCK"]).shift).toBeLessThan(0);
  });
});

describe("pattern", () => {
  it("has 9 rows of 7 strips like the original generator", () => {
    const t = patternTiles();
    expect(t).toHaveLength(63);
    expect(t[0]).toEqual({ pattern: 0, left: 0, top: -3, flip: true });
  });
});

describe("slug", () => {
  it("makes file-name friendly slogans", () => {
    expect(slug(["SELF_", "HOSTED"])).toBe("SELF_HOSTED");
    expect(slug(["::1_", "FIRST"])).toBe("1_FIRST");
    expect(slug(["", ""])).toBe("WALLPAPER");
  });
});
