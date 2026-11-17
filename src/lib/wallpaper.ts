/**
 * The whole wallpaper as one SVG document. PNG export rasterises it, the SVG
 * export is this document and the FigCraft export converts it, so all three
 * formats come from the same source.
 *
 * Layers, bottom to top (as in the original generator):
 *  1. background: ground colour with an elliptical vignette towards the edge colour
 *  2. pattern strips at 11 % opacity, faded out in an oval around the banner and
 *     darkened towards the edges like the vignette
 *  3. banner: boxes, loading bar, ruler, logo
 *  4. wordmark in Hack Bold, fill plus a thin stroke
 */
import { BANNER_WHITE, type Palette } from "./colors";
import { bannerMarkup, flattenSvg, viewBox, type AssetSource, type Slots } from "./banner";
import { BANNER, BANNER_HEIGHT, PLACEMENTS, TEXT, layoutWordmark, patternTiles, type Placement } from "./layout";

export interface Design {
  lines: [string, string];
  palette: Palette;
  slots: Slots;
  placement: Placement;
}

export interface Sources {
  patterns: readonly string[];
  logo: string;
  assets: readonly AssetSource[];
  /** Hack Bold as base64 WOFF2; embedded so the SVG renders anywhere. */
  fontBase64?: string;
}

export const PATTERN_ALPHA = 0.11;
/** Vignette: radius 0.8 of width/height; the edge colour sits at 1.064 of that. */
const VIGNETTE = 0.8;
const EDGE_AT = 1.06383;

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function radial(id: string, cx: number, cy: number, rx: number, ry: number, stops: [number, string, number?][]): string {
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${n(cx)} ${n(cy)}) scale(${n(rx)} ${n(ry)})">` +
    stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`).join("") +
    `</radialGradient>`
  );
}

/** Banner placement in wallpaper pixels. */
export function bannerFrame(width: number, height: number, placement: Placement) {
  const h = BANNER_HEIGHT * height;
  const s = h / BANNER.height;
  const w = BANNER.width * s;
  return { x: (width - w) / 2, y: PLACEMENTS[placement].bannerTop * height, w, h, s };
}

export function wallpaperSvg(d: Design, width: number, height: number, src: Sources, id = "w"): string {
  const W = width, H = height, p = d.palette;
  const place = PLACEMENTS[d.placement];
  const layout = layoutWordmark(d.lines);
  const b = bannerFrame(W, H, d.placement);

  const defs: string[] = [];
  if (src.fontBase64) {
    defs.push(`<style>@font-face{font-family:"Hack";font-weight:700;src:url(data:font/woff2;base64,${src.fontBase64}) format("woff2")}</style>`);
  }
  defs.push(
    radial(`${id}-ground`, W / 2, H / 2, VIGNETTE * EDGE_AT * W, VIGNETTE * EDGE_AT * H, [
      [0, p.ground],
      [0.516949, p.ground],
      [1, p.edge],
    ]),
    // Luminance masks: white with opacity = how much pattern shows.
    radial(`${id}-oval-g`, W / 2, place.ovalCenterY * H, 0.58 * W, 0.62 * H, [
      [0, "#ffffff", 0],
      [0.38, "#ffffff", 0],
      [0.52, "#ffffff", 0.12],
      [0.68, "#ffffff", 0.4],
      [0.86, "#ffffff", 0.8],
      [1, "#ffffff", 1],
    ]),
    radial(`${id}-vig-g`, W / 2, H / 2, VIGNETTE * W, VIGNETTE * H, [
      [0, "#ffffff", 1],
      [0.55, "#ffffff", 1],
      [1, "#ffffff", 0.5],
    ]),
    `<mask id="${id}-oval" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}-oval-g)"/></mask>`,
    `<mask id="${id}-vig" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}-vig-g)"/></mask>`,
  );
  const tileW = 0.21 * W;
  const scales = src.patterns.map((svg, i) => {
    const [, , vw, vh] = viewBox(svg);
    defs.push(`<g id="${id}-p${i}" data-name="Pattern${i}">${flattenSvg(svg, () => p.accent)}</g>`);
    return { s: tileW / vw, h: (tileW / vw) * vh };
  });

  const tiles = patternTiles()
    .map((t) => {
      const x = (t.left / 100) * W, y = (t.top / 100) * H, s = scales[t.pattern].s;
      const tf = t.flip ? `translate(${n(x + tileW)} ${n(y)}) scale(${n(-s)} ${n(s)})` : `translate(${n(x)} ${n(y)}) scale(${n(s)})`;
      return `<use href="#${id}-p${t.pattern}" transform="${tf}"/>`;
    })
    .join("");

  const banner = bannerMarkup({ palette: p, slots: d.slots, assets: src.assets, logo: src.logo, shift: layout.shift });

  const text = d.lines
    .map((line, li) => {
      const glyphs = layout.glyphs.filter((g) => g.y === TEXT.baselines[li]);
      if (!glyphs.length) return "";
      const xs = glyphs.map((g) => n(b.x + g.x * b.s)).join(" ");
      return `<text data-name="Line ${li + 1}" x="${xs}" y="${n(b.y + TEXT.baselines[li] * b.s)}" xml:space="preserve">${esc(line)}</text>`;
    })
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>${defs.join("")}</defs>` +
    `<rect data-name="Background" width="${W}" height="${H}" fill="url(#${id}-ground)"/>` +
    `<g data-name="Pattern" opacity="${PATTERN_ALPHA}" mask="url(#${id}-vig)"><g data-name="Pattern oval" mask="url(#${id}-oval)">${tiles}</g></g>` +
    `<g data-name="Banner" transform="translate(${n(b.x)} ${n(b.y)}) scale(${n(b.s)})">${banner}</g>` +
    `<g data-name="Wordmark" font-family="Hack, monospace" font-weight="700" font-size="${n(TEXT.fontSize * b.s)}" fill="${BANNER_WHITE}" stroke="${BANNER_WHITE}" stroke-width="${n(TEXT.stroke * b.s)}" stroke-miterlimit="10">${text}</g>` +
    `</svg>`
  );
}
