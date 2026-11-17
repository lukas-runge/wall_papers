<script lang="ts" generics="T extends string">
  let { options, value, label, onchange }: { options: { id: T; label: string }[]; value: T; label: string; onchange: (v: T) => void } = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as o (o.id)}
    <button type="button" role="radio" aria-checked={value === o.id} class:on={value === o.id} onclick={() => onchange(o.id)}>{o.label}</button>
  {/each}
</div>

<style>
  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    border: 1.5px solid var(--accent);
  }
  button {
    border: 0;
    border-right: 1.5px solid var(--accent);
    background: none;
    color: var(--accent);
    font: 700 0.85rem "Hack", monospace;
    padding: 0.55em 0.4em;
  }
  button:last-child {
    border-right: 0;
  }
  button.on {
    background: var(--accent);
    color: var(--ground);
  }
</style>
