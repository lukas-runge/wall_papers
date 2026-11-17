// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { figcraftDocument, figcraftFile, parseTransform } from "./figcraft";
import { wallpaperSvg } from "./wallpaper";
import { CI_MODES } from "./colors";
import { DEFAULT_SLOTS } from "./banner";
import { ASSETS, LOGO_SVG, PATTERNS } from "./assets";

const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
const sources = { patterns: PATTERNS, logo: LOGO_SVG, assets: ASSETS };
const design = { lines: ["MODEL_", "CITIZENS"] as [string, string], palette: CI_MODES[0], slots: DEFAULT_SLOTS, placement: "lockscreen" as const };

type N = Record<string, any>;
const docOf = (svg: string, name = "v") => figcraftDocument([{ name, svg }], "test", parse) as { nodes: Record<string, N>; pages: number[]; next_id: number };

describe("transforms", () => {
  it("composes translate and scale", () => {
    expect(parseTransform("translate(10 20) scale(2)")).toEqual([2, 0, 0, 2, 10, 20]);
  });
});

describe("small documents", () => {
  it("turns a radial gradient rect into a rectangle with gradient handles", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(200 100) scale(340 170)"><stop offset="0" stop-color="#000d00"/><stop offset="1" stop-color="#000900"/></radialGradient></defs><rect width="400" height="200" fill="url(#g)"/></svg>`;
    const d = docOf(svg);
    const rect = Object.values(d.nodes).find((n) => n.type === "rectangle")!;
    expect(rect.fills[0]).toMatchObject({ type: "gradient", kind: "radial", from: [0.5, 0.5], to: [1.35, 0.5], width: [0.5, 1.35] });
  });

  it("makes masks the bottom layer of their group", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><mask id="m"><rect width="100" height="100" fill="#ffffff"/></mask></defs><g opacity="0.5" mask="url(#m)"><path d="M0 0h10v10z" fill="#ff0000"/></g></svg>`;
    const d = docOf(svg);
    const group = Object.values(d.nodes).find((n) => n.type === "group")!;
    expect(group.opacity).toBe(0.5);
    expect(d.nodes[group.children[0]]).toMatchObject({ is_mask: true, mask_type: "luminance" });
  });

  it("builds vector networks with closed loops and curve tangents", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><g transform="translate(10 5) scale(2)"><path d="M10,10h30v20H10z M15,15v10h20V15z" fill="#e7edea"/><path d="M50,10c5,0 10,5 10,10s-5,10-10,10" fill="none" stroke="#75b24c" stroke-width="1.45"/></g></svg>`;
    const vs = Object.values(docOf(svg).nodes).filter((n) => n.type === "vector");
    expect(vs[0].network.regions[0].loops).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
    expect(vs[0].width).toBe(60);
    expect(vs[1].network.segments[0].ta).toEqual([10, 0]);
    expect(vs[1].network.regions).toEqual([]);
    expect(vs[1].stroke.weight).toBeCloseTo(2.9);
  });

  it("keeps per-glyph positions as letter spacing", () => {
    const adv = (1233 / 2048) * 30;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text font-family="Hack" font-weight="700" font-size="30" x="0 ${adv + 5} ${2 * adv + 7}" y="100" fill="#e7edea">ABC</text></svg>`;
    const t = Object.values(docOf(svg).nodes).find((n) => n.type === "text")!;
    expect(t.characters).toBe("ABC");
    expect(t.style).toMatchObject({ font_family: "Hack", font_style: "Bold", font_size: 30 });
    expect(t.runs.map((r: N) => [r.start, r.style.letter_spacing.value])).toEqual([[0, 5], [1, 2]]);
  });
});

describe("wallpaper", () => {
  const d = docOf(wallpaperSvg(design, 1920, 1080, sources), "MODEL_ CITIZENS");
  const nodes = Object.values(d.nodes);
  const byName = (name: string) => nodes.find((n) => n.name === name)!;

  it("has one frame with the wallpaper layers", () => {
    const frame = nodes.find((n) => n.type === "frame")!;
    expect(frame).toMatchObject({ name: "MODEL_ CITIZENS", width: 1920, height: 1080, clip: true });
    expect(frame.children.map((id: number) => d.nodes[id].name)).toEqual(["Background", "Pattern", "Banner", "Wordmark"]);
  });

  it("keeps all 63 pattern strips under two masks", () => {
    const oval = byName("Pattern oval");
    expect(d.nodes[oval.children[0]].is_mask).toBe(true);
    expect(oval.children.length).toBe(64);
    expect(d.nodes[byName("Pattern").children[0]].is_mask).toBe(true);
  });

  it("writes the slogan as live text", () => {
    expect(nodes.filter((n) => n.type === "text").map((n) => n.characters)).toEqual(["MODEL_", "CITIZENS"]);
  });

  it("only references existing parents and children", () => {
    for (const n of nodes) {
      if (n.parent !== undefined) expect(d.nodes[n.parent]).toBeDefined();
      for (const c of n.children ?? []) expect(d.nodes[c].parent).toBe(n.id);
    }
    expect(d.next_id).toBeGreaterThan(Math.max(...nodes.map((n) => n.id)));
  });

  it("packs a .figcraft zip", () => {
    const files = unzipSync(figcraftFile([{ name: "x", svg: wallpaperSvg(design, 640, 360, sources) }], "WALL_PAPERS"));
    expect(JSON.parse(strFromU8(files["document.json"])).format).toBe("figcraft");
  });
});
