/**
 * Colour palette of the 40C3 styleguide and the rules that derive the dark
 * background of a wallpaper from its accent colour.
 *
 * The original wallpaper is green: accent #75b44b, background #000d00 with a
 * vignette towards #000900. For every other accent the background keeps the
 * same CIELAB chroma and the same perceived lightness (Helmholtz–Kohlrausch,
 * Fairchild & Pirrotta) as the original, only the hue follows the accent.
 */

export interface Palette {
  /** Pattern lines. */
  accent: string;
  /** Green frames and the X in the banner (#75b24c in the original). */
  frame: string;
  /** Icon, loading bar and ruler in the banner (#6ab143 in the original). */
  lines: string;
  /** Background in the centre. */
  ground: string;
  /** Background at the edge of the vignette. */
  edge: string;
}

export interface ColourMode extends Palette {
  id: string;
  name: string;
  /** Number in the styleguide (0–7). */
  index: number;
}

/** Banner white (logo, wordmark, figures). */
export const BANNER_WHITE = "#e7edea";

const ORIGINAL_GROUND = "#000d00";
const ORIGINAL_EDGE = "#000900";

export const CI_MODES: readonly ColourMode[] = [
  { id: "gruen", name: "Grün", index: 0, accent: "#75b44b", frame: "#75b24c", lines: "#6ab143", ground: ORIGINAL_GROUND, edge: ORIGINAL_EDGE },
  { id: "tuerkis", name: "Türkis", index: 1, accent: "#15ada3", frame: "#15ada3", lines: "#15ada3", ground: "#000e0c", edge: "#000a08" },
  { id: "lavendel", name: "Lavendel", index: 2, accent: "#9fa4e8", frame: "#9fa4e8", lines: "#9fa4e8", ground: "#050513", edge: "#03030e" },
  { id: "flieder", name: "Flieder", index: 3, accent: "#c892d6", frame: "#c892d6", lines: "#c892d6", ground: "#0e0310", edge: "#0a020b" },
  { id: "pink", name: "Pink", index: 4, accent: "#ee5da2", frame: "#ee5da2", lines: "#ee5da2", ground: "#14020a", edge: "#0f0207" },
  { id: "rosa", name: "Rosa", index: 5, accent: "#ea6f82", frame: "#ea6f82", lines: "#ea6f82", ground: "#160305", edge: "#110203" },
  { id: "orange", name: "Orange", index: 6, accent: "#f88a30", frame: "#f88a30", lines: "#f88a30", ground: "#150900", edge: "#100600" },
  { id: "gelb", name: "Gelb", index: 7, accent: "#ffbc40", frame: "#ffbc40", lines: "#ffbc40", ground: "#130c00", edge: "#0e0800" },
];

/** A palette for any accent colour, background derived like the CI modes. */
export function paletteFor(accent: string): Palette {
  const hue = toLch(hexToRgb(accent))[2];
  return {
    accent,
    frame: accent,
    lines: accent,
    ground: darkInHue(ORIGINAL_GROUND, hue),
    edge: darkInHue(ORIGINAL_EDGE, hue),
  };
}

// ---------------------------------------------------------------------------
// Colour maths (sRGB, D65, CIELAB)

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => roundHalfEven(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Python's round(): halves go to the even neighbour (keeps the CI table reproducible). */
function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const delin = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

const WHITE = [0.95047, 1, 1.08883] as const;

/** CIELAB lightness, chroma and hue (degrees) of an sRGB colour. */
export function toLch([r8, g8, b8]: Rgb): Rgb {
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(X / WHITE[0]), fy = f(Y / WHITE[1]), fz = f(Z / WHITE[2]);
  const L = 116 * fy - 16, a = 500 * (fx - fy), bb = 200 * (fy - fz);
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

/** Linear sRGB (unclamped) of a CIELAB colour given as L, C, h. */
function lchToLinear(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = WHITE[0] * inv(fx), Y = WHITE[1] * inv(fy), Z = WHITE[2] * inv(fz);
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ];
}

const inGamut = (L: number, C: number, h: number) => lchToLinear(L, C, h).every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** Perceived lightness with the Helmholtz–Kohlrausch effect (Fairchild & Pirrotta). */
export function hkLightness(L: number, C: number, h: number): number {
  return L + (2.5 - 0.025 * L) * (0.116 * Math.abs(Math.sin(((h - 90) / 2) * (Math.PI / 180))) + 0.085) * C;
}

/** A dark colour in hue `hue` with the chroma and perceived lightness of `reference`. */
export function darkInHue(reference: string, hue: number): string {
  const [L0, C0, h0] = toLch(hexToRgb(reference));
  const target = hkLightness(L0, C0, h0);
  for (let C = C0; C > 0; C -= 0.05) {
    let lo = 0, hi = 20;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (hkLightness(m, C, hue) < target) lo = m;
      else hi = m;
    }
    if (inGamut(lo, C, hue)) return rgbToHex(lchToLinear(lo, C, hue).map(delin) as Rgb);
  }
  return reference;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
