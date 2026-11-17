/**
 * Builds the banner SVG: frames, centre, box contents, logo and fills.
 * The wordmark text is drawn separately on the canvas (live Hack font).
 */
import { bannerParts } from "./generated/banner-parts";
import { BANNER_WHITE, CI_MODES, relativeLuminance, type Palette } from "./colors";
import { BANNER, BOX_FILLS, LOGO } from "./layout";

export type SlotId = "L1" | "L2" | "L3" | "R1" | "R2" | "R3";
export const SLOTS: readonly SlotId[] = ["L1", "L2", "L3", "R1", "R2", "R3"];
export const SLOT_LABELS: Record<SlotId, string> = {
  L1: "Left top",
  L2: "Left middle",
  L3: "Left bottom",
  R1: "Right top",
  R2: "Right middle",
  R3: "Right bottom",
};

/** What can go into a box. `banner:*` are the line drawings of the original banner. */
export interface Creature {
  id: string;
  label: string;
  group: "Banner" | "Citizens" | "Icons" | "Other";
}

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

type CreatureId = keyof typeof bannerParts.creatures;
type Box = readonly [number, number, number, number];

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

const CI_HEX = new Set([...CI_MODES.map((m) => m.accent), "#ffbb40"]);

/** Colour of a styleguide asset mapped onto the wallpaper palette. */
export function mapAssetColour(hex: string, palette: Palette): string {
  const h = expandHex(hex.toLowerCase());
  if (CI_HEX.has(h)) return palette.accent;
  const lum = relativeLuminance(h);
  if (lum > 0.6) return BANNER_WHITE;
  if (lum < 0.02) return palette.ground;
  return palette.accent;
}

const expandHex = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);

/** Banner stylesheet with the green replaced by the palette. */
export function bannerStyle(palette: Palette): string {
  return bannerParts.style.replace(/#6ab143/gi, palette.lines).replace(/#75b24c/gi, palette.frame);
}

/** Inline a styleguide asset into a box, classes and ids prefixed so they cannot clash. */
export function embedAsset(svg: string, prefix: string, box: Box, palette: Palette): string {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4) throw new Error("asset without viewBox");
  const [, , vw, vh] = vb;
  const inner = svg
    .replace(/<\?xml[^>]*>/, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\.cls-/g, `.${prefix}cls-`)
    .replace(/class="([^"]*)"/g, (_, c: string) => `class="${c.replace(/cls-/g, `${prefix}cls-`)}"`)
    .replace(/id="([^"]*)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]*)\)/g, `url(#${prefix}$1)`)
    .replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, (h) => mapAssetColour(h, palette));
  // Fit into the inside of the frame with some air around it.
  const [x0, y0, x1, y1] = box;
  const pad = 1.45 + 4;
  const w = x1 - x0 - 2 * pad, h = y1 - y0 - 2 * pad;
  const s = Math.min(w / vw, h / vh);
  const x = x0 + pad + (w - vw * s) / 2, y = y0 + pad + (h - vh * s) / 2;
  return `<svg x="${r(x)}" y="${r(y)}" width="${r(vw * s)}" height="${r(vh * s)}" viewBox="${vb.join(" ")}" overflow="visible">${inner}</svg>`;
}

const r = (v: number) => Math.round(v * 1000) / 1000;

/** The X of the middle box, generated for any box with the insets of the original. */
export function crossMarkup(box: Box): string {
  const [x0, y0, x1, y1] = box;
  const a = [r2(x0 + 0.99), r2(y0 + 0.7)], b = [r2(x1 - 0.56), r2(y1 - 0.69)];
  return (
    `<line class="cls-3" x1="${b[0]}" y1="${a[1]}" x2="${a[0]}" y2="${b[1]}" />` +
    `<line class="cls-3" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" />`
  );
}
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Box content for one slot (in banner coordinates). */
export function slotContent(slot: SlotId, creature: string, palette: Palette, assets: readonly AssetSource[]): string {
  const box = bannerParts.frames[slot].box;
  if (creature === "empty") return "";
  if (creature.startsWith("banner:")) {
    const id = creature.slice(7) as CreatureId;
    const c = bannerParts.creatures[id];
    if (!c) return "";
    if (c.slot === slot) return c.markup;
    if (c.anchor === "fill") return crossMarkup(box);
    const from = bannerParts.frames[c.slot].box;
    const dx = (box[0] + box[2]) / 2 - (from[0] + from[2]) / 2;
    const dy = c.anchor === "bottom" ? box[3] - from[3] : (box[1] + box[3]) / 2 - (from[1] + from[3]) / 2;
    return `<g transform="translate(${r(dx)} ${r(dy)})">${c.markup}</g>`;
  }
  if (creature.startsWith("asset:")) {
    const asset = assets.find((a) => a.id === creature.slice(6));
    return asset ? embedAsset(asset.svg, `a-${slot}-`, box, palette) : "";
  }
  return "";
}

export interface BannerOptions {
  palette: Palette;
  slots: Slots;
  assets: readonly AssetSource[];
  /** Logo SVG (40C3_Logo_A.svg). */
  logo: string;
  /** How far logo/text move right and the columns move inwards (banner units). */
  shift: number;
  /** Pixel size the SVG is rasterised at. */
  width: number;
  height: number;
}

/** Complete banner (without the wordmark text) as an SVG document. */
export function bannerSvg(o: BannerOptions): string {
  const fill = (side: "left" | "right") =>
    BOX_FILLS.filter((f) => f.side === side)
      .map((f) => `<rect x="${r(f.x)}" y="${r(f.y)}" width="${r(f.w)}" height="${r(f.h)}" fill="${o.palette.ground}"/>`)
      .join("");
  const column = (side: "left" | "right") =>
    SLOTS.filter((s) => s.startsWith(side === "left" ? "L" : "R"))
      .map((s) => bannerParts.frames[s].markup + slotContent(s, o.slots[s], o.palette, o.assets))
      .join("");
  const logo = o.logo
    .replace(/<\?xml[^>]*>/, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\.cls-/g, ".logo-cls-")
    .replace(/class="cls-/g, 'class="logo-cls-')
    .replace(/#[0-9a-f]{6}\b/gi, BANNER_WHITE);
  const dl = r(o.shift), dr = r(-o.shift);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BANNER.width} ${BANNER.height}" width="${o.width}" height="${o.height}">` +
    `<style>${bannerStyle(o.palette)}</style>` +
    `<g transform="translate(${dl} 0)">${fill("left")}${column("left")}</g>` +
    `<g>${bannerParts.center}</g>` +
    `<g transform="translate(${dr} 0)">${fill("right")}${column("right")}</g>` +
    `<svg x="${r(LOGO.x + o.shift)}" y="${LOGO.y}" width="${r(LOGO.width * LOGO.scale)}" height="${r(LOGO.height * LOGO.scale)}" viewBox="0 0 ${LOGO.width} ${LOGO.height}">${logo}</svg>` +
    `</svg>`
  );
}
