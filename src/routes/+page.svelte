<script lang="ts">
  import { onMount } from "svelte";
  import { strToU8, zipSync } from "fflate";
  import BoxPicker from "#components/BoxPicker";
  import ColourPicker from "#components/ColourPicker";
  import Segmented from "#components/Segmented";
  import BoxGallery, { SLOT_NAMES } from "#components/BoxGallery";
  import { SLOTS, creatureCatalogue, type SlotId } from "#lib/banner";
  import { ASSETS } from "#lib/assets";
  import { CI_MODES } from "#lib/colors";
  import { canvasToBlob, loadSources, renderWallpaper, svgDocument } from "#lib/render";
  import { figcraftFile } from "#lib/figcraft";
  import { boxRects, wallpaperSvg } from "#lib/wallpaper";
  import type { Placement } from "#lib/layout";
  import {
    FORMATS,
    SIZES,
    cloneVariant,
    colourInfo,
    designOf,
    fileNames,
    readState,
    variantLabel,
    variantMeta,
    writeState,
    type AppState,
    type Format,
    type Variant,
  } from "#lib/state";

  let s = $state<AppState>(readState(location.hash));
  const v = $derived(s.variants[s.active]);
  const info = $derived(colourInfo(v.colour));
  const sizeKey = $derived(`${v.width}x${v.height}`);
  const isPreset = $derived(SIZES.some(([w, h]) => `${w}x${h}` === sizeKey));
  let customSize = $state(false);

  let preview: HTMLCanvasElement;
  let thumbs = $state<Record<string, string>>({});
  let status = $state("");
  let busy = $state(false);

  const update = (patch: Partial<Variant>) => (s.variants[s.active] = { ...v, ...patch });
  // The custom size fields belong to the variant being edited.
  $effect(() => {
    s.active;
    customSize = false;
  });

  // Page colours follow the active variant.
  $effect(() => {
    const root = document.documentElement.style;
    root.setProperty("--ground", info.palette.ground);
    root.setProperty("--accent", info.palette.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", info.palette.ground);
  });

  // State lives in the URL, so a set of variants can be shared as a link.
  $effect(() => {
    const hash = writeState(s);
    if (location.hash.slice(1) !== hash) history.replaceState(null, "", hash ? `#${hash}` : location.pathname);
  });

  // Preview of the active variant.
  let previewGen = 0;
  $effect(() => {
    const design = designOf(v), w = v.width, h = v.height;
    const g = ++previewGen;
    const t = setTimeout(async () => {
      const pw = Math.min(1920, w), ph = Math.round((pw * h) / w);
      try {
        const c = await renderWallpaper(design, pw, ph);
        if (g !== previewGen) return;
        preview.width = pw;
        preview.height = ph;
        preview.getContext("2d")!.drawImage(c, 0, 0);
      } catch (e) {
        status = (e as Error).message;
      }
    }, 80);
    return () => clearTimeout(t);
  });

  // Thumbnails of all variants (cached by look and aspect ratio; the format does not change them).
  const thumbKey = (x: Variant) => JSON.stringify({ ...x, format: undefined });
  $effect(() => {
    const todo = s.variants.map((x) => ({ key: thumbKey(x), design: designOf(x), w: x.width, h: x.height })).filter((x) => !thumbs[x.key]);
    if (!todo.length) return;
    const t = setTimeout(async () => {
      for (const x of todo) {
        if (thumbs[x.key]) continue;
        const c = await renderWallpaper(x.design, 400, Math.round((400 * x.h) / x.w));
        thumbs[x.key] = URL.createObjectURL(await canvasToBlob(c));
      }
    }, 300);
    return () => clearTimeout(t);
  });

  function addVariant() {
    s.variants.push(cloneVariant(v));
    s.active = s.variants.length - 1;
  }
  function addAllColours() {
    const have = new Set(s.variants.filter((x) => x.line1 === v.line1 && x.line2 === v.line2).map((x) => x.colour));
    for (const m of CI_MODES) if (!have.has(m.id)) s.variants.push({ ...cloneVariant(v), colour: m.id });
  }
  function removeVariant(i: number) {
    if (s.variants.length === 1) return;
    s.variants.splice(i, 1);
    s.active = Math.min(s.active, s.variants.length - 1);
  }

  function save(data: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** PNG or SVG bytes of one variant. */
  async function encode(x: Variant): Promise<Uint8Array> {
    if (x.format === "svg") return strToU8(await svgDocument(designOf(x), x.width, x.height));
    const c = await renderWallpaper(designOf(x), x.width, x.height);
    try {
      return new Uint8Array(await (await canvasToBlob(c)).arrayBuffer());
    } finally {
      c.width = c.height = 0;
    }
  }

  async function figcraft(list: Variant[]): Promise<Uint8Array> {
    const src = await loadSources();
    const frames = list.map((x) => ({ name: variantLabel(x), svg: wallpaperSvg(designOf(x), x.width, x.height, { ...src, fontBase64: undefined }) }));
    const tc = await renderWallpaper(designOf(list[0]), 512, Math.round((512 * list[0].height) / list[0].width));
    return figcraftFile(frames, "WALL_PAPERS", new Uint8Array(await (await canvasToBlob(tc)).arrayBuffer()));
  }

  const mime: Record<Format, string> = { png: "image/png", svg: "image/svg+xml", figcraft: "application/zip" };

  async function run(task: () => Promise<void>) {
    busy = true;
    status = "";
    try {
      await task();
    } catch (e) {
      status = `${(e as Error).message}`;
    } finally {
      busy = false;
    }
  }

  const blob = (data: Uint8Array, type: string) => new Blob([data as Uint8Array<ArrayBuffer>], { type });

  const downloadVariant = () =>
    run(async () => {
      const [name] = fileNames([v]);
      status = "Rendering …";
      save(blob(v.format === "figcraft" ? await figcraft([v]) : await encode(v), mime[v.format]), name);
      status = "";
    });

  /** Every variant in its own size and format. FigCraft variants share one .figcraft file (a frame each). */
  const downloadAll = () =>
    run(async () => {
      const fig = s.variants.filter((x) => x.format === "figcraft");
      if (fig.length === s.variants.length) {
        status = `Rendering ${fig.length} variants …`;
        save(blob(await figcraft(fig), mime.figcraft), "WALL_PAPERS.figcraft");
        status = "";
        return;
      }
      const names = fileNames(s.variants);
      const files: Record<string, Uint8Array> = {};
      for (const [i, x] of s.variants.entries()) {
        if (x.format === "figcraft") continue;
        status = `Rendering ${i + 1} / ${s.variants.length} …`;
        files[names[i]] = await encode(x);
      }
      if (fig.length) {
        status = "Rendering FigCraft file …";
        files["WALL_PAPERS.figcraft"] = await figcraft(fig);
      }
      save(blob(zipSync(files, { level: 0 }), "application/zip"), "WALL_PAPERS.zip");
      status = "";
    });

  onMount(() => {
    const onHash = () => (s = readState(location.hash));
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  });

  const clampSize = (val: string) => Math.min(16384, Math.max(64, Math.round(Number(val) || 0)));

  // Boxes in the preview: click to change their contents.
  const catalogue = creatureCatalogue(ASSETS);
  const creatureLabel = (id: string) => catalogue.find((c) => c.id === id)?.label ?? id;
  const hotspots = $derived(boxRects({ lines: [v.line1, v.line2], placement: v.placement }, v.width, v.height));
  let openBox = $state<SlotId | null>(null);
  let stage: HTMLElement;
  const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
  function closeOnOutside(e: MouseEvent) {
    if (openBox && stage && !stage.contains(e.target as Node)) openBox = null;
  }
  $effect(() => {
    s.active;
    openBox = null;
  });

  const LAYOUTS: { id: Placement; label: string }[] = [
    { id: "centered", label: "Centred" },
    { id: "lockscreen", label: "macOS lock screen" },
  ];
</script>

<svelte:window onclick={closeOnOutside} onkeydown={(e) => e.key === "Escape" && (openBox = null)} />

<header class="masthead">
  <h1 class="wordmark" aria-label="WALL_PAPERS"><span>WALL<span class="cursor">_</span></span><span>PAPERS</span></h1>
</header>

<main class="layout">
  <section class="stage">
    <div class="frame">
      <div class="canvas" bind:this={stage}>
        <canvas bind:this={preview} aria-label="Preview of {variantLabel(v)}"></canvas>
        {#each SLOTS as slot (slot)}
          {@const r = hotspots[slot]}
          <button
            type="button"
            class="hotspot"
            class:open={openBox === slot}
            style="left: {pct(r.x)}; top: {pct(r.y)}; width: {pct(r.w)}; height: {pct(r.h)}"
            aria-label="Box {SLOT_NAMES[slot]}: {creatureLabel(v.slots[slot])}"
            aria-expanded={openBox === slot}
            title={creatureLabel(v.slots[slot])}
            onclick={() => (openBox = openBox === slot ? null : slot)}
          ></button>
        {/each}
        {#if openBox}
          {@const slot = openBox}
          {@const r = hotspots[slot]}
          <div
            class="popover"
            style={slot.startsWith("L") ? `left: ${pct(r.x + r.w + 0.012)}; top: ${pct(Math.min(r.y, 0.45))}` : `right: ${pct(1 - r.x + 0.012)}; top: ${pct(Math.min(r.y, 0.45))}`}
          >
            <BoxGallery
              {slot}
              value={v.slots[slot]}
              palette={info.palette}
              onpick={(id) => {
                update({ slots: { ...v.slots, [slot]: id } });
                openBox = null;
              }}
            />
          </div>
        {/if}
      </div>
    </div>

    <h2>Variants</h2>
    <div class="variants">
      {#each s.variants as x, i (i)}
        <div class="variant" class:on={i === s.active}>
          <button type="button" class="pick" onclick={() => (s.active = i)} aria-label="Edit {variantLabel(x)}" aria-pressed={i === s.active}>
            {#if thumbs[thumbKey(x)]}<img src={thumbs[thumbKey(x)]} alt="" />{:else}<span class="placeholder"></span>{/if}
            <span class="name">{variantLabel(x)}</span>
            <span class="meta">{variantMeta(x)}</span>
          </button>
          {#if s.variants.length > 1}
            <button type="button" class="remove" onclick={() => removeVariant(i)} aria-label="Remove {variantLabel(x)}" title="Remove">×</button>
          {/if}
        </div>
      {/each}
      <div class="add">
        <button type="button" class="quiet" onclick={addVariant}>+ Variant</button>
        <button type="button" class="quiet" onclick={addAllColours}>+ All colours</button>
      </div>
    </div>
  </section>

  <aside class="panel">
    <fieldset>
      <legend>Text</legend>
      <label>Line 1 <input value={v.line1} oninput={(e) => update({ line1: e.currentTarget.value.toUpperCase() })} maxlength="14" spellcheck="false" /></label>
      <label>Line 2 <input value={v.line2} oninput={(e) => update({ line2: e.currentTarget.value.toUpperCase() })} maxlength="14" spellcheck="false" /></label>
    </fieldset>

    <fieldset>
      <legend>Colour</legend>
      <ColourPicker value={v.colour} onchange={(colour) => update({ colour })} />
    </fieldset>

    <fieldset>
      <legend>Boxes</legend>
      <BoxPicker slots={v.slots} palette={info.palette} onchange={(slots) => update({ slots })} />
    </fieldset>

    <fieldset>
      <legend>Layout</legend>
      <Segmented label="Layout" options={LAYOUTS} value={v.placement} onchange={(placement) => update({ placement })} />
    </fieldset>

    <fieldset>
      <legend>Output</legend>
      <label>Size
        <select
          value={customSize || !isPreset ? "custom" : sizeKey}
          onchange={(e) => {
            const val = e.currentTarget.value;
            customSize = val === "custom";
            if (!customSize) {
              const [width, height] = val.split("x").map(Number);
              update({ width, height });
            }
          }}
        >
          {#each SIZES as [w, h] (`${w}x${h}`)}<option value="{w}x{h}">{w} × {h}</option>{/each}
          <option value="custom">Custom</option>
        </select>
      </label>
      {#if customSize || !isPreset}
        <div class="custom-size">
          <label>Width <input type="number" min="64" max="16384" value={v.width} onchange={(e) => update({ width: clampSize(e.currentTarget.value) })} /></label>
          <label>Height <input type="number" min="64" max="16384" value={v.height} onchange={(e) => update({ height: clampSize(e.currentTarget.value) })} /></label>
        </div>
      {/if}
      <Segmented label="Format" options={FORMATS} value={v.format} onchange={(format) => update({ format })} />
    </fieldset>

    <fieldset>
      <legend>Download</legend>
      <button type="button" class="loud" disabled={busy} onclick={downloadVariant}>Download variant</button>
      <button type="button" class="quiet" disabled={busy} onclick={downloadAll}>Download all variants</button>
      {#if status}<p class="status" role="status">{status}</p>{/if}
    </fieldset>
  </aside>
</main>

<footer class="footer">
  <p>
    Design assets: <a href="https://events.ccc.de/congress/2026/infos/styleguide/">40C3 styleguide</a> by the 40C3 design team.
    Fonts: <a href="https://sourcefoundry.org/hack/">Hack</a> (MIT / Bitstream Vera),
    <a href="https://fonts.google.com/specimen/Jersey+10">Jersey 10</a> (OFL).
    Unofficial, not by the CCC. <a href="https://github.com/lukas-runge/wall_papers">Source</a>
  </p>
</footer>

<style>
  .masthead {
    padding: var(--gap) var(--gap) 0;
  }
  .wordmark {
    margin: 0;
    display: grid;
    width: max-content;
    font: 700 clamp(28px, 4vw, 44px) / 1.05 "Hack", monospace;
    color: var(--white);
    letter-spacing: 0.04em;
  }
  .cursor {
    color: var(--accent);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cursor {
      animation: none;
    }
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    gap: var(--gap);
    padding: var(--gap);
    align-items: start;
  }
  @media (max-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .canvas {
    position: relative;
  }
  .hotspot {
    position: absolute;
    padding: 0;
    border: 2px solid transparent;
    background: transparent;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .hotspot:hover,
  .hotspot:focus-visible,
  .hotspot.open {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    outline: none;
  }
  .popover {
    position: absolute;
    z-index: 2;
    width: min(360px, 60%);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.55);
  }
  .frame {
    border: 1.5px solid var(--accent);
    padding: 6px;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
  }
  h2 {
    font-size: 1.6rem;
    margin: 1rem 0 0.5rem;
  }

  .variants {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .variant {
    position: relative;
    border: 1.5px solid var(--line);
  }
  .variant.on {
    border-color: var(--accent);
  }
  .pick {
    display: grid;
    gap: 4px;
    width: 100%;
    padding: 4px;
    border: 0;
    background: none;
    color: var(--muted);
    font: 400 0.8rem/1.3 "Hack", monospace;
    text-align: left;
  }
  .variant.on .pick {
    color: var(--white);
  }
  .pick img,
  .placeholder {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    background: color-mix(in srgb, var(--white) 6%, var(--ground));
  }
  .meta {
    font-size: 0.7rem;
    color: var(--muted);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remove {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
    font: 700 1.1rem/1 "Hack", monospace;
    background: var(--ground);
    color: var(--white);
    border-color: var(--line);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .variant:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .add {
    display: grid;
    gap: 8px;
    align-content: center;
  }

  .panel {
    display: grid;
    gap: 1rem;
  }
  fieldset {
    margin: 0;
    border: 1.5px solid var(--line);
    padding: 0.3rem 1rem 1rem;
    display: grid;
    gap: 0.7rem;
    min-width: 0;
  }
  legend {
    font-size: 1.6rem;
    padding: 0 0.3em;
  }
  label {
    display: grid;
    gap: 0.25rem;
    color: var(--muted);
  }
  input:not([type="color"]) {
    color: var(--white);
  }
  fieldset:first-of-type input {
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.05em;
  }
  .custom-size {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .status {
    margin: 0;
    color: var(--muted);
  }

  .footer {
    padding: 0 var(--gap) var(--gap);
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
