/** App state: a list of variants, each with everything it needs to be exported; local storage, share links and file names. */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { CI_MODES, paletteFor, type Palette } from "./colors";
import { DEFAULT_SLOTS, SLOTS, type Slots } from "./banner";
import { ORIGINAL_LINES, slug, type Placement } from "./layout";
import type { Design } from "./wallpaper";

export const SIZES = [
  [7680, 4320],
  [5120, 2880],
  [3840, 2160],
  [3456, 2234],
  [3024, 1964],
  [2880, 1864],
  [2560, 1664],
  [2560, 1440],
  [1920, 1080],
] as const;

export type Format = "png" | "svg" | "figcraft";
export const FORMATS: { id: Format; label: string; ext: string }[] = [
  { id: "png", label: "PNG", ext: "png" },
  { id: "svg", label: "SVG", ext: "svg" },
  { id: "figcraft", label: "FigCraft", ext: "figcraft" },
];

export interface Variant {
  line1: string;
  line2: string;
  /** CI mode id (e.g. "pink") or an own colour "#rrggbb". */
  colour: string;
  slots: Slots;
  placement: Placement;
  width: number;
  height: number;
  format: Format;
}

export interface AppState {
  variants: Variant[];
  active: number;
}

export const DEFAULT_VARIANT: Variant = {
  line1: ORIGINAL_LINES[0],
  line2: ORIGINAL_LINES[1],
  colour: "green",
  slots: { ...DEFAULT_SLOTS },
  placement: "lockscreen",
  width: 7680,
  height: 4320,
  format: "png",
};

export const defaultState = (): AppState => ({
  variants: [cloneVariant(DEFAULT_VARIANT)],
  active: 0,
});

export const cloneVariant = (v: Variant): Variant => ({ ...v, slots: { ...v.slots } });

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

export function colourInfo(colour: string): { index: string; name: string; palette: Palette } {
  const mode = CI_MODES.find((m) => m.id === colour);
  if (mode) return { index: String(mode.index), name: mode.name, palette: mode };
  const hex = isHex(colour) ? colour.toLowerCase() : "#00b4ff";
  return { index: "X", name: hex.slice(1), palette: paletteFor(hex) };
}

export const designOf = (v: Variant): Design => ({
  lines: [v.line1, v.line2],
  palette: colourInfo(v.colour).palette,
  slots: v.slots,
  placement: v.placement,
});

export const variantLabel = (v: Variant) => `${v.line1} ${v.line2} · ${colourInfo(v.colour).name}`;

export const formatOf = (f: Format) => FORMATS.find((x) => x.id === f)!;

/** Size and format, e.g. "7680 × 4320 · PNG". */
export const variantMeta = (v: Variant) => `${v.width} × ${v.height} · ${formatOf(v.format).label}`;

// ---------------------------------------------------------------------------
// Storage and share links

/** Colour ids of the first version (German names), so old links keep working. */
const LEGACY_IDS: Record<string, string> = { gruen: "green", tuerkis: "turquoise", lavendel: "lavender", flieder: "lilac", rosa: "rose", gelb: "yellow" };

const sizeOk = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 64 && Number(v) <= 16384;

/** `legacy` carries size and format of links from when they were global settings. */
function sanitizeVariant(raw: unknown, legacy: Record<string, unknown> = {}): Variant | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.toUpperCase().slice(0, max) : null);
  const c = typeof r.colour === "string" ? (LEGACY_IDS[r.colour] ?? r.colour) : "";
  const colour = CI_MODES.some((m) => m.id === c) || isHex(c) ? c : DEFAULT_VARIANT.colour;
  const slots = { ...DEFAULT_SLOTS };
  if (r.slots && typeof r.slots === "object") for (const s of SLOTS) {
    const v = (r.slots as Record<string, unknown>)[s];
    if (typeof v === "string" && /^(banner:|asset:)[\w-]+$|^empty$/.test(v)) slots[s] = v;
  }
  return {
    line1: str(r.line1, 14) ?? DEFAULT_VARIANT.line1,
    line2: str(r.line2, 14) ?? DEFAULT_VARIANT.line2,
    colour,
    slots,
    placement: r.placement === "centered" ? "centered" : "lockscreen",
    width: sizeOk(r.width) ? Math.round(Number(r.width)) : sizeOk(legacy.w) ? Math.round(Number(legacy.w)) : DEFAULT_VARIANT.width,
    height: sizeOk(r.height) ? Math.round(Number(r.height)) : sizeOk(legacy.h) ? Math.round(Number(legacy.h)) : DEFAULT_VARIANT.height,
    format: [r.format, legacy.f].find((f): f is Format => FORMATS.some((x) => x.id === f)) ?? DEFAULT_VARIANT.format,
  };
}

const toB64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const MAX_VARIANTS = 64;
const sanitizeList = (list: unknown[], legacy?: Record<string, unknown>) =>
  list.map((v) => sanitizeVariant(v, legacy)).filter((v): v is Variant => v !== null).slice(0, MAX_VARIANTS);

/** Variants and the selection, as kept in the browser's local storage. */
export const STORAGE_KEY = "wall_papers:state";

function parseState(j: Record<string, unknown>): AppState {
  const st = defaultState();
  const variants = Array.isArray(j.v) ? sanitizeList(j.v, j) : [];
  if (variants.length) st.variants = variants;
  st.active = Math.min(Math.max(0, Number(j.a) || 0), st.variants.length - 1);
  return st;
}

/** Saved variants, or the original wallpaper when there are none (or storage is unavailable). */
export function loadState(storage: Pick<Storage, "getItem"> | undefined): AppState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) return parseState(JSON.parse(raw));
  } catch {
    // unreadable or blocked storage: start fresh
  }
  return defaultState();
}

export function saveState(storage: Pick<Storage, "setItem"> | undefined, st: AppState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ v: st.variants, a: st.active }));
  } catch {
    // private mode or full storage: keep working without saving
  }
}

/** Same fields in the same order, so two variants can be compared as JSON. */
const normalize = (v: Variant) => sanitizeVariant(v)!;
export const sameVariant = (a: Variant, b: Variant) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/** URL hash that shares a list of variants: `v=` and the deflated JSON in base64url. */
export const shareHash = (list: readonly Variant[]) =>
  `v=${toB64url(deflateSync(strToU8(JSON.stringify(list.slice(0, MAX_VARIANTS).map(normalize))), { level: 9 }))}`;

/**
 * The variants a link shares (none for a page without a share link).
 * Also reads the links from before share links existed (`s=`, the whole state as plain JSON).
 */
export function sharedVariants(hash: string): Variant[] {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  try {
    const v = q.get("v");
    if (v) {
      const j: unknown = JSON.parse(strFromU8(inflateSync(fromB64url(v))));
      return sanitizeList(Array.isArray(j) ? j : [j]);
    }
    const s = q.get("s");
    if (s) return parseState(JSON.parse(strFromU8(fromB64url(s)))).variants;
  } catch {
    // broken link
  }
  return [];
}

/** Where each shared variant already is in the list (-1 for new ones). */
export const findShared = (st: AppState, shared: readonly Variant[]) => shared.map((x) => st.variants.findIndex((y) => sameVariant(x, y)));

/** Adds the shared variants that are not in the list yet and selects the first shared one. */
export function addShared(st: AppState, shared: readonly Variant[]): AppState {
  const variants = [...st.variants];
  const at = shared.map((x) => {
    const i = variants.findIndex((y) => sameVariant(x, y));
    if (i >= 0) return i;
    variants.push(cloneVariant(normalize(x)));
    return variants.length - 1;
  });
  return { variants: variants.slice(0, MAX_VARIANTS), active: Math.min(at[0] ?? st.active, MAX_VARIANTS - 1) };
}

/** One shared variant takes the place of the selected one; several replace the whole list. */
export function replaceWithShared(st: AppState, shared: readonly Variant[]): AppState {
  if (!shared.length) return st;
  if (shared.length === 1) {
    const variants = [...st.variants];
    variants[st.active] = cloneVariant(normalize(shared[0]));
    return { variants, active: st.active };
  }
  return { variants: shared.map((x) => cloneVariant(normalize(x))), active: 0 };
}

// ---------------------------------------------------------------------------
// File names

/** e.g. 40C3_SELF_HOSTED_4_Pink — the scheme of the hand-made exports. */
export function baseName(v: Variant): string {
  const c = colourInfo(v.colour);
  return `40C3_${slug([v.line1, v.line2])}_${c.index}_${c.name.replace(/[^A-Za-z0-9]+/g, "")}`;
}

/** Unique file names for a list of variants, each in its own format (duplicates get -2, -3 …). */
export function fileNames(variants: readonly Variant[]): string[] {
  const seen = new Map<string, number>();
  return variants.map((v) => {
    const b = baseName(v), ext = formatOf(v.format).ext;
    const key = `${b}.${ext}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${b}${n > 1 ? `-${n}` : ""}.${ext}`;
  });
}
