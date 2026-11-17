/**
 * The banner and its six boxes as SVG markup with inline colours (no CSS
 * classes), ready to be placed in the wallpaper. The wordmark text is added
 * by the wallpaper itself.
 */
import { bannerParts } from "./generated/banner-parts";
import { BANNER_WHITE, CI_MODES, relativeLuminance, type Palette } from "./colors";
import { BOX_FILLS, LOGO } from "./layout";

export type SlotId = "L1" | "L2" | "L3" | "R1" | "R2" | "R3";
export const SLOTS: readonly SlotId[] = ["L1", "L2", "L3", "R1", "R2", "R3"];

export type Slots = Record<SlotId, string>;

/** The original banner. */
export const DEFAULT_SLOTS: Slots = {
  L1: "banner:hood",
  L2: "banner:cross",
  L3: "banner:fringe",
  R1: "banner:mona",
  R2: "banner:swirl",
  R3: "banner:rocket",
};

/** Styleguide asset that can be placed in a box (raw SVG source). */
export interface AssetSource {
  id: string;
  label: string;
  group: "Citizens" | "Icons";
  svg: string;
}

/** What can go into a box. */
export interface Creature {
  id: string;
  label: string;
  group: "Banner" | "Citizens" | "Icons" | "Other";
}

type CreatureId = keyof typeof bannerParts.creatures;
export type Box = readonly [number, number, number, number];

export function creatureCatalogue(assets: readonly AssetSource[]): Creature[] {
  const banner = (Object.keys(bannerParts.creatures) as CreatureId[]).map((id) => ({
    id: `banner:${id}`,
    label: bannerParts.creatures[id].label,
    group: "Banner" as const,
  }));
  return [
    ...banner,
    ...assets.map((a) => ({ id: `asset:${a.id}`, label: a.label, group: a.group })),
    { id: "empty", label: "Empty", group: "Other" },
  ];
}

export const frameBox = (slot: SlotId): Box => bannerParts.frames[slot].box;

// ---------------------------------------------------------------------------
// CSS classes → presentation attributes

type Props = Record<string, string>;

/** Parses simple `.a, .b { prop: value; }` rules into class → properties. */
export function parseClassRules(css: string): Record<string, Props> {
  const rules: Record<string, Props> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const props: Props = {};
    for (const decl of m[2].split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim().replace(/px$/, "");
    }
    for (const sel of m[1].split(",")) {
      const cls = sel.trim().replace(/^\./, "");
      if (cls) rules[cls] = { ...rules[cls], ...props };
    }
  }
  return rules;
}

/** Replaces `class="…"` by the attributes of its rules. */
export function inlineClasses(markup: string, rules: Record<string, Props>, colour: (hex: string) => string = (h) => h): string {
  return markup.replace(/\sclass="([^"]*)"/g, (_, classes: string) => {
    const props: Props = {};
    for (const c of classes.split(/\s+/)) Object.assign(props, rules[c]);
    return Object.entries(props)
      .map(([k, v]) => ` ${k}="${/^#[0-9a-f]{3,6}$/i.test(v) ? colour(v) : v}"`)
      .join("");
  });
}

const stripSvgWrapper = (svg: string) =>
  svg
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<defs>\s*<\/defs>/g, "")
    .replace(/\s(id|data-name)="(Ebene_\d+|Content|Ebene \d+)"/g, "")
    .replace(/>\s+</g, "><")
    .trim();

const styleOf = (svg: string) => /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? "";

/** Viewbox of an SVG document. */
export function viewBox(svg: string): [number, number, number, number] {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4) throw new Error("SVG without viewBox");
  return vb as [number, number, number, number];
}

/** Inner markup of a self-contained SVG file with its classes inlined. */
export function flattenSvg(svg: string, colour?: (hex: string) => string): string {
  // Recolour attributes first, then inline the classes (recoloured as well):
  // every colour goes through `colour` exactly once.
  let inner = stripSvgWrapper(svg);
  if (colour) inner = inner.replace(/(fill|stroke|stop-color)="(#[0-9a-f]{3,6})"/gi, (_, a: string, h: string) => `${a}="${colour(h)}"`);
  return inlineClasses(inner, parseClassRules(styleOf(svg)), colour);
}

// ---------------------------------------------------------------------------
// Colours

const CI_HEX = new Set([...CI_MODES.map((m) => m.accent), "#ffbb40"]);
const expandHex = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);

/** Banner colours: the two greens of the original become the palette. */
export function bannerColour(palette: Palette): (hex: string) => string {
  return (hex) => {
    const h = expandHex(hex.toLowerCase());
    if (h === "#6ab143") return palette.lines;
    if (h === "#75b24c") return palette.frame;
    return h;
  };
}

const bannerRules = () => parseClassRules(bannerParts.style);

/**
 * Box contents are always two colours: ink on the dark ground. The four corner
 * boxes use white ink, the two middle boxes the accent colour (as in the
 * original banner).
 */
export const isMiddle = (slot: SlotId) => slot === "L2" || slot === "R2";
export const inkFor = (slot: SlotId, palette: Palette) => (isMiddle(slot) ? palette.lines : BANNER_WHITE);

type Tone = "ink" | "paper";

/**
 * How each styleguide asset becomes two-tone. Default: dark colours are paper,
 * everything else is ink. Some assets keep their details only the other way
 * round (CI colour is ink, white is paper); the star has only a dark colour.
 */
const ASSET_TONES: Record<string, "ci-ink" | Record<string, Tone>> = {
  Blahaj: "ci-ink",
  Icon_Blob0: "ci-ink",
  Luckycat: "ci-ink",
  Star: { "#001300": "ink" },
};

export function assetTone(assetId: string, hex: string): Tone {
  const h = expandHex(hex.toLowerCase());
  const rule = ASSET_TONES[assetId];
  if (rule && rule !== "ci-ink" && rule[h]) return rule[h];
  if (relativeLuminance(h) < 0.02) return "paper";
  if (rule === "ci-ink") return CI_HEX.has(h) ? "ink" : "paper";
  return "ink";
}

// ---------------------------------------------------------------------------
// Boxes

const r = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Inline a styleguide asset into a box: classes inlined, ids prefixed, two-tone, fitted into the frame. */
export function embedAsset(svg: string, prefix: string, box: Box, tones: { ink: string; paper: string }, assetId = ""): string {
  const [, , vw, vh] = viewBox(svg);
  const inner = flattenSvg(svg, (h) => tones[assetTone(assetId, h)])
    .replace(/\sid="([^"]*)"/g, ` id="${prefix}$1"`)
    .replace(/url\(#([^)]*)\)/g, `url(#${prefix}$1)`);
  // Fit into the inside of the frame with some air around it.
  const [x0, y0, x1, y1] = box;
  const pad = 1.45 + 4;
  const w = x1 - x0 - 2 * pad, h = y1 - y0 - 2 * pad;
  const s = Math.min(w / vw, h / vh);
  const x = x0 + pad + (w - vw * s) / 2, y = y0 + pad + (h - vh * s) / 2;
  return `<svg x="${r(x)}" y="${r(y)}" width="${r(vw * s)}" height="${r(vh * s)}" viewBox="${viewBox(svg).join(" ")}" overflow="visible">${inner}</svg>`;
}

/** The X of the middle box, generated for any box with the insets of the original. */
export function crossMarkup(box: Box): string {
  const [x0, y0, x1, y1] = box;
  const a = [r2(x0 + 0.99), r2(y0 + 0.7)], b = [r2(x1 - 0.56), r2(y1 - 0.69)];
  return (
    `<line class="cls-3" x1="${b[0]}" y1="${a[1]}" x2="${a[0]}" y2="${b[1]}" />` +
    `<line class="cls-3" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" />`
  );
}

/** Box content for one slot, colours inline and two-tone for its box. */
export function slotContent(slot: SlotId, creature: string, palette: Palette, assets: readonly AssetSource[]): string {
  const box = frameBox(slot);
  const ink = inkFor(slot, palette);
  if (creature.startsWith("banner:")) {
    const c = bannerParts.creatures[creature.slice(7) as CreatureId];
    if (!c) return "";
    let markup: string;
    if (c.slot === slot) markup = c.markup;
    else if (c.anchor === "fill") markup = crossMarkup(box);
    else {
      const from = frameBox(c.slot);
      const dx = (box[0] + box[2]) / 2 - (from[0] + from[2]) / 2;
      const dy = c.anchor === "bottom" ? box[3] - from[3] : (box[1] + box[3]) / 2 - (from[1] + from[3]) / 2;
      markup = `<g transform="translate(${r(dx)} ${r(dy)})">${c.markup}</g>`;
    }
    // The line drawings use white, or the banner greens in the middle boxes:
    // the middle keeps its greens (exactly the original), anything else becomes the ink.
    const base = bannerColour(palette);
    const colour = (h: string) => {
      const mapped = base(h);
      if (isMiddle(slot)) return expandHex(h.toLowerCase()) === "#e7edea" ? ink : mapped;
      return ink;
    };
    return inlineClasses(markup, bannerRules(), colour);
  }
  if (creature.startsWith("asset:")) {
    const id = creature.slice(6);
    const asset = assets.find((a) => a.id === id);
    return asset ? embedAsset(asset.svg, `a-${slot}-`, box, { ink, paper: palette.ground }, id) : "";
  }
  return "";
}

/** One box (frame, fill and content) as a small standalone SVG, for pickers. */
export function boxSvg(slot: SlotId, creature: string, palette: Palette, assets: readonly AssetSource[]): string {
  const [x0, y0, x1, y1] = frameBox(slot);
  const m = 8;
  const fill = BOX_FILLS[SLOTS.indexOf(slot)];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x0 - m)} ${r(y0 - m)} ${r(x1 - x0 + 2 * m)} ${r(y1 - y0 + 2 * m)}">` +
    `<rect x="${r(fill.x)}" y="${r(fill.y)}" width="${r(fill.w)}" height="${r(fill.h)}" fill="${palette.ground}"/>` +
    inlineClasses(bannerParts.frames[slot].markup, bannerRules(), bannerColour(palette)) +
    slotContent(slot, creature, palette, assets) +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Whole banner

export interface BannerOptions {
  palette: Palette;
  slots: Slots;
  assets: readonly AssetSource[];
  /** Logo SVG (40C3_Logo_A.svg). */
  logo: string;
  /** How far logo/text move right and the columns move inwards (banner units). */
  shift: number;
}

/** Banner content in banner coordinates (678 × 330), colours inline, without the wordmark text. */
export function bannerMarkup(o: BannerOptions): string {
  const rules = bannerRules(), colour = bannerColour(o.palette);
  const column = (side: "L" | "R") =>
    SLOTS.filter((s) => s.startsWith(side))
      .map((s) => {
        const f = BOX_FILLS[SLOTS.indexOf(s)];
        return (
          `<g data-name="Box ${s}">` +
          `<rect x="${r(f.x)}" y="${r(f.y)}" width="${r(f.w)}" height="${r(f.h)}" fill="${o.palette.ground}"/>` +
          inlineClasses(bannerParts.frames[s].markup, rules, colour) +
          slotContent(s, o.slots[s], o.palette, o.assets) +
          `</g>`
        );
      })
      .join("");
  const logo = flattenSvg(o.logo, () => BANNER_WHITE);
  return (
    `<g data-name="Left column" transform="translate(${r(o.shift)} 0)">${column("L")}</g>` +
    `<g data-name="Loading bar and ruler">${inlineClasses(bannerParts.center, rules, colour)}</g>` +
    `<g data-name="Right column" transform="translate(${r(-o.shift)} 0)">${column("R")}</g>` +
    `<svg data-name="40C3 logo" x="${r(LOGO.x + o.shift)}" y="${LOGO.y}" width="${r(LOGO.width * LOGO.scale)}" height="${r(LOGO.height * LOGO.scale)}" viewBox="0 0 ${LOGO.width} ${LOGO.height}">${logo}</svg>`
  );
}
