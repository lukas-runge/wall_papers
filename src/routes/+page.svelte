<script lang="ts">
  import { onMount, tick } from "svelte";
  import { strToU8, zipSync } from "fflate";
  import ColourPicker from "#components/ColourPicker";
  import Segmented from "#components/Segmented";
  import BoxGallery, { SLOT_NAMES } from "#components/BoxGallery";
  import { DEFAULT_SLOTS, SLOTS, creatureCatalogue, type SlotId } from "#lib/banner";
  import { ASSETS } from "#lib/assets";
  import { BANNER_WHITE } from "#lib/colors";
  import { HACK_ADVANCE_EM } from "#lib/layout";
  import { canvasToBlob, loadSources, renderWallpaper, svgDocument } from "#lib/render";
  import { figcraftFile } from "#lib/figcraft";
  import { HACK_ASCENT, HACK_LINE, bannerFrame, boxRects, wallpaperSvg, wordmarkGeometry } from "#lib/wallpaper";
  import type { Placement } from "#lib/layout";
  import {
    FORMATS,
    SIZES,
    cloneVariant,
    colourInfo,
    designOf,
    fileNames,
    findShared,
    addShared,
    loadState,
    replaceWithShared,
    saveState,
    shareHash,
    sharedVariants,
    variantLabel,
    variantMeta,
    type AppState,
    type Format,
    type Variant,
  } from "#lib/state";

  /** Local storage, if the browser lets the page use it. */
  const storage = () => {
    try {
      return localStorage;
    } catch {
      return undefined;
    }
  };

  let s = $state<AppState>(loadState(storage()));
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

  // Editing in the preview: one box gallery or the text at a time.
  let openBox = $state<SlotId | null>(null);
  let editingText = $state(false);
  let lineInputs: HTMLInputElement[] = $state([]);

  // Switching variants closes editors and the custom size fields.
  $effect(() => {
    s.active;
    customSize = false;
    openBox = null;
    editingText = false;
  });

  /**
   * Page colours follow the active variant. They change in the same frame as
   * the preview picture (after it has rendered), so both switch together.
   */
  function applyTheme(p: { ground: string; accent: string }) {
    const root = document.documentElement.style;
    root.setProperty("--ground", p.ground);
    root.setProperty("--accent", p.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.ground);
  }

  // Variants stay in the browser between visits.
  $effect(() => saveState(storage(), s));

  // Sharing: a link to the active variant or to all of them.
  let link = $state("");
  let shareStatus = $state("");

  // A copied link stops matching once something changes.
  $effect(() => {
    JSON.stringify(s.variants);
    link = shareStatus = "";
  });

  async function share(list: Variant[]) {
    link = `${location.origin}${location.pathname}#${shareHash($state.snapshot(list))}`;
    try {
      await navigator.clipboard.writeText(link);
      shareStatus = list.length === 1 ? "Link copied" : `Link to ${list.length} variants copied`;
    } catch {
      shareStatus = "Copy the link:";
    }
  }

  // Opening a share link: known variants are just selected, new ones are offered.
  let incoming = $state<Variant[]>([]);
  let importDialog: HTMLDialogElement;
  const known = $derived(findShared(s, incoming));
  const newCount = $derived(known.filter((i) => i < 0).length);

  function openShared() {
    const shared = sharedVariants(location.hash);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (!shared.length) return;
    const at = findShared(s, shared);
    if (at.every((i) => i >= 0)) {
      s.active = at[0];
      return;
    }
    incoming = shared;
    importDialog.showModal();
  }

  function takeShared(how: "add" | "replace") {
    const st = $state.snapshot(s), shared = $state.snapshot(incoming);
    s = how === "add" ? addShared(st, shared) : replaceWithShared(st, shared);
    importDialog.close();
  }

  // Preview of the active variant (without its text while the text is being edited in place).
  let previewGen = 0;
  $effect(() => {
    const design = { ...designOf(v), hideText: editingText }, w = v.width, h = v.height;
    const g = ++previewGen;
    const t = setTimeout(async () => {
      const pw = Math.min(1920, w), ph = Math.round((pw * h) / w);
      try {
        const c = await renderWallpaper(design, pw, ph);
        if (g !== previewGen) return;
        preview.width = pw;
        preview.height = ph;
        preview.getContext("2d")!.drawImage(c, 0, 0);
        applyTheme(design.palette);
        startIntro();
      } catch (e) {
        status = (e as Error).message;
      }
    }, 30);
    return () => clearTimeout(t);
  });

  // Thumbnails of all variants (cached by look and aspect ratio; the format does not change them).
  const thumbKey = (x: Variant) => JSON.stringify({ ...x, format: undefined });
  $effect(() => {
    const todo = [...s.variants, ...incoming].map((x) => ({ key: thumbKey(x), design: designOf(x), w: x.width, h: x.height })).filter((x) => !thumbs[x.key]);
    if (!todo.length) return;
    const t = setTimeout(async () => {
      for (const x of todo) {
        if (thumbs[x.key]) continue;
        thumbs[x.key] = URL.createObjectURL(await canvasToBlob(await thumbnail(x.design, x.w, x.h)));
      }
    }, 300);
    return () => clearTimeout(t);
  });

  /** A 16:9 picture around the banner, so it shows larger on the small variant cards. */
  async function thumbnail(design: ReturnType<typeof designOf>, w: number, h: number) {
    const W = 640, H = Math.round((W * h) / w);
    const full = await renderWallpaper(design, W, H);
    const b = bannerFrame(W, H, design.placement);
    let ch = Math.min(H, b.h * 1.3), cw = (ch * 16) / 9;
    if (cw > W) [cw, ch] = [W, (W * 9) / 16];
    const cx = Math.min(Math.max(W / 2 - cw / 2, 0), W - cw), cy = Math.min(Math.max(b.y + b.h / 2 - ch / 2, 0), H - ch);
    const out = document.createElement("canvas");
    out.width = 320;
    out.height = 180;
    out.getContext("2d")!.drawImage(full, cx, cy, cw, ch, 0, 0, 320, 180);
    full.width = full.height = 0;
    return out;
  }

  // Geometry of the clickable parts of the preview, as fractions of the wallpaper.
  const boxes = $derived(boxRects({ lines: [v.line1, v.line2], placement: v.placement }, v.width, v.height));
  const words = $derived(wordmarkGeometry({ lines: [v.line1, v.line2], placement: v.placement }, v.width, v.height));
  const pct = (f: number) => `${(f * 100).toFixed(4)}%`;
  /** Length in container-query units: scales with the preview width. */
  const cq = (px: number) => `${((px / v.width) * 100).toFixed(4)}cqw`;

  const catalogue = creatureCatalogue(ASSETS);
  const creatureLabel = (id: string) => catalogue.find((c) => c.id === id)?.label ?? id;
  const boxesAreOriginal = $derived(SLOTS.every((slot) => v.slots[slot] === DEFAULT_SLOTS[slot]));

  function toggleBox(slot: SlotId) {
    editingText = false;
    openBox = openBox === slot ? null : slot;
  }

  async function editText(line: 0 | 1) {
    openBox = null;
    editingText = true;
    await tick();
    lineInputs[line]?.focus();
    lineInputs[line]?.select();
  }

  // Once, after the first picture: the editable parts light up, left to right.
  let intro = $state(false);
  let introPlayed = false;
  function startIntro() {
    if (introPlayed) return;
    introPlayed = true;
    intro = true;
    setTimeout(() => (intro = false), 2600);
  }
  /** Wave order of the hint: left column, text, right column. */
  const HINT_ORDER: Record<string, number> = { L1: 0, L2: 1, L3: 2, line0: 3, line1: 4, R1: 5, R2: 6, R3: 7 };

  /** Clicks outside a gallery, a box or the text inputs close what is open. */
  function onWindowClick(e: MouseEvent) {
    const t = e.target as Element;
    intro = false;
    if (openBox && !t.closest(".popover, .hotspot")) openBox = null;
    if (editingText && !t.closest(".line-input, .text-hotspot")) editingText = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      openBox = null;
      editingText = false;
    }
  }

  // The variant strip fades out at a side where more cards are hidden.
  let strip: HTMLDivElement;
  let fadeL = $state(false), fadeR = $state(false);
  function measureStrip() {
    fadeL = strip.scrollLeft > 1;
    fadeR = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
  }
  $effect(() => {
    const ro = new ResizeObserver(measureStrip);
    ro.observe(strip);
    return () => ro.disconnect();
  });
  // Keep the active card in view (after adding, selecting or importing a variant).
  $effect(() => {
    const i = s.active, n = s.variants.length;
    tick().then(() => {
      strip.querySelectorAll(".variant")[i]?.scrollIntoView({ inline: "nearest", block: "nearest" });
      measureStrip();
    });
    void n;
  });

  function addVariant() {
    s.variants.push(cloneVariant(v));
    s.active = s.variants.length - 1;
  }
  // Removing asks first.
  let removeDialog: HTMLDialogElement;
  let removing = $state<number | null>(null);
  function askRemove(i: number) {
    removing = i;
    removeDialog.showModal();
  }
  function confirmRemove() {
    if (removing !== null) removeVariant(removing);
    removeDialog.close();
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
  const blob = (data: Uint8Array, type: string) => new Blob([data as Uint8Array<ArrayBuffer>], { type });

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
    applyTheme(info.palette);
    openShared();
    addEventListener("hashchange", openShared);
    return () => removeEventListener("hashchange", openShared);
  });

  const clampSize = (val: string) => Math.min(16384, Math.max(64, Math.round(Number(val) || 0)));

  const LAYOUTS: { id: Placement; label: string }[] = [
    { id: "centered", label: "Centred" },
    { id: "lockscreen", label: "macOS lock screen" },
  ];
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

{#snippet card(x: Variant)}
  {#if thumbs[thumbKey(x)]}<img src={thumbs[thumbKey(x)]} alt="" />{:else}<span class="placeholder"></span>{/if}
  <span class="text">
    <span class="name">{x.line1} {x.line2}</span>
    <span class="meta">{colourInfo(x.colour).name}</span>
    <span class="meta">{variantMeta(x)}</span>
  </span>
{/snippet}

<header class="masthead">
  <h1 class="wordmark" aria-label="WALL_PAPERS"><span>WALL<span class="cursor">_</span></span><span>PAPERS</span></h1>
    <div class="variants" bind:this={strip} onscroll={measureStrip} style="--fade-l: {fadeL ? '40px' : '0px'}; --fade-r: {fadeR ? '56px' : '0px'}">
      {#each s.variants as x, i (i)}
        <div class="variant" class:on={i === s.active}>
          <button type="button" class="pick" onclick={() => (s.active = i)} aria-label="Edit {variantLabel(x)}" aria-pressed={i === s.active}>
            {@render card(x)}
          </button>
          {#if s.variants.length > 1}
            <button type="button" class="remove" onclick={() => askRemove(i)} aria-label="Remove {variantLabel(x)}" title="Remove">×</button>
          {/if}
        </div>
      {/each}
      <div class="add">
        <button type="button" class="quiet" onclick={addVariant}>+ Variant</button>
      </div>
    </div>
</header>

<div class="layout">
  <main class="stage">
    <div class="frame" style="--aspect: {v.width / v.height}">
      <div class="canvas" class:intro>
        <canvas bind:this={preview} aria-label="Preview of {variantLabel(v)}"></canvas>

        {#each SLOTS as slot (slot)}
          {@const r = boxes[slot]}
          <button
            type="button"
            class="hotspot"
            class:open={openBox === slot}
            style="left: {pct(r.x)}; top: {pct(r.y)}; width: {pct(r.w)}; height: {pct(r.h)}; --hint: {HINT_ORDER[slot]}"
            aria-label="Box {SLOT_NAMES[slot]}: {creatureLabel(v.slots[slot])}"
            aria-expanded={openBox === slot}
            title={creatureLabel(v.slots[slot])}
            onclick={() => toggleBox(slot)}
          ></button>
        {/each}

        {#if editingText}
          {#each words.lines as l, li (li)}
            <input
              bind:this={lineInputs[li]}
              class="line-input"
              aria-label="Line {li + 1}"
              maxlength="14"
              spellcheck="false"
              autocomplete="off"
              value={li === 0 ? v.line1 : v.line2}
              style="left: {pct(l.x / v.width)}; top: {pct((l.baseline - HACK_ASCENT * words.fontSize) / v.height)};
                font-size: {cq(words.fontSize)}; letter-spacing: {cq(words.spacing)};
                width: {cq((Math.max([...(li === 0 ? v.line1 : v.line2)].length, 1) + 1) * (HACK_ADVANCE_EM * words.fontSize + words.spacing))};
                -webkit-text-stroke: {cq(words.stroke)} {BANNER_WHITE}; color: {BANNER_WHITE}; --line: {HACK_LINE}"
              oninput={(e) => update(li === 0 ? { line1: e.currentTarget.value.toUpperCase() } : { line2: e.currentTarget.value.toUpperCase() })}
              onkeydown={(e) => {
                if (e.key === "Enter" || (e.key === "ArrowDown" && li === 0) || (e.key === "ArrowUp" && li === 1)) {
                  e.preventDefault();
                  if (e.key === "Enter" && li === 1) editingText = false;
                  else lineInputs[li === 0 ? 1 : 0]?.focus();
                }
              }}
            />
          {/each}
        {:else}
          {#each words.lines as l, li (li)}
            <button
              type="button"
              class="text-hotspot"
              style="left: {pct(words.rect.x / v.width)}; top: {pct((l.baseline - HACK_ASCENT * words.fontSize) / v.height)};
                width: {pct(words.rect.w / v.width)}; height: {pct((HACK_LINE * words.fontSize) / v.height)}; --hint: {HINT_ORDER[`line${li}`]}"
              aria-label="Edit line {li + 1}: {li === 0 ? v.line1 : v.line2}"
              title="Edit text"
              onclick={() => editText(li as 0 | 1)}
            ></button>
          {/each}
        {/if}

        {#if openBox}
          {@const slot = openBox}
          {@const r = boxes[slot]}
          <div
            class="popover"
            style={slot.startsWith("L") ? `left: ${pct(r.x + r.w + 0.012)}; top: ${pct(Math.min(r.y, 0.4))}` : `right: ${pct(1 - r.x + 0.012)}; top: ${pct(Math.min(r.y, 0.4))}`}
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
            <button type="button" class="quiet small reset" disabled={boxesAreOriginal} onclick={() => update({ slots: { ...DEFAULT_SLOTS } })}>Reset all boxes</button>
          </div>
        {/if}
      </div>
    </div>

  </main>

  <aside class="panel">
    <fieldset>
      <legend>Colour</legend>
      <ColourPicker value={v.colour} onchange={(colour) => update({ colour })} />
    </fieldset>

    <fieldset>
      <legend>Layout</legend>
      <Segmented label="Layout" options={LAYOUTS} value={v.placement} onchange={(placement) => update({ placement })} />
    </fieldset>

    <fieldset>
      <legend>Output</legend>
      <select
        aria-label="Size"
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
        <option value="custom">Custom size</option>
      </select>
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

    <fieldset>
      <legend>Share</legend>
      <button type="button" class="quiet" onclick={() => share([v])}>Share variant</button>
      <button type="button" class="quiet" onclick={() => share(s.variants)}>Share all variants</button>
      {#if shareStatus}<p class="status" role="status">{shareStatus}</p>{/if}
      {#if link}<input class="link" readonly value={link} aria-label="Link" onfocus={(e) => e.currentTarget.select()} />{/if}
    </fieldset>
  </aside>

  <footer class="footer">
    <p>
      Design assets: <a href="https://events.ccc.de/congress/2026/infos/styleguide/">40C3 styleguide</a> by the 40C3 design team.
      Fonts: <a href="https://sourcefoundry.org/hack/">Hack</a> (MIT / Bitstream Vera),
      <a href="https://fonts.google.com/specimen/Jersey+10">Jersey 10</a> (OFL).
      Unofficial, not by the CCC. <a href="https://github.com/lukas-runge/wall_papers">Source</a>
    </p>
  </footer>
</div>

<dialog bind:this={removeDialog} class="dialog" onclose={() => (removing = null)} aria-labelledby="remove-title">
  <h2 id="remove-title">Remove variant?</h2>
  {#if removing !== null && s.variants[removing]}
    <ul class="incoming">
      <li class="variant">{@render card(s.variants[removing])}</li>
    </ul>
  {/if}
  <div class="actions">
    <button type="button" class="loud" onclick={confirmRemove}>Remove</button>
    <button type="button" class="quiet" onclick={() => removeDialog.close()}>Cancel</button>
  </div>
</dialog>

<dialog bind:this={importDialog} class="dialog" onclose={() => (incoming = [])} aria-labelledby="import-title">
  <h2 id="import-title">{incoming.length === 1 ? "Shared variant" : `${incoming.length} shared variants`}</h2>
  <ul class="incoming">
    {#each incoming as x, i (i)}
      <li class="variant" class:known={known[i] >= 0} title={known[i] >= 0 ? "Already in your variants" : undefined}>{@render card(x)}</li>
    {/each}
  </ul>
  <div class="actions">
    <button type="button" class="loud" onclick={() => takeShared("add")}>
      {incoming.length === 1 ? "Add as new variant" : newCount === 1 ? "Add 1 new variant" : `Add ${newCount} new variants`}
    </button>
    <button type="button" class="quiet" onclick={() => takeShared("replace")}>{incoming.length === 1 ? "Replace current variant" : "Replace all variants"}</button>
    <button type="button" class="quiet" onclick={() => importDialog.close()}>Cancel</button>
  </div>
</dialog>


<style>
  /* Logo and variants share the top row; on narrow screens they stack. */
  .masthead {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gap);
    padding: var(--gap) var(--gap) 0;
  }
  @media (max-width: 900px) {
    .masthead {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space);
    }
    /* the space below the letters (descenders) already counts as gap */
    .masthead .wordmark {
      margin-bottom: -0.17em;
    }
  }
  .wordmark {
    margin: 0;
    display: grid;
    width: max-content;
    font: 700 clamp(20px, 2.2vw, 30px) / 1.05 "Hack", monospace;
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
    grid-template-columns: auto minmax(280px, 330px);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "stage panel"
      "footer panel";
    justify-content: start;
    /* --space between all parts; page margins outside */
    gap: var(--space);
    padding: var(--space) var(--gap) var(--gap);
    align-items: start;
  }
  .stage {
    grid-area: stage;
  }
  .panel {
    grid-area: panel;
  }
  .footer {
    grid-area: footer;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: none;
      grid-template-areas: "stage" "panel" "footer";
    }
    .frame {
      width: 100% !important;
    }
  }

  .stage {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  /* Preview as large as possible while preview and variants fit the window. */
  .frame {
    border: 1.5px solid var(--accent);
    padding: 6px;
    width: min(calc(100vw - 330px - 2 * var(--gap) - var(--space)), calc((100svh - var(--bar) - 2 * var(--gap) - var(--space) - 15px) * var(--aspect) + 15px));
  }
  .canvas {
    position: relative;
    container-type: inline-size;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
  }

  .hotspot,
  .text-hotspot {
    position: absolute;
    padding: 0;
    border: 2px solid transparent;
    background: transparent;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .hotspot {
    cursor: pointer;
  }
  .text-hotspot {
    cursor: text;
  }
  .hotspot:hover,
  .hotspot:focus-visible,
  .hotspot.open,
  .text-hotspot:hover,
  .text-hotspot:focus-visible {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    outline: none;
  }

  /* Intro: every clickable part flashes twice, as a wave from left to right. */
  .intro .hotspot,
  .intro .text-hotspot {
    animation: hint 0.9s ease-in-out calc(var(--hint) * 70ms) 2;
  }
  @keyframes hint {
    0%,
    100% {
      border-color: transparent;
      background: transparent;
    }
    40%,
    60% {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 18%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .intro .hotspot,
    .intro .text-hotspot {
      animation: none;
      border-color: var(--accent);
    }
  }

  .line-input {
    position: absolute;
    box-sizing: content-box;
    padding: 0;
    margin: 0;
    border: 0;
    border-bottom: 2px dashed var(--accent);
    border-radius: 0;
    background: transparent;
    font-family: "Hack", monospace;
    font-weight: 700;
    line-height: calc(var(--line) * 1em);
    height: calc(var(--line) * 1em);
    text-transform: uppercase;
    caret-color: var(--accent);
    outline: none;
  }

  .popover {
    position: absolute;
    z-index: 2;
    width: min(360px, 60%);
    display: grid;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.55);
    background: var(--ground);
  }
  .popover .reset {
    border-top: 0;
  }

  /* Variant cards are exactly as tall as the two-line logo next to them. */
  .variants {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    min-width: 0;
    mask-image: linear-gradient(to right, transparent, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent);
  }
  /* Touch screens swipe; their scrollbar would lie over the cards. */
  @media (pointer: coarse) {
    .variants {
      scrollbar-width: none;
    }
    .variants::-webkit-scrollbar {
      display: none;
    }
  }
  .variant {
    position: relative;
    flex: none;
    height: var(--bar);
    border: 1.5px solid var(--line);
  }
  .variant.on {
    border-color: var(--accent);
  }
  .pick,
  .incoming .variant {
    display: flex;
    gap: 8px;
    height: 100%;
    padding: 0 8px 0 0;
    border: 0;
    background: none;
    color: var(--muted);
    text-align: left;
  }
  .variant.on .pick,
  .incoming .variant {
    color: var(--white);
  }
  .variant img,
  .placeholder {
    display: block;
    height: 100%;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    background: color-mix(in srgb, var(--white) 6%, var(--ground));
  }
  /* Lines trimmed to their letters (cap height to baseline), so the text sits
     visually centred in the card. */
  .text {
    display: grid;
    align-content: center;
    gap: 5px;
    max-width: 150px;
    font: 400 0.7rem/1.25 "Hack", monospace;
  }
  .text > span {
    text-box: trim-both cap alphabetic;
  }
  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.65rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remove {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 1.3rem;
    height: 1.3rem;
    padding: 0;
    font: 700 0.9rem/1 "Hack", monospace;
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
  /* No hover on touch screens: the remove button is always there, next to the text. */
  @media (hover: none) {
    .variants .variant {
      display: flex;
      align-items: center;
    }
    .remove {
      position: static;
      flex: none;
      margin-right: 6px;
      opacity: 1;
    }
  }
  .add {
    flex: none;
    display: grid;
    height: var(--bar);
  }
  .add button {
    height: 100%;
    padding-inline: 1.2em;
    font-size: 1.05rem;
  }

  /* The legend sits on the fieldset's top border: pull the panel up by half
     a legend so the first border lines up with the preview frame. */
  .panel {
    display: grid;
    gap: calc(var(--space) - 0.75rem); /* plus the half legend above each border */
    margin-top: -0.75rem;
  }
  fieldset {
    margin: 0;
    border: 1.5px solid var(--line);
    padding: 0.2rem 0.9rem 0.9rem;
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  legend {
    font-size: 1.5rem;
    line-height: 1;
    padding: 0 0.3em;
  }
  label {
    display: grid;
    gap: 0.25rem;
    color: var(--muted);
  }
  input[type="number"] {
    color: var(--white);
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
  .link {
    font-size: 0.75rem;
    color: var(--white);
  }

  .dialog {
    max-width: min(560px, calc(100vw - 32px));
    padding: 0.4rem 1.2rem 1.2rem;
    border: 1.5px solid var(--accent);
    background: var(--ground);
    color: var(--white);
  }
  .dialog::backdrop {
    background: rgb(0 0 0 / 0.65);
  }
  .dialog h2 {
    margin: 0.4rem 0 0.8rem;
    font-size: 1.8rem;
    line-height: 1;
  }
  .incoming {
    display: grid;
    gap: 8px;
    max-height: 50svh;
    overflow-y: auto;
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
  }
  .incoming .variant {
    border-color: var(--accent);
    padding: 3px 10px 3px 3px;
    height: 64px;
  }
  .incoming .known {
    opacity: 0.45;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .footer {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .footer p {
    margin: 0;
  }
</style>
