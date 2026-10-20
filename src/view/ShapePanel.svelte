<script lang="ts">
  // The style of the selected shapes: color, opacity of the fill, text size and alignments, rotation of the shape and
  // of its text, and order. A control applies to every selected shape, and a change is saved when it is made. The panel
  // is docked beside the canvas, so that it never hides the drawing.
  import { clampFontSize, COLORS, FONT_SIZES, reorder, type Shape } from "../lib/diagram.ts";
  import { degrees } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { diagrams, save } from "../lib/store.svelte.ts";

  let { shapes, onEditText }: { shapes: Shape[]; onEditText: (id: string) => void } = $props();

  /** The first selected shape: the panel shows its values where the selection does not share one. */
  const first = $derived(shapes[0]);
  /** The value the selected shapes share, if they share one. */
  const shared = <K extends keyof Shape>(key: K): Shape[K] | undefined => (shapes.every((shape) => shape[key] === first[key]) ? first[key] : undefined);

  function apply(change: (shape: Shape) => void) {
    shapes.forEach(change);
    void save();
  }

  function setFontSize(value: number) {
    if (Number.isFinite(value)) apply((shape) => (shape.fontSize = clampFontSize(value)));
  }

  function order(where: "front" | "back") {
    if (!diagrams.open) return;
    reorder(
      diagrams.open,
      shapes.map((shape) => shape.id),
      where,
    );
    void save();
  }

  const ALIGNS = [
    { value: "left", label: () => t("align_left"), icon: "M4 6h16M4 12h10M4 18h13" },
    { value: "center", label: () => t("align_center"), icon: "M4 6h16M7 12h10M5 18h14" },
    { value: "right", label: () => t("align_right"), icon: "M4 6h16M10 12h10M7 18h13" },
  ] as const;
  const VALIGNS = [
    { value: "top", label: () => t("valign_top"), icon: "M4 4h16M8 9h8M8 13h8" },
    { value: "middle", label: () => t("valign_middle"), icon: "M8 8h8M4 12h16M8 16h8" },
    { value: "bottom", label: () => t("valign_bottom"), icon: "M8 11h8M8 15h8M4 20h16" },
  ] as const;
</script>

<aside class="dg-panel" aria-label={t("shape_panel")}>
  {#if !first}
    <p class="dg-hint">{t("shape_panel_empty")}</p>
  {:else}
    <div class="dg-swatches" role="group" aria-label={t("color")}>
      {#each COLORS as color (color)}
        <button
          type="button"
          class="dg-swatch {color}"
          aria-label={t(color)}
          title={t(color)}
          aria-pressed={shared("color") === color}
          onclick={() => apply((shape) => (shape.color = color))}
        ></button>
      {/each}
    </div>

    <label class="dg-field">
      <span>{t("opacity")}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round((shared("opacity") ?? first.opacity) * 100)}
        oninput={(event) => shapes.forEach((shape) => (shape.opacity = Number(event.currentTarget.value) / 100))}
        onchange={() => void save()}
      />
      <output>{Math.round((shared("opacity") ?? first.opacity) * 100)}%</output>
    </label>

    <label class="dg-field">
      <span>{t("font_size")}</span>
      <input
        type="number"
        min={FONT_SIZES.min}
        max={FONT_SIZES.max}
        value={shared("fontSize") ?? ""}
        onchange={(event) => {
          setFontSize(event.currentTarget.valueAsNumber);
          event.currentTarget.value = String(shared("fontSize") ?? "");
        }}
      />
    </label>

    <div class="dg-row">
      <div class="dg-group" role="group" aria-label={t("text_align")}>
        {#each ALIGNS as { value, label, icon } (value)}
          <button type="button" class="dg-btn dg-icon" aria-label={label()} title={label()} aria-pressed={shared("textAlign") === value} onclick={() => apply((shape) => (shape.textAlign = value))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
          </button>
        {/each}
      </div>
      <div class="dg-group" role="group" aria-label={t("text_valign")}>
        {#each VALIGNS as { value, label, icon } (value)}
          <button type="button" class="dg-btn dg-icon" aria-label={label()} title={label()} aria-pressed={shared("textValign") === value} onclick={() => apply((shape) => (shape.textValign = value))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
          </button>
        {/each}
      </div>
    </div>

    <div class="dg-row">
      <span class="dg-label">{t("rotation")}</span>
      <button type="button" class="dg-btn" aria-label={t("rotate_left")} title={t("rotate_left")} onclick={() => apply((shape) => (shape.rotation = degrees(shape.rotation - 10)))}>↺ 10°</button>
      <button type="button" class="dg-btn" aria-label={t("rotate_right")} title={t("rotate_right")} onclick={() => apply((shape) => (shape.rotation = degrees(shape.rotation + 10)))}>↻ 10°</button>
    </div>
    <div class="dg-row">
      <span class="dg-label">{t("text_rotation")}</span>
      <button type="button" class="dg-btn" aria-label={t("rotate_text_left")} title={t("rotate_text_left")} onclick={() => apply((shape) => (shape.textRotation = degrees(shape.textRotation - 10)))}>↺ 10°</button>
      <button type="button" class="dg-btn" aria-label={t("rotate_text_right")} title={t("rotate_text_right")} onclick={() => apply((shape) => (shape.textRotation = degrees(shape.textRotation + 10)))}>↻ 10°</button>
    </div>

    <div class="dg-row">
      <button type="button" class="dg-btn" onclick={() => order("front")}>{t("bring_to_front")}</button>
      <button type="button" class="dg-btn" onclick={() => order("back")}>{t("send_to_back")}</button>
    </div>

    {#if shapes.length === 1}
      <button type="button" class="dg-btn" onclick={() => onEditText(first.id)}>{t("edit_text")}</button>
    {/if}
  {/if}
</aside>

<style>
  .dg-hint {
    margin: 0;
    color: var(--muted);
  }
  .dg-swatches {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }
  .dg-swatch {
    aspect-ratio: 1;
    padding: 0;
    border: 1.5px solid var(--stroke);
    border-radius: 6px;
    background: var(--fill);
    cursor: pointer;
  }
  .dg-swatch[aria-pressed="true"] {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .dg-field {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 6px;
  }
  .dg-field input[type="range"] {
    width: 96px;
  }
  .dg-field input[type="number"] {
    width: 56px;
    padding: 3px 6px;
    font: inherit;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--ink);
  }
  .dg-field output {
    min-width: 34px;
    text-align: right;
    color: var(--muted);
  }
  .dg-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .dg-label {
    flex: 1;
  }
  .dg-group {
    display: flex;
    gap: 2px;
  }
  .dg-icon {
    display: inline-flex;
    padding: 4px;
  }
  .dg-icon svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
</style>
