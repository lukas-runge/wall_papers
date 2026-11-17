/**
 * Renders a wallpaper onto a canvas, entirely in the browser.
 *
 * Layers, bottom to top (as in the original HTML generator):
 *  1. background: dark ground colour with a radial vignette towards the edge colour
 *  2. pattern strips at 11 % opacity, faded out in a large oval around the banner
 *     and darkened towards the edges like the vignette
 *  3. banner (frames, box contents, loading bar, ruler, logo)
 *  4. wordmark in Hack Bold, fill and a thin stroke in banner white
 */
import { BANNER_WHITE, type Palette } from "./colors";
import { bannerSvg, type Slots } from "./banner";
import { ASSETS, HACK_BOLD_URL, LOGO_SVG, PATTERNS } from "./assets";
import { BANNER, BANNER_HEIGHT, PLACEMENTS, TEXT, layoutWordmark, patternTiles, type Placement } from "./layout";

export interface WallpaperOptions {
  width: number;
  height: number;
  palette: Palette;
  lines: [string, string];
  slots: Slots;
  placement: Placement;
}

const PATTERN_ALPHA = 0.11;

let fontReady: Promise<void> | undefined;
/** Loads Hack Bold once; canvas text needs it before the first draw. */
export function loadFonts(): Promise<void> {
  fontReady ??= (async () => {
    const face = new FontFace("Hack", `url(${HACK_BOLD_URL})`, { weight: "700" });
    document.fonts.add(await face.load());
  })();
  return fontReady;
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The decoded image stays usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Pattern SVG in one colour, rasterised at the given pixel size. */
function patternSvg(src: string, colour: string, width: number): { svg: string; height: number } {
  const [, , vw, vh] = /viewBox="([^"]+)"/.exec(src)![1].split(/[\s,]+/).map(Number);
  const height = (width * vh) / vw;
  const svg = src
    .replace(/#[0-9a-f]{6}\b/gi, colour)
    .replace(/<svg\b/, `<svg width="${width}" height="${height}"`);
  return { svg, height };
}

/** Fills the whole canvas with an elliptical radial gradient. */
function ellipseGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stops: [number, string][],
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g;
  // Large enough to cover the canvas in the scaled space.
  ctx.fillRect(-10, -10, 20, 20);
  ctx.restore();
}

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export async function renderWallpaper(o: WallpaperOptions, canvas = newCanvas(o.width, o.height)): Promise<HTMLCanvasElement> {
  await loadFonts();
  const { width: W, height: H, palette } = o;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available (image too large for this browser?)");
  const place = PLACEMENTS[o.placement];

  // 1. Background with vignette (radius 0.8 of width/height; the edge colour sits at 1.064).
  const k = 0.8 * 1.06383;
  ellipseGradient(ctx, W / 2, H / 2, k * W, k * H, [
    [0, palette.ground],
    [0.516949, palette.ground],
    [1, palette.edge],
  ]);

  // 2. Pattern on its own layer, then masked.
  const pc = newCanvas(W, H);
  const p = pc.getContext("2d")!;
  const tileW = 0.21 * W;
  const tiles = await Promise.all(
    PATTERNS.map(async (src) => {
      const { svg, height } = patternSvg(src, palette.accent, tileW);
      return { img: await svgImage(svg), height };
    }),
  );
  for (const t of patternTiles()) {
    const { img, height } = tiles[t.pattern];
    const x = (t.left / 100) * W, y = (t.top / 100) * H;
    if (t.flip) {
      p.save();
      p.translate(x + tileW, y);
      p.scale(-1, 1);
      p.drawImage(img, 0, 0, tileW, height);
      p.restore();
    } else {
      p.drawImage(img, x, y, tileW, height);
    }
  }
  p.globalCompositeOperation = "destination-in";
  // Oval around the banner: no pattern in the middle, full strength at the rim.
  ellipseGradient(p, W / 2, place.ovalCenterY * H, 0.58 * W, 0.62 * H, [
    [0, "rgba(0,0,0,0)"],
    [0.38, "rgba(0,0,0,0)"],
    [0.52, "rgba(0,0,0,0.12)"],
    [0.68, "rgba(0,0,0,0.4)"],
    [0.86, "rgba(0,0,0,0.8)"],
    [1, "rgba(0,0,0,1)"],
  ]);
  // The vignette darkens the pattern too (down to 50 % at the edge).
  ellipseGradient(p, W / 2, H / 2, 0.8 * W, 0.8 * H, [
    [0, "rgba(0,0,0,1)"],
    [0.55, "rgba(0,0,0,1)"],
    [1, "rgba(0,0,0,0.5)"],
  ]);
  ctx.globalAlpha = PATTERN_ALPHA;
  ctx.drawImage(pc, 0, 0);
  ctx.globalAlpha = 1;
  pc.width = pc.height = 0;

  // 3. Banner.
  const bh = BANNER_HEIGHT * H;
  const s = bh / BANNER.height;
  const bw = BANNER.width * s;
  const bx = (W - bw) / 2, by = place.bannerTop * H;
  const layout = layoutWordmark(o.lines);
  const banner = await svgImage(
    bannerSvg({
      palette,
      slots: o.slots,
      assets: ASSETS,
      logo: LOGO_SVG,
      shift: layout.shift,
      width: Math.round(bw),
      height: Math.round(bh),
    }),
  );
  ctx.drawImage(banner, bx, by, bw, bh);

  // 4. Wordmark, glyph by glyph (keeps the hand-kerned original exact).
  ctx.font = `700 ${TEXT.fontSize * s}px Hack`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = BANNER_WHITE;
  ctx.strokeStyle = BANNER_WHITE;
  ctx.lineWidth = TEXT.stroke * s;
  ctx.miterLimit = 10;
  for (const g of layout.glyphs) {
    const x = bx + g.x * s, y = by + g.y * s;
    ctx.fillText(g.char, x, y);
    ctx.strokeText(g.char, x, y);
  }
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed (image too large for this browser?)"))), "image/png"),
  );
}
