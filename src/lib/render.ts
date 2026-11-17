/** Rasterises the wallpaper SVG in the browser. */
import { ASSETS, HACK_BOLD_URL, LOGO_SVG, PATTERNS } from "./assets";
import { wallpaperSvg, type Design, type Sources } from "./wallpaper";

let sources: Promise<Sources> | undefined;

/** Pattern, logo, assets and the base64 font, loaded once. */
export function loadSources(): Promise<Sources> {
  sources ??= (async () => {
    const buf = new Uint8Array(await (await fetch(HACK_BOLD_URL)).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    // The page uses the same face, so canvas and preview agree on metrics.
    await document.fonts.load('700 16px "Hack"');
    return { patterns: PATTERNS, logo: LOGO_SVG, assets: ASSETS, fontBase64: btoa(bin) };
  })();
  return sources;
}

export async function svgDocument(d: Design, width: number, height: number): Promise<string> {
  return wallpaperSvg(d, width, height, await loadSources());
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function renderWallpaper(d: Design, width: number, height: number, canvas = document.createElement("canvas")): Promise<HTMLCanvasElement> {
  const img = await svgImage(await svgDocument(d, width, height));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available (image too large for this browser?)");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed (image too large for this browser?)"))), "image/png"),
  );
}
