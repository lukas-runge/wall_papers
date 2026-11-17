/**
 * Geometry of the 40C3 announcement banner and of the wallpaper around it.
 *
 * Banner units are the coordinates of Webbanner_Announcement.svg (678 × 330).
 * The numbers were measured against the hand-built FigCraft version, which in
 * turn matches the original wallpaper pixel for pixel.
 */

export const BANNER = { width: 678, height: 330 } as const;

/** Banner height as a fraction of the wallpaper height. */
export const BANNER_HEIGHT = 0.617;

/**
 * Where the banner sits vertically:
 * - `lockscreen`: between the clock and the login of the macOS lock screen
 *   (measured on a MacBook; the original wallpaper uses this),
 * - `centered`: neutral, banner and pattern oval in the middle of the screen.
 */
export type Placement = "lockscreen" | "centered";

export const PLACEMENTS: Record<Placement, { bannerTop: number; ovalCenterY: number }> = {
  lockscreen: { bannerTop: 0.2284, ovalCenterY: 0.52 },
  centered: { bannerTop: (1 - BANNER_HEIGHT) / 2, ovalCenterY: 0.5 },
};

/** Hack Bold: advance width is 1233/2048 em. */
export const HACK_ADVANCE_EM = 1233 / 2048;

export const TEXT = {
  fontSize: 33.938272,
  /** Baselines of line 1 and 2. */
  baselines: [170.36, 212.71],
  /** Pen position of the first glyph of line 1 and 2. */
  origins: [324.715, 324.624],
  stroke: 0.58,
  /** Uniform letter spacing for custom text (best fit to the original). */
  spacing: 1.74,
} as const;

export const ADVANCE = HACK_ADVANCE_EM * TEXT.fontSize;

/** Original wordmark with its hand-kerned glyph positions (from the outlined SVG). */
export const ORIGINAL_LINES = ["MODEL_", "CITIZENS"] as const;
const ORIGINAL_ORIGINS = [
  [324.715, 347.879, 370.587, 392.956, 414.545, 437.46],
  [324.624, 346.044, 368.086, 390.14, 412.157, 434.184, 456.659, 479.237],
];

/** 40C3_Logo_A.svg (67.65 × 88.42) placed in the banner. */
export const LOGO = { x: 178.11, y: 83.482, scale: 1.8439, width: 67.65, height: 88.42 } as const;

/** Solid fills behind the six outlined boxes so the pattern does not show through. */
export const BOX_FILLS = (() => {
  const rows = [[29.9, 88.2], [126.6, 203.5], [242.2, 300.2]];
  const cols = [[27.07, 91.64], [585.5, 651.6]];
  return cols.flatMap(([x0, x1], c) =>
    rows.map(([y0, y1]) => ({ side: c === 0 ? "left" : "right", x: x0 + 0.6, y: y0 + 0.6, w: x1 - x0 - 1.2, h: y1 - y0 - 1.2 }) as const),
  );
})();

export interface GlyphRun {
  char: string;
  x: number;
  y: number;
}

export interface WordmarkLayout {
  glyphs: GlyphRun[];
  /** How far logo and text move right (banner units) to stay centred. */
  shift: number;
  /** How far each column moves inwards (banner units). */
  columnShift: number;
  /** Width of the text block (banner units). */
  width: number;
}

const blockWidth = (n: number) => (n === 0 ? 0 : n * ADVANCE + (n - 1) * TEXT.spacing);
const ORIGINAL_WIDTH = ORIGINAL_ORIGINS[1][7] + ADVANCE - ORIGINAL_ORIGINS[1][0];

/**
 * Glyph positions for a two-line wordmark. The original text keeps its exact
 * kerning; other text gets uniform spacing, the logo and text stay centred and
 * the columns move in or out so their gap to the wordmark matches the original.
 */
export function layoutWordmark(lines: readonly [string, string]): WordmarkLayout {
  const isOriginal = lines[0] === ORIGINAL_LINES[0] && lines[1] === ORIGINAL_LINES[1];
  const chars = lines.map((l) => [...l]);
  const width = isOriginal ? ORIGINAL_WIDTH : Math.max(...chars.map((c) => blockWidth(c.length)));
  const shift = (ORIGINAL_WIDTH - width) / 2;
  const glyphs: GlyphRun[] = [];
  chars.forEach((line, li) => {
    line.forEach((char, i) => {
      const x = isOriginal ? ORIGINAL_ORIGINS[li][i] : TEXT.origins[li] + i * (ADVANCE + TEXT.spacing);
      glyphs.push({ char, x: x + shift, y: TEXT.baselines[li] });
    });
  });
  return { glyphs, shift, columnShift: shift, width };
}

/** Tile placement of the four pattern strips (from the original generator, in vw/vh). */
export function patternTiles(): { pattern: number; left: number; top: number; flip: boolean }[] {
  const tiles = [];
  for (let r = 0; r < 9; r++) {
    const off = -(((r * 37) % 100) / 100) * 22;
    for (let c = 0; c < 7; c++) {
      tiles.push({ pattern: (r * 3 + c) % 4, left: off + c * 22, top: r * 12.4 - 3, flip: (r + c) % 3 === 0 });
    }
  }
  return tiles;
}

/** File-name friendly version of the slogan. */
export function slug(lines: readonly [string, string]): string {
  const s = lines
    .join("_")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "WALLPAPER";
}
