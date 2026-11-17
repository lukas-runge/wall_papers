<script lang="ts" module>
  import type { SlotId } from "#lib/banner";
  export const SLOT_NAMES: Record<SlotId, string> = {
    L1: "top left",
    L2: "middle left",
    L3: "bottom left",
    R1: "top right",
    R2: "middle right",
    R3: "bottom right",
  };
</script>

<script lang="ts">
  import { boxSvg, creatureCatalogue } from "#lib/banner";
  import { ASSETS } from "#lib/assets";
  import type { Palette } from "#lib/colors";

  let { slot, value, palette, onpick }: { slot: SlotId; value: string; palette: Palette; onpick: (id: string) => void } = $props();

  const catalogue = creatureCatalogue(ASSETS);
  const GROUPS = [
    { id: "Banner", label: "Banner" },
    { id: "Citizens", label: "Citizens" },
    { id: "Icons", label: "Icons" },
    { id: "Other", label: "" },
  ] as const;
</script>

<div class="gallery" role="listbox" aria-label="Contents for the box {SLOT_NAMES[slot]}">
  {#each GROUPS as g (g.id)}
    {#if g.label}<h3>{g.label}</h3>{/if}
    <div class="grid">
      {#each catalogue.filter((c) => c.group === g.id) as c (c.id)}
        <button type="button" role="option" aria-selected={value === c.id} class:selected={value === c.id} title={c.label} aria-label={c.label} onclick={() => onpick(c.id)}>
          {@html boxSvg(slot, c.id, palette, ASSETS)}
          <span>{c.label}</span>
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
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
  button {
    display: grid;
    gap: 2px;
    padding: 2px;
    border: 1.5px solid transparent;
    background: none;
    color: var(--muted);
    font: 400 0.7rem/1.2 "Hack", monospace;
    text-align: center;
  }
  button:hover {
    border-color: var(--line);
    color: var(--white);
  }
  button.selected {
    border-color: var(--accent);
    color: var(--white);
  }
  .grid :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
