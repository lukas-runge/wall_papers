<script lang="ts">
  import { DEFAULT_SLOTS, SLOTS, boxSvg, creatureCatalogue, type SlotId, type Slots } from "#lib/banner";
  import { ASSETS } from "#lib/assets";
  import type { Palette } from "#lib/colors";

  let { slots, palette, onchange }: { slots: Slots; palette: Palette; onchange: (slots: Slots) => void } = $props();

  const catalogue = creatureCatalogue(ASSETS);
  const GROUPS = [
    { id: "Banner", label: "Banner" },
    { id: "Citizens", label: "Citizens" },
    { id: "Icons", label: "Icons" },
    { id: "Other", label: "" },
  ] as const;
  const NAMES: Record<SlotId, string> = { L1: "top left", L2: "middle left", L3: "bottom left", R1: "top right", R2: "middle right", R3: "bottom right" };

  let open = $state<SlotId | null>(null);
  let root: HTMLElement;

  const pick = (slot: SlotId, id: string) => {
    onchange({ ...slots, [slot]: id });
    open = null;
  };
  const isDefault = $derived(SLOTS.every((s) => slots[s] === DEFAULT_SLOTS[s]));
  const label = (id: string) => catalogue.find((c) => c.id === id)?.label ?? id;

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = null;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === "Escape" && (open = null)} />

<div class="picker" bind:this={root}>
  <div class="banner">
    {#each ["L", "R"] as side (side)}
      <div class="column">
        {#each SLOTS.filter((s) => s.startsWith(side)) as slot (slot)}
          <button
            type="button"
            class="box"
            class:open={open === slot}
            aria-label="Box {NAMES[slot]}: {label(slots[slot])}"
            aria-expanded={open === slot}
            title={label(slots[slot])}
            onclick={() => (open = open === slot ? null : slot)}
          >
            {@html boxSvg(slot, slots[slot], palette, ASSETS)}
          </button>
        {/each}
      </div>
      {#if side === "L"}<div class="middle" aria-hidden="true"><span></span><span></span><span></span></div>{/if}
    {/each}
  </div>

  {#if open}
    {@const slot = open}
    <div class="gallery" role="listbox" aria-label="Contents for the box {NAMES[slot]}">
      {#each GROUPS as g (g.id)}
        {@const items = catalogue.filter((c) => c.group === g.id)}
        {#if g.label}<h3>{g.label}</h3>{/if}
        <div class="grid">
          {#each items as c (c.id)}
            <button type="button" role="option" aria-selected={slots[slot] === c.id} class:selected={slots[slot] === c.id} title={c.label} aria-label={c.label} onclick={() => pick(slot, c.id)}>
              {@html boxSvg(slot, c.id, palette, ASSETS)}
              <span>{c.label}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <button type="button" class="quiet small" disabled={isDefault} onclick={() => onchange({ ...DEFAULT_SLOTS })}>Reset boxes</button>
</div>

<style>
  .picker {
    display: grid;
    gap: 0.75rem;
    position: relative;
  }
  .banner {
    display: grid;
    grid-template-columns: 1fr 1.6fr 1fr;
    gap: 0.6rem;
    align-items: stretch;
  }
  .column {
    display: grid;
    gap: 0.4rem;
  }
  .box {
    padding: 0;
    border: 1.5px solid transparent;
    background: none;
    line-height: 0;
    transition: border-color 0.15s;
  }
  .box:hover,
  .box.open {
    border-color: var(--accent);
  }
  .box :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .middle {
    display: grid;
    align-content: center;
    gap: 6px;
    padding: 0 10%;
    opacity: 0.35;
  }
  .middle span {
    height: 6px;
    background: var(--white);
  }
  .middle span:nth-child(2) {
    width: 70%;
  }
  .middle span:nth-child(3) {
    width: 85%;
  }

  .gallery {
    border: 1.5px solid var(--accent);
    background: var(--ground);
    padding: 0.4rem 0.6rem 0.7rem;
    max-height: 420px;
    overflow: auto;
  }
  h3 {
    margin: 0.5rem 0 0.3rem;
    font: 400 1.15rem "Jersey 10", "Hack", monospace;
    color: var(--accent);
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 6px;
  }
  .grid button {
    display: grid;
    gap: 2px;
    padding: 2px;
    border: 1.5px solid transparent;
    background: none;
    color: var(--muted);
    font: 400 0.7rem/1.2 "Hack", monospace;
    text-align: center;
  }
  .grid button:hover {
    border-color: var(--line);
    color: var(--white);
  }
  .grid button.selected {
    border-color: var(--accent);
    color: var(--white);
  }
  .grid :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .grid span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
