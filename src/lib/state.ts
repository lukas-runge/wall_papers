/** App state, its URL-hash form (shareable links) and file names. */
import { CI_MODES } from "./colors";
import { DEFAULT_SLOTS, SLOTS, type Slots } from "./banner";
import { ORIGINAL_LINES, slug, type Placement } from "./layout";

export const SIZES = {
  "8k": { label: "8K, like the 39C3 wallpapers", w: 7680, h: 4320 },
  "5k": { label: "5K / Studio Display", w: 5120, h: 2880 },
  "4k": { label: "4K UHD", w: 3840, h: 2160 },
  qhd: { label: "QHD", w: 2560, h: 1440 },
  fhd: { label: "Full HD", w: 1920, h: 1080 },
  mbp16: { label: 'MacBook Pro 16"', w: 3456, h: 2234 },
  mbp14: { label: 'MacBook Pro 14"', w: 3024, h: 1964 },
  mba15: { label: 'MacBook Air 15"', w: 2880, h: 1864 },
  mba13: { label: 'MacBook Air 13"', w: 2560, h: 1664 },
} as const;

export type SizeId = keyof typeof SIZES;

export interface AppState {
  line1: string;
  line2: string;
  placement: Placement;
  /** Colour shown in the preview. */
  active: string;
  /** Colours that go into the ZIP. */
  selected: string[];
  /** Own colour (#rrggbb). */
  custom: string;
  slots: Slots;
  size: SizeId | "custom";
  w: number;
  h: number;
}

const MODE_IDS = [...CI_MODES.map((m) => m.id), "custom"];

export const DEFAULT_STATE: AppState = {
  line1: ORIGINAL_LINES[0],
  line2: ORIGINAL_LINES[1],
  placement: "lockscreen",
  active: "gruen",
  selected: CI_MODES.map((m) => m.id),
  custom: "#00b4ff",
  slots: { ...DEFAULT_SLOTS },
  size: "8k",
  w: 7680,
  h: 4320,
};

const clampSize = (v: number, fallback: number) => (Number.isFinite(v) && v >= 64 ? Math.min(16384, Math.round(v)) : fallback);

export function readState(hash: string): AppState {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const st: AppState = { ...DEFAULT_STATE, slots: { ...DEFAULT_SLOTS }, selected: [...DEFAULT_STATE.selected] };
  if (q.has("l1")) st.line1 = q.get("l1")!.toUpperCase().slice(0, 14);
  if (q.has("l2")) st.line2 = q.get("l2")!.toUpperCase().slice(0, 14);
  if (q.get("p") === "c") st.placement = "centered";
  const c = q.get("c");
  if (c && MODE_IDS.includes(c)) st.active = c;
  if (q.has("s")) st.selected = q.get("s")!.split(",").filter((id) => MODE_IDS.includes(id));
  const x = q.get("x");
  if (x && /^[0-9a-f]{6}$/i.test(x)) st.custom = `#${x.toLowerCase()}`;
  const b = q.get("b")?.split(",");
  if (b?.length === SLOTS.length) SLOTS.forEach((slot, i) => b[i] && (st.slots[slot] = b[i]));
  const z = q.get("z");
  if (z && (z in SIZES || z === "custom")) st.size = z as AppState["size"];
  st.w = clampSize(Number(q.get("w")), st.w);
  st.h = clampSize(Number(q.get("h")), st.h);
  return st;
}

/** Only what differs from the defaults ends up in the URL. */
export function writeState(st: AppState): string {
  const q = new URLSearchParams();
  if (st.line1 !== DEFAULT_STATE.line1 || st.line2 !== DEFAULT_STATE.line2) {
    q.set("l1", st.line1);
    q.set("l2", st.line2);
  }
  if (st.placement === "centered") q.set("p", "c");
  if (st.active !== DEFAULT_STATE.active) q.set("c", st.active);
  if (st.selected.join(",") !== DEFAULT_STATE.selected.join(",")) q.set("s", st.selected.join(","));
  if (st.custom !== DEFAULT_STATE.custom) q.set("x", st.custom.slice(1));
  if (SLOTS.some((s) => st.slots[s] !== DEFAULT_SLOTS[s])) q.set("b", SLOTS.map((s) => st.slots[s]).join(","));
  if (st.size !== DEFAULT_STATE.size) q.set("z", st.size);
  if (st.size === "custom") {
    q.set("w", String(st.w));
    q.set("h", String(st.h));
  }
  return q.toString();
}

const ascii = (s: string) =>
  s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");

/** e.g. 40C3_SELF_HOSTED_4_Pink.png — the same scheme as the hand-made exports. */
export function fileName(lines: readonly [string, string], mode: { index: string; name: string }, ext: string): string {
  return `40C3_${slug(lines)}_${mode.index}_${ascii(mode.name).replace(/[^A-Za-z0-9]+/g, "")}.${ext}`;
}
