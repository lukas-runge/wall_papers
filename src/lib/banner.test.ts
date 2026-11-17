import { describe, expect, it } from "vitest";
import { bannerParts } from "./generated/banner-parts";
import { CI_MODES } from "./colors";
import { DEFAULT_SLOTS, SLOTS, bannerSvg, bannerStyle, crossMarkup, embedAsset, mapAssetColour, slotContent } from "./banner";

const green = CI_MODES[0];
const pink = CI_MODES[4];

describe("boxes", () => {
  it("default slots give back the original banner contents unchanged", () => {
    for (const slot of SLOTS) {
      const id = DEFAULT_SLOTS[slot].slice("banner:".length) as keyof typeof bannerParts.creatures;
      expect(slotContent(slot, DEFAULT_SLOTS[slot], green, [])).toBe(bannerParts.creatures[id].markup);
    }
  });

  it("generates the X with the original coordinates", () => {
    expect(crossMarkup(bannerParts.frames.L2.box)).toContain('x1="91.64" y1="127.22" x2="27.07" y2="202.88"');
  });

  it("moves a figure into another box, standing on its bottom edge", () => {
    const moved = slotContent("R1", "banner:hood", green, []);
    const dy = bannerParts.frames.R1.box[3] - bannerParts.frames.L1.box[3];
    expect(moved).toMatch(new RegExp(`^<g transform="translate\\([\\d.]+ ${Math.round(dy * 1000) / 1000}\\)">`));
  });

  it("can leave a box empty", () => {
    expect(slotContent("L1", "empty", green, [])).toBe("");
  });
});

describe("colours", () => {
  it("keeps the original banner greens in green", () => {
    expect(bannerStyle(green)).toBe(bannerParts.style);
  });
  it("recolours frames and lines", () => {
    const st = bannerStyle(pink);
    expect(st).not.toMatch(/#6ab143|#75b24c/i);
    expect(st).toContain(pink.accent);
  });
  it("maps styleguide asset colours onto the palette", () => {
    expect(mapAssetColour("#75b44b", pink)).toBe(pink.accent);
    expect(mapAssetColour("#ebedf0", pink)).toBe("#e7edea");
    expect(mapAssetColour("#001300", pink)).toBe(pink.ground);
  });
});

describe("assets", () => {
  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><defs><style>.cls-1{fill:#75b44b}</style><clipPath id="clippath"><rect width="1" height="1"/></clipPath></defs><path class="cls-1" clip-path="url(#clippath)" d="M0 0h10v20z"/></svg>`;
  it("prefixes classes and ids so several assets can share one banner", () => {
    const out = embedAsset(svg, "a-L1-", bannerParts.frames.L1.box, pink);
    expect(out).toContain(".a-L1-cls-1");
    expect(out).toContain('class="a-L1-cls-1"');
    expect(out).toContain('id="a-L1-clippath"');
    expect(out).toContain("url(#a-L1-clippath)");
    expect(out).toContain(pink.accent);
  });
  it("fits the asset inside the frame", () => {
    const out = embedAsset(svg, "p-", bannerParts.frames.L1.box, pink);
    const h = Number(/height="([\d.]+)"/.exec(out)![1]);
    const [, y0, , y1] = bannerParts.frames.L1.box;
    expect(h).toBeLessThan(y1 - y0);
  });
});

describe("banner document", () => {
  it("does not shift anything for the original wordmark", () => {
    const svg = bannerSvg({ palette: green, slots: DEFAULT_SLOTS, assets: [], logo: '<svg viewBox="0 0 1 1"><path class="cls-1" fill="#ebedf0"/></svg>', shift: 0, width: 678, height: 330 });
    expect(svg).toContain('<g transform="translate(0 0)">');
    // The full-size background of the banner is gone (only its unused style rule is left).
    expect(svg).not.toContain('class="cls-6"');
    expect(svg).toContain('class="logo-cls-1"');
  });
});
