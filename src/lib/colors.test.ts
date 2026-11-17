import { describe, expect, it } from "vitest";
import { CI_MODES, darkInHue, hexToRgb, paletteFor, rgbToHex, toLch } from "./colors";

describe("background derived from the accent", () => {
  // The CI table was computed once and checked by eye in FigCraft; the
  // derivation must reproduce it for every colour except the original green.
  for (const mode of CI_MODES.filter((m) => m.id !== "gruen")) {
    it(`${mode.name} gives ${mode.ground} / ${mode.edge}`, () => {
      const p = paletteFor(mode.accent);
      expect(p.ground).toBe(mode.ground);
      expect(p.edge).toBe(mode.edge);
    });
  }

  it("keeps the original green background in the green hue", () => {
    const hue = toLch(hexToRgb("#000d00"))[2];
    expect(darkInHue("#000d00", hue)).toBe("#000d00");
    expect(darkInHue("#000900", hue)).toBe("#000900");
  });

  it("uses the accent for all banner accents of a custom colour", () => {
    const p = paletteFor("#00b4ff");
    expect(p.frame).toBe("#00b4ff");
    expect(p.lines).toBe("#00b4ff");
  });
});

describe("hex conversion", () => {
  it("round-trips", () => {
    expect(rgbToHex(hexToRgb("#75b44b"))).toBe("#75b44b");
  });
  it("rejects garbage", () => {
    expect(() => hexToRgb("green")).toThrow();
  });
});
