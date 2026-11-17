<script lang="ts">
  import { onMount } from "svelte";
  import { zipSync } from "fflate";
  import { CI_MODES, paletteFor, type Palette } from "#lib/colors";
  import { DEFAULT_SLOTS, SLOTS, SLOT_LABELS, creatureCatalogue, type SlotId, type Slots } from "#lib/banner";
  import { ASSETS } from "#lib/assets";
  import { PLACEMENTS, slug, wordmarkHints, type Placement } from "#lib/layout";
  import { canvasToBlob, renderWallpaper } from "#lib/render";
  import { SIZES, fileName, readState, writeState, type AppState } from "#lib/state";

  const PRESETS: [string, string][] = [
    ["MODEL_", "CITIZENS"],
    ["SELF_", "HOSTED"],
    ["ESC_", "REALITY"],
    ["::1_", "FIRST"],
    ["MOSTLY_", "HARMLESS"],
    ["ZERO_", "TRUST"],
  ];
  const catalogue = creatureCatalogue(ASSETS);
  const groups = ["Banner", "Citizens", "Icons", "Other"] as const;

  let s = $state<AppState>(readState(location.hash));

  interface Mode { id: string; name: string; index: string; palette: Palette }
  const modes = $derived<Mode[]>([
    ...CI_MODES.map((m) => ({ id: m.id, name: m.name, index: String(m.index), palette: m })),
    { id: "custom", name: "Own", index: "X", palette: paletteFor(s.custom) },
  ]);
  const active = $derived(modes.find((m) => m.id === s.active) ?? modes[0]);
  const lines = $derived<[string, string]>([s.line1, s.line2]);
  const hints = $derived(wordmarkHints(lines));
  const size = $derived(s.size === "custom" ? { w: s.w, h: s.h } : SIZES[s.size]);
  const batch = $derived(modes.filter((m) => s.selected.includes(m.id)));

  let preview: HTMLCanvasElement;
  let thumbs = $state<{ id: string; url: string }[]>([]);
  let status = $state("");
  let busy = $state(false);

  // Theme of the page follows the colour in the preview.
  $effect(() => {
    const root = document.documentElement.style;
    root.setProperty("--ground", active.palette.ground);
    root.setProperty("--accent", active.palette.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", active.palette.ground);
  });

  // Keep the state in the URL so a variant can be shared as a link.
  $effect(() => {
    const hash = writeState(s);
    if (location.hash.slice(1) !== hash) history.replaceState(null, "", `#${hash}`);
  });

  // Re-render preview and thumbnails shortly after the last change.
  let generation = 0;
  $effect(() => {
    const job = {
      lines: [...lines] as [string, string],
      slots: { ...s.slots },
      placement: s.placement,
      w: size.w,
      h: size.h,
      active: active,
      batch: [...batch],
    };
    const g = ++generation;
    const timer = setTimeout(() => void draw(job, g), 120);
    return () => clearTimeout(timer);
  });

  async function draw(job: { lines: [string, string]; slots: Slots; placement: Placement; w: number; h: number; active: Mode; batch: Mode[] }, g: number) {
    const pw = Math.min(1920, job.w), ph = Math.round((pw * job.h) / job.w);
    try {
      await renderWallpaper({ width: pw, height: ph, palette: job.active.palette, lines: job.lines, slots: job.slots, placement: job.placement }, preview);
      const tw = 480, th = Math.round((tw * job.h) / job.w);
      const next: { id: string; url: string }[] = [];
      for (const m of job.batch) {
        if (g !== generation) return;
        const c = await renderWallpaper({ width: tw, height: th, palette: m.palette, lines: job.lines, slots: job.slots, placement: job.placement });
        next.push({ id: m.id, url: URL.createObjectURL(await canvasToBlob(c)) });
      }
      if (g !== generation) return next.forEach((t) => URL.revokeObjectURL(t.url));
      thumbs.forEach((t) => URL.revokeObjectURL(t.url));
      thumbs = next;
      if (!busy) status = "";
    } catch (e) {
      status = `Preview failed: ${(e as Error).message}`;
    }
  }

  function save(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function renderFull(m: Mode): Promise<Blob> {
    const c = await renderWallpaper({ width: size.w, height: size.h, palette: m.palette, lines, slots: s.slots, placement: s.placement });
    try {
      return await canvasToBlob(c);
    } finally {
      c.width = c.height = 0;
    }
  }

  async function downloadOne() {
    busy = true;
    status = `Rendering ${size.w} × ${size.h} …`;
    try {
      save(await renderFull(active), fileName(lines, active, "png"));
      status = "Done.";
    } catch (e) {
      status = `${(e as Error).message}. Try a smaller size or another browser.`;
    } finally {
      busy = false;
    }
  }

  async function downloadZip() {
    busy = true;
    try {
      const files: Record<string, Uint8Array> = {};
      for (const [i, m] of batch.entries()) {
        status = `Rendering ${m.name} (${i + 1}/${batch.length}) …`;
        files[fileName(lines, m, "png")] = new Uint8Array(await (await renderFull(m)).arrayBuffer());
      }
      status = "Packing …";
      const zip = zipSync(files, { level: 0 });
      save(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `40C3_${slug(lines)}.zip`);
      status = `Done: ${batch.length} wallpapers.`;
    } catch (e) {
      status = `${(e as Error).message}. Try a smaller size or another browser.`;
    } finally {
      busy = false;
    }
  }

  function toggleSelected(id: string) {
    s.selected = s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id];
  }

  const upper = (v: string) => v.toUpperCase();

  onMount(() => {
    const onHash = () => (s = readState(location.hash));
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  });
</script>

<header class="masthead">
  <h1 class="wordmark" aria-label="WALL_PAPERS">
    <span>WALL<span class="cursor">_</span></span><span>PAPERS</span>
  </h1>
  <p class="tagline">Wallpapers for <strong>40C3 · MODEL_ CITIZENS</strong>, made right here in your browser.</p>
</header>

<main class="layout">
  <section class="preview" aria-label="Preview">
    <div class="frame"><canvas bind:this={preview} aria-label="Wallpaper preview"></canvas></div>
    <p class="status" role="status">{status}</p>
    {#if thumbs.length}
      <h2>Selected colours</h2>
      <div class="thumbs">
        {#each thumbs as t (t.id)}
          {@const m = modes.find((x) => x.id === t.id)}
          <button type="button" class="thumb" class:on={t.id === s.active} onclick={() => (s.active = t.id)} aria-label="Preview {m?.name}">
            <img src={t.url} alt="" />
            <span>{m?.index}. {m?.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <form class="controls" onsubmit={(e) => e.preventDefault()} autocomplete="off">
    <fieldset>
      <legend>Slogan</legend>
      <label>Line 1 <input value={s.line1} oninput={(e) => (s.line1 = upper(e.currentTarget.value))} maxlength="14" spellcheck="false" /></label>
      <label>Line 2 <input value={s.line2} oninput={(e) => (s.line2 = upper(e.currentTarget.value))} maxlength="14" spellcheck="false" /></label>
      <div class="chips">
        {#each PRESETS as [a, b] (a + b)}
          <button type="button" class="chip" class:on={a === s.line1 && b === s.line2} onclick={() => ((s.line1 = a), (s.line2 = b))}>{a} {b}</button>
        {/each}
      </div>
      {#if hints.length}
        <ul class="hints">{#each hints as h (h)}<li>{h}</li>{/each}</ul>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Placement</legend>
      <label class="switch">
        <input type="checkbox" role="switch" checked={s.placement === "lockscreen"} onchange={(e) => (s.placement = e.currentTarget.checked ? "lockscreen" : "centered")} />
        <span class="track" aria-hidden="true"></span>
        <span>{PLACEMENTS.lockscreen.label}</span>
      </label>
      <p class="note">
        {s.placement === "lockscreen"
          ? "Banner sits between clock and login, like the original wallpaper."
          : "Banner and pattern are centred: neutral, for any screen."}
      </p>
    </fieldset>

    <fieldset>
      <legend>Colours</legend>
      <p class="note">Click to preview, tick to include in the ZIP.</p>
      <div class="swatches">
        {#each modes as m (m.id)}
          <div class="swatch" class:on={m.id === s.active} style="--c: {m.palette.accent}; --g: {m.palette.ground}">
            <button type="button" onclick={() => (s.active = m.id)} aria-label="Preview {m.name}">
              <span class="dot"></span><span>{m.index}. {m.name}</span>
            </button>
            <input type="checkbox" checked={s.selected.includes(m.id)} onchange={() => toggleSelected(m.id)} aria-label="Include {m.name}" />
          </div>
        {/each}
      </div>
      <label class="custom">Own colour
        <input type="color" value={s.custom} oninput={(e) => ((s.custom = e.currentTarget.value), (s.active = "custom"))} />
      </label>
      <p class="note">The background is derived from it the same way as for the CI colours.</p>
    </fieldset>

    <fieldset>
      <legend>Boxes</legend>
      <div class="slots">
        {#each SLOTS as slot (slot)}
          <label>{SLOT_LABELS[slot]}
            <select value={s.slots[slot]} onchange={(e) => (s.slots = { ...s.slots, [slot as SlotId]: e.currentTarget.value })}>
              {#each groups as g (g)}
                <optgroup label={g === "Banner" ? "From the banner" : g}>
                  {#each catalogue.filter((c) => c.group === g) as c (c.id)}
                    <option value={c.id}>{c.label}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </label>
        {/each}
      </div>
      <button type="button" class="quiet small" onclick={() => (s.slots = { ...DEFAULT_SLOTS })}>Back to the original citizens</button>
    </fieldset>

    <fieldset>
      <legend>Size</legend>
      <select value={s.size} onchange={(e) => (s.size = e.currentTarget.value as AppState["size"])}>
        {#each Object.entries(SIZES) as [id, z] (id)}
          <option value={id}>{z.label} · {z.w} × {z.h}</option>
        {/each}
        <option value="custom">Custom size</option>
      </select>
      {#if s.size === "custom"}
        <div class="custom-size">
          <label>Width <input type="number" min="320" max="16384" bind:value={s.w} /></label>
          <label>Height <input type="number" min="240" max="16384" bind:value={s.h} /></label>
        </div>
      {/if}
    </fieldset>

    <div class="actions">
      <button type="button" class="loud" disabled={busy} onclick={downloadOne}>Download PNG</button>
      <button type="button" class="quiet" disabled={busy || batch.length === 0} onclick={downloadZip}>
        {batch.length} colours as ZIP
      </button>
    </div>
  </form>
</main>

<footer class="footer">
  <p>
    Design assets: <a href="https://events.ccc.de/">40C3 styleguide</a> by the 40C3 design team.
    Fonts: <a href="https://sourcefoundry.org/hack/">Hack</a> (MIT / Bitstream Vera),
    <a href="https://fonts.google.com/specimen/Jersey+10">Jersey 10</a> (OFL).
    Unofficial fan tool, not by the CCC. <a href="https://github.com/lukas-runge/wall_papers">Source on GitHub</a>
  </p>
</footer>

<style>
  .masthead {
    padding: var(--gap) var(--gap) 0;
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem 2rem;
  }
  .wordmark {
    margin: 0;
    display: grid;
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
  .tagline {
    margin: 0 0 0.3em;
    color: var(--muted);
  }
  .tagline strong {
    color: var(--white);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
    gap: var(--gap);
    padding: var(--gap);
    align-items: start;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
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
  .status {
    min-height: 1.5em;
    color: var(--muted);
    margin: 0.5em 0;
  }
  .preview h2 {
    font-size: 1.6rem;
    margin: 0.8em 0 0.4em;
  }
  .thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }
  .thumb {
    padding: 4px;
    border: 1.5px solid var(--line);
    background: none;
    color: var(--muted);
    font: 400 0.85rem "Hack", monospace;
    text-align: left;
    display: grid;
    gap: 4px;
  }
  .thumb.on {
    border-color: var(--accent);
    color: var(--white);
  }
  .thumb img {
    width: 100%;
    display: block;
  }

  .controls {
    display: grid;
    gap: 1.1rem;
  }
  fieldset {
    margin: 0;
    border: 1.5px solid var(--line);
    padding: 0.4rem 1rem 1rem;
    display: grid;
    gap: 0.6rem;
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
  input:not([type="checkbox"], [type="color"]) {
    color: var(--white);
  }
  fieldset > label > input:not([type="checkbox"]) {
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.05em;
  }
  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font: 700 0.8rem "Hack", monospace;
    padding: 0.35em 0.6em;
    background: none;
    color: var(--muted);
    border-color: var(--line);
  }
  .chip.on {
    color: var(--ground);
    background: var(--accent);
    border-color: var(--accent);
  }
  .hints {
    margin: 0;
    padding-left: 1.2em;
    color: var(--accent);
    font-size: 0.85rem;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--white);
    cursor: pointer;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    flex: none;
    width: 2.6rem;
    height: 1.4rem;
    border: 1.5px solid var(--accent);
    position: relative;
  }
  .track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(1.4rem - 9px);
    height: calc(1.4rem - 9px);
    background: var(--line);
    transition: transform 0.15s;
  }
  .switch input:checked + .track::after {
    transform: translateX(1.2rem);
    background: var(--accent);
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .swatches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1.5px solid var(--line);
    padding-right: 6px;
  }
  .swatch.on {
    border-color: var(--c);
  }
  .swatch button {
    flex: 1;
    border: 0;
    background: none;
    color: var(--white);
    font: 400 0.85rem "Hack", monospace;
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.45em 0.5em;
    text-align: left;
  }
  .dot {
    flex: none;
    width: 1.1em;
    height: 1.1em;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 3px var(--g);
  }
  .swatch input {
    accent-color: var(--c);
  }
  .custom {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  input[type="color"] {
    width: 3rem;
    height: 2rem;
    border: 1.5px solid var(--line);
    background: none;
    padding: 2px;
  }

  .slots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    grid-auto-flow: column;
    grid-template-rows: repeat(3, auto);
  }
  .custom-size {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  .actions {
    display: grid;
    gap: 0.6rem;
  }

  .footer {
    padding: 0 var(--gap) var(--gap);
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
