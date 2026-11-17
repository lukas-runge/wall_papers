import { describe, expect, it } from "vitest";
import { bannerParts } from "./generated/banner-parts";
import { CI_MODES } from "./colors";
import {
  DEFAULT_SLOTS,
  SLOTS,
  bannerColour,
  bannerMarkup,
  boxSvg,
  crossMarkup,
  embedAsset,
  flattenSvg,
  inlineClasses,
  mapAssetColour,
  parseClassRules,
  slotContent,
} from "./banner";

const green = CI_MODES[0];
const pink = CI_MODES[4];
const rules = parseClassRules(bannerParts.style);

describe("class inlining", () => {
  it("reads the banner stylesheet", () => {
    expect(rules["cls-7"]).toEqual({ fill: "#e7edea" });
    expect(rules["cls-3"]).toEqual({ fill: "none", "stroke-miterlimit": "10", stroke: "#75b24c", "stroke-width": "1.45" });
  });
  it("replaces classes by attributes", () => {
    expect(inlineClasses('<path class="cls-7" d="M0 0"/>', rules)).toBe('<path fill="#e7edea" d="M0 0"/>');
  });
});

describe("boxes", () => {
  it("default slots give back the original banner contents", () => {
    for (const slot of SLOTS) {
      const id = DEFAULT_SLOTS[slot].slice("banner:".length) as keyof typeof bannerParts.creatures;
      expect(slotContent(slot, DEFAULT_SLOTS[slot], green, [])).toBe(inlineClasses(bannerParts.creatures[id].markup, rules));
    }
  });

  it("generates the X with the original coordinates", () => {
    expect(crossMarkup(bannerParts.frames.L2.box)).toContain('x1="91.64" y1="127.22" x2="27.07" y2="202.88"');
  });

  it("moves a figure into another box, standing on its bottom edge", () => {
    const dy = bannerParts.frames.R1.box[3] - bannerParts.frames.L1.box[3];
    expect(slotContent("R1", "banner:hood", green, [])).toMatch(new RegExp(`^<g transform="translate\\([\\d.]+ ${Math.round(dy * 1000) / 1000}\\)">`));
  });

  it("can leave a box empty", () => {
    expect(slotContent("L1", "empty", green, [])).toBe("");
  });

  it("renders a single box for the picker", () => {
    const svg = boxSvg("R2", "banner:swirl", pink, []);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="/);
    expect(svg).toContain(pink.accent);
    expect(svg).not.toContain("class=");
  });
});

describe("colours", () => {
  it("keeps the original banner greens in green", () => {
    expect(bannerColour(green)("#6ab143")).toBe("#6ab143");
    expect(bannerColour(green)("#75b24c")).toBe("#75b24c");
  });
  it("recolours frames and lines", () => {
    expect(bannerColour(pink)("#6ab143")).toBe(pink.accent);
    expect(bannerColour(pink)("#e7edea")).toBe("#e7edea");
  });
  it("maps styleguide asset colours onto the palette", () => {
    expect(mapAssetColour("#75b44b", pink)).toBe(pink.accent);
    expect(mapAssetColour("#ebedf0", pink)).toBe("#e7edea");
    expect(mapAssetColour("#001300", pink)).toBe(pink.ground);
  });
});

describe("assets", () => {
  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><defs><style>.cls-1{fill:#75b44b}</style><clipPath id="clippath"><rect width="1" height="1"/></clipPath></defs><path class="cls-1" clip-path="url(#clippath)" d="M0 0h10v20z"/></svg>`;
  it("inlines classes, prefixes ids and recolours", () => {
    const out = embedAsset(svg, "a-L1-", bannerParts.frames.L1.box, pink);
    expect(out).not.toContain("class=");
    expect(out).toContain(`fill="${pink.accent}"`);
    expect(out).toContain('id="a-L1-clippath"');
    expect(out).toContain("url(#a-L1-clippath)");
  });
  it("fits the asset inside the frame", () => {
    const out = embedAsset(svg, "p-", bannerParts.frames.L1.box, pink);
    const h = Number(/height="([\d.]+)"/.exec(out)![1]);
    const [, y0, , y1] = bannerParts.frames.L1.box;
    expect(h).toBeLessThan(y1 - y0);
  });
  it("flattens a stylesheet away", () => {
    expect(flattenSvg(svg)).not.toContain("<style>");
  });
});

describe("banner markup", () => {
  const logo = '<svg viewBox="0 0 1 1"><defs><style>.cls-1{fill:#ebedf0}</style></defs><path class="cls-1" d="M0 0"/></svg>';
  it("has no classes left and no full-size background", () => {
    const m = bannerMarkup({ palette: green, slots: DEFAULT_SLOTS, assets: [], logo, shift: 0 });
    expect(m).not.toContain("class=");
    expect(m).not.toContain('width="678"');
    expect(m).toContain('<g data-name="Left column" transform="translate(0 0)">');
    expect(m).toContain('fill="#e7edea" d="M0 0"');
  });
  it("moves the columns inwards for a shorter wordmark", () => {
    const m = bannerMarkup({ palette: green, slots: DEFAULT_SLOTS, assets: [], logo, shift: 21.85 });
    expect(m).toContain('<g data-name="Left column" transform="translate(21.85 0)">');
    expect(m).toContain('<g data-name="Right column" transform="translate(-21.85 0)">');
  });
});
