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
    <input type="color" value={own} aria-label="Custom colour" oninput={(e) => onchange((own = e.currentTarget.value))} onclick={() => isOwn || onchange(own)} />
    <span class="dot rainbow"></span><span>Custom</span>
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
  .rainbow {
    background: conic-gradient(#ff3b3b, #ffd23b, #5bff3b, #3bffe8, #3b6bff, #d03bff, #ff3b3b);
  }
  /* The colour field covers the whole button, invisible: the rainbow dot stands for it. */
  .own {
    position: relative;
  }
  .own input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .own:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
