import { describe, expect, it } from "vitest";
import { bannerParts } from "./generated/banner-parts";
import { CI_MODES } from "./colors";
import { ASSETS } from "./assets";
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
  assetTone,
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
  it("turns styleguide assets into ink and paper", () => {
    expect(assetTone("Icon_Cat", "#75b44b")).toBe("ink");
    expect(assetTone("Icon_Cat", "#ebedf0")).toBe("ink");
    expect(assetTone("Adam", "#001300")).toBe("paper");
    // Blåhaj: the pink square disappears, the shark (unfilled, white) is ink
    expect(assetTone("Blahaj", "#ea6f82")).toBe("paper");
    expect(assetTone("Blahaj", "#ebedf0")).toBe("ink");
    expect(assetTone("Blahaj", "default")).toBe("ink");
    expect(assetTone("Chaospost", "#ffbb40")).toBe("paper");
    // unfilled shapes are dark details everywhere else
    expect(assetTone("Icon_Smiley", "default")).toBe("paper");
    // the star has only a dark colour
    expect(assetTone("Star", "#001300")).toBe("ink");
  });
});

describe("two colours per box", () => {
  const coloursOf = (markup: string) => new Set([...markup.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase()));
  for (const palette of [CI_MODES[0], pink]) {
    it(`corner boxes are white on dark, middle boxes accent on dark (${palette.name})`, () => {
      const options = [...Object.keys(bannerParts.creatures).map((id) => `banner:${id}`), ...ASSETS.map((a) => `asset:${a.id}`)];
      for (const slot of SLOTS) {
        const allowed = slot === "L2" || slot === "R2" ? [palette.lines, palette.frame, palette.ground] : ["#e7edea", palette.ground];
        for (const id of options) {
          for (const c of coloursOf(slotContent(slot, id, palette, ASSETS))) expect(allowed, `${slot} ${id} ${c}`).toContain(c);
        }
      }
    });
  }

  it("keeps both tones of every asset in every box (nothing turns into a blank box)", () => {
    for (const palette of [CI_MODES[0], pink])
      for (const slot of SLOTS)
        for (const a of ASSETS) {
          const cols = coloursOf(slotContent(slot, `asset:${a.id}`, palette, ASSETS));
          const ink = slot === "L2" || slot === "R2" ? palette.lines : "#e7edea";
          expect(cols, `${slot} ${a.id}`).toContain(ink);
        }
  });

  it("draws Icon 10 like the swirl diamond: solid half, outlined half", () => {
    const m = slotContent("L1", "asset:Icon_10", pink, ASSETS);
    expect(m).toContain(`fill="${pink.ground}" stroke="#e7edea" stroke-width="1.45"`);
    expect(m).toMatch(/<polygon fill="#e7edea"/);
  });

  it("gives unfilled shapes their tone", () => {
    expect(slotContent("R1", "asset:Chaospost", pink, ASSETS)).toContain('<g fill="#e7edea">');
    expect(slotContent("R1", "asset:Icon_Smiley", pink, ASSETS)).toContain(`<g fill="${pink.ground}">`);
  });

  it("moves a white figure into a middle box in the accent colour", () => {
    expect(slotContent("R2", "banner:mona", pink, [])).toContain(`fill="${pink.accent}"`);
    expect(slotContent("R2", "banner:mona", pink, [])).not.toContain('fill="#e7edea"');
  });

  it("moves the accent X into a corner box in white", () => {
    expect(slotContent("L1", "banner:cross", pink, [])).toContain('stroke="#e7edea"');
  });
});

describe("assets", () => {
  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><defs><style>.cls-1{fill:#75b44b}</style><clipPath id="clippath"><rect width="1" height="1"/></clipPath></defs><path class="cls-1" clip-path="url(#clippath)" d="M0 0h10v20z"/></svg>`;
  it("inlines classes, prefixes ids and recolours", () => {
    const out = embedAsset(svg, "a-L1-", bannerParts.frames.L1.box, { ink: pink.accent, paper: pink.ground });
    expect(out).not.toContain("class=");
    expect(out).toContain(`fill="${pink.accent}"`);
    expect(out).toContain('id="a-L1-clippath"');
    expect(out).toContain("url(#a-L1-clippath)");
  });
  it("fits the asset inside the frame", () => {
    const out = embedAsset(svg, "p-", bannerParts.frames.L1.box, { ink: "#e7edea", paper: pink.ground });
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
