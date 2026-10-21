<script lang="ts">
  // An arrow as its path draws it (lib/arrows.ts): its line, which stops at the base of its heads, its heads, and its
  // label over a background that hides the line under it. Its color is a key of the palette, drawn in its outline color,
  // or a CSS color written by an older version, drawn as it is. The line takes no pointer events: the canvas finds an
  // arrow by the distance to its path; a press on the label goes to `onLabelPointerDown`.
  import { headsOf, labelPoint, type Path, pathData } from "../lib/arrows.ts";
  import { type Arrow, COLORS } from "../lib/diagram.ts";
  import type { Point } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { LABEL_PAD, layoutLabel, type Measure } from "../lib/text.ts";

  let {
    arrow,
    path,
    label,
    selected,
    editing,
    measure,
    onLabelPointerDown,
  }: {
    arrow: Arrow;
    path: Path;
    label: string;
    selected: boolean;
    /** Whether its label is being edited, by a field that then covers it. */
    editing: boolean;
    measure: Measure;
    onLabelPointerDown?: (event: PointerEvent, center: Point) => void;
  } = $props();

  const HEAD = 10;
  const drawn = $derived(headsOf(path, arrow.heads, HEAD + arrow.width * 2));
  const palette = $derived((COLORS as readonly string[]).includes(arrow.color));
  const text = $derived({ center: labelPoint(path, arrow.labelAt, arrow.labelOffset), ...layoutLabel(arrow, measure) });
</script>

<g
  role="img"
  aria-label={label}
  class="dg-arrow {palette ? arrow.color : ''}"
  class:selected
  data-heads={arrow.heads}
  data-dashed={arrow.dashed}
  style:--arrow-color={palette ? "var(--stroke)" : arrow.color}
>
  <path
    class="dg-arrow-line"
    d={pathData(drawn.line)}
    stroke-width={arrow.width}
    stroke-dasharray={arrow.dashed ? `${arrow.width * 4} ${arrow.width * 3}` : undefined}
  />
  {#each drawn.heads as head, index (index)}
    <polygon class="dg-arrow-head" points={head.map((point) => `${point.x},${point.y}`).join(" ")} />
  {/each}
  {#if arrow.label && !editing}
    <!-- The label is drawn over a background, which hides the line under it; it is dragged by its box. -->
    <g
      role="button"
      tabindex="-1"
      aria-label={t("label_handle")}
      class="dg-arrow-label"
      transform="translate({text.center.x} {text.center.y}) rotate({arrow.labelRotation})"
      onpointerdown={(event) => onLabelPointerDown?.(event, text.center)}
    >
      <rect x={-text.w / 2 - LABEL_PAD} y={-text.h / 2 - LABEL_PAD} width={text.w + LABEL_PAD * 2} height={text.h + LABEL_PAD * 2} rx="3" />
      <text font-size={arrow.labelSize} text-anchor="middle" dominant-baseline="central">
        {#each text.lines as line, index}
          <tspan x="0" y={(index - (text.lines.length - 1) / 2) * text.lineHeight}>{line}</tspan>
        {/each}
      </text>
    </g>
  {/if}
</g>

<style>
  .dg-arrow {
    pointer-events: none;
  }
  .dg-arrow-line {
    fill: none;
    stroke: var(--arrow-color);
  }
  .dg-arrow-head {
    fill: var(--arrow-color);
  }
  /* The label is drawn over the background of the canvas, which hides the line under it, in the ink of the theme. */
  .dg-arrow-label {
    pointer-events: visiblePainted;
    cursor: move;
    outline: none;
  }
  .dg-arrow-label rect {
    fill: var(--bg);
    stroke: none;
  }
  .dg-arrow.selected .dg-arrow-label rect {
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 3 2;
  }
  .dg-arrow-label text {
    fill: var(--ink);
    pointer-events: none;
  }
  .dg-arrow.selected {
    --arrow-color: var(--accent) !important;
  }
</style>
