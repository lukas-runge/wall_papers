# WALL_PAPERS

Make your own **40C3 · MODEL_ CITIZENS** wallpapers, right in the browser:
your own two-line slogan, the eight CI colours (or any colour you like), your
own citizens in the boxes, and a layout that leaves room for the macOS lock
screen. Build as many variants as you like and download them in one go as PNG,
SVG or as an editable FigCraft file. Nothing is uploaded; everything is
rendered on your machine.

**→ [lukas-runge.github.io/wall_papers](https://lukas-runge.github.io/wall_papers/)**

![The original wallpaper, rendered by WALL_PAPERS](docs/preview.png)

## Features

- **Text.** Two lines in Hack Bold next to the 40C3 cube, e.g. `SELF_ / HOSTED`
  or `ESC_ / REALITY`. Logo and text stay centred and the box columns keep the
  original gap to the text. Looks best when line 2 is longer than line 1.
- **Colour.** The eight CI colours of the styleguide, or your own. The dark
  background is tinted to match: same chroma and same perceived lightness
  (Helmholtz–Kohlrausch corrected) as the original `#000d00`, hue of the
  accent. Green keeps the original values exactly.
- **Boxes.** Each of the six boxes takes one of the banner's line drawings, a
  citizen or an icon from the styleguide (recoloured to the palette), or stays
  empty — picked from a gallery that previews every option in its box.
- **Layout.** *macOS lock screen* puts the banner between clock and login like
  the original wallpaper; *Centred* puts banner and pattern in the middle.
- **Variants.** Any number of variants (text, colour, boxes, layout), with
  thumbnails; *+ All colours* adds the current design in every CI colour.
- **Export.** Any size up to 16384 px. PNG, SVG (fonts embedded) or FigCraft.
  *Download all variants* gives a ZIP of PNGs/SVGs, or one `.figcraft` file
  with a frame per variant.

The whole set of variants lives in the URL, so it can be shared as a link.

## How it works

Every variant is one SVG document (`src/lib/wallpaper.ts`). PNG export
rasterises it on a canvas, SVG export is the document itself, and the FigCraft
export converts it into FigCraft's native format (`src/lib/figcraft.ts`):
groups, rectangles, vector networks, luminance masks and live text with
per-glyph spacing. All three come from the same source, so they cannot drift
apart.

With the default settings the result reproduces the original 8K wallpaper:
mean difference 0.16/255 per channel for the PNG, 0.19/255 for the FigCraft
file as rendered by FigCraft (anti-aliasing along edges).

## Development

Requires Node.js 26 LTS (`nvm use`) and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # svelte-check
pnpm test         # vitest
pnpm build        # static site in build/
```

`src/lib/generated/banner-parts.ts` is generated from the unmodified banner
SVG: `pnpm split-banner` (Python 3). CI fails if it is out of date.

| File | What |
|---|---|
| `src/lib/wallpaper.ts` | The wallpaper as SVG: background, pattern, masks, banner, wordmark |
| `src/lib/banner.ts` | Banner and boxes, asset embedding, CSS classes → attributes |
| `src/lib/figcraft.ts` | SVG → `.figcraft` converter |
| `src/lib/svgpath.ts` | SVG path parser (lines, curves, arcs) |
| `src/lib/colors.ts` | CI palette and the background derivation |
| `src/lib/layout.ts` | Banner geometry, wordmark layout, placements |
| `src/lib/state.ts` | Variants, export settings, URL hash, file names |
| `src/lib/render.ts` | Rasterising in the browser |
| `src/routes/+page.svelte`, `src/lib/components/` | The app |

Every push to `main` runs type check, tests and build, then deploys to GitHub
Pages ([.github/workflows/ci.yml](.github/workflows/ci.yml)). The base path
comes from the repository name, so renaming the repository just works.

## Credits

Design assets from the official 40C3 styleguide by the 40C3 design team, fonts
Hack and Jersey 10; see [NOTICE.md](NOTICE.md). Unofficial fan tool, not
affiliated with the CCC. Code: [MIT](LICENSE).
