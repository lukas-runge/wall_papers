/** App state: a list of variants plus export settings; URL-hash form and file names. */
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
}

export interface AppState {
  variants: Variant[];
  active: number;
  width: number;
  height: number;
  format: Format;
}

export const DEFAULT_VARIANT: Variant = {
  line1: ORIGINAL_LINES[0],
  line2: ORIGINAL_LINES[1],
  colour: "green",
  slots: { ...DEFAULT_SLOTS },
  placement: "lockscreen",
};

export const defaultState = (): AppState => ({
  variants: [cloneVariant(DEFAULT_VARIANT)],
  active: 0,
  width: 7680,
  height: 4320,
  format: "png",
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

// ---------------------------------------------------------------------------
// URL hash: base64url JSON, empty for the default state

/** Colour ids of the first version (German names), so old links keep working. */
const LEGACY_IDS: Record<string, string> = { gruen: "green", tuerkis: "turquoise", lavendel: "lavender", flieder: "lilac", rosa: "rose", gelb: "yellow" };

function sanitizeVariant(raw: unknown): Variant | null {
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
  };
}

const b64urlEncode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function readState(hash: string): AppState {
  const st = defaultState();
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get("s");
  if (!raw) return st;
  try {
    const j = JSON.parse(b64urlDecode(raw)) as Record<string, unknown>;
    const variants = Array.isArray(j.v) ? j.v.map(sanitizeVariant).filter((v): v is Variant => v !== null).slice(0, 64) : [];
    if (variants.length) st.variants = variants;
    st.active = Math.min(Math.max(0, Number(j.a) || 0), st.variants.length - 1);
    const w = Number(j.w), h = Number(j.h);
    if (Number.isFinite(w) && w >= 64 && w <= 16384) st.width = Math.round(w);
    if (Number.isFinite(h) && h >= 64 && h <= 16384) st.height = Math.round(h);
    if (FORMATS.some((f) => f.id === j.f)) st.format = j.f as Format;
  } catch {
    // broken link: start fresh
  }
  return st;
}

export function writeState(st: AppState): string {
  const d = defaultState();
  if (JSON.stringify({ ...st }) === JSON.stringify(d)) return "";
  return `s=${b64urlEncode(JSON.stringify({ v: st.variants, a: st.active, w: st.width, h: st.height, f: st.format }))}`;
}

// ---------------------------------------------------------------------------
// File names

/** e.g. 40C3_SELF_HOSTED_4_Pink — the scheme of the hand-made exports. */
export function baseName(v: Variant): string {
  const c = colourInfo(v.colour);
  return `40C3_${slug([v.line1, v.line2])}_${c.index}_${c.name.replace(/[^A-Za-z0-9]+/g, "")}`;
}

/** Unique file names for a list of variants (same slogan and colour get -2, -3 …). */
export function fileNames(variants: readonly Variant[], ext: string): string[] {
  const seen = new Map<string, number>();
  return variants.map((v) => {
    const b = baseName(v);
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return `${b}${n > 1 ? `-${n}` : ""}.${ext}`;
  });
}
