<script lang="ts">
  import { CI_MODES } from "#lib/colors";

  let { value, onchange }: { value: string; onchange: (colour: string) => void } = $props();

  const isOwn = $derived(value.startsWith("#"));
  let own = $state("#00b4ff");
  $effect(() => {
    if (value.startsWith("#")) own = value;
  });
</script>

<div class="swatches" role="radiogroup" aria-label="Colour">
  {#each CI_MODES as m (m.id)}
    <button type="button" role="radio" aria-checked={value === m.id} class:on={value === m.id} style="--c: {m.accent}; --g: {m.ground}" onclick={() => onchange(m.id)}>
      <span class="dot"></span><span>{m.name}</span>
    </button>
  {/each}
  <label class="own" class:on={isOwn} style="--c: {own}">
    <input type="color" value={own} aria-label="Own colour" oninput={(e) => onchange((own = e.currentTarget.value))} onclick={() => isOwn || onchange(own)} />
    <span>Own</span>
  </label>
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  button,
  .own {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.45em 0.55em;
    border: 1.5px solid var(--line);
    background: none;
    color: var(--white);
    font: 400 0.85rem "Hack", monospace;
    cursor: pointer;
  }
  .on {
    border-color: var(--c);
    box-shadow: inset 0 0 0 1px var(--c);
  }
  .dot {
    flex: none;
    width: 1.1em;
    height: 1.1em;
    border-radius: 50%;
    background: var(--c);
  }
  .own input {
    flex: none;
    width: 1.3em;
    height: 1.3em;
    padding: 0;
    border: 0;
    border-radius: 50%;
    overflow: hidden;
    background: none;
    cursor: pointer;
  }
  .own input::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .own input::-webkit-color-swatch {
    border: 0;
    border-radius: 50%;
  }
  .own input::-moz-color-swatch {
    border: 0;
    border-radius: 50%;
  }
</style>
