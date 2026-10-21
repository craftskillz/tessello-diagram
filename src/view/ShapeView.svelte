<script lang="ts">
  // A shape as the original draws it: the database has its cylinder, the post-it its folded corner, the actor its
  // silhouette, and the free text no outline. Its colors come from its palette key (base.css), in the light or dark
  // variant; the opacity is that of its fill only, so that its outline and text stay readable. An image shows its
  // picture, read from the storage, or a "missing image" frame when the storage no longer has it. A custom shape shows
  // the picture of its definition, or a dashed frame with its name when its definition is deleted. A shape with a link
  // shows a chain at its bottom right corner, in the blue of the palette for a page, and its orange for a diagram.
  import type { Shape } from "../lib/diagram.ts";
  import { lidOf } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { layoutText, type Measure } from "../lib/text.ts";

  let {
    shape,
    label,
    selected,
    editing,
    image,
    deleted = false,
    linkTitle,
    measure,
  }: {
    shape: Shape;
    label: string;
    selected: boolean;
    editing: boolean;
    /** The picture of an image as a data URL, null when it is missing, undefined while it is read. */
    image?: string | null;
    /** A custom shape whose definition is deleted. */
    deleted?: boolean;
    /** What the link of the shape leads to, said by its chain. */
    linkTitle?: string;
    measure: Measure;
  } = $props();

  const w = $derived(shape.w);
  const h = $derived(shape.h);
  const text = $derived(layoutText(shape, measure));
  const lid = $derived(lidOf(h));
  const fold = $derived(Math.min(w, h) * 0.18);
  // The actor is drawn in a 30 × 52 box, scaled to the shape.
  const sx = $derived(w / 30);
  const sy = $derived(h / 52);
</script>

<g
  role="img"
  aria-label={label}
  class="dg-shape {shape.color}"
  class:selected
  class:empty={!shape.text}
  data-type={shape.type}
  transform="translate({shape.x} {shape.y}) rotate({shape.rotation})"
>
  {#if shape.type === "ellipse"}
    <ellipse class="dg-body" rx={w / 2} ry={h / 2} fill-opacity={shape.opacity} />
  {:else if shape.type === "circle"}
    <circle class="dg-body" r={Math.min(w, h) / 2} fill-opacity={shape.opacity} />
  {:else if shape.type === "database"}
    <path
      class="dg-body"
      d="M{-w / 2},{-h / 2 + lid} V{h / 2 - lid} A{w / 2},{lid} 0 0 0 {w / 2},{h / 2 - lid} V{-h / 2 + lid} Z"
      fill-opacity={shape.opacity}
    />
    <ellipse class="dg-body" cy={-h / 2 + lid} rx={w / 2} ry={lid} fill-opacity={shape.opacity} />
  {:else if shape.type === "postit"}
    <polygon
      class="dg-body"
      points="{-w / 2},{-h / 2} {w / 2 - fold},{-h / 2} {w / 2},{-h / 2 + fold} {w / 2},{h / 2} {-w / 2},{h / 2}"
      fill-opacity={shape.opacity}
    />
    <polygon class="dg-fold" points="{w / 2 - fold},{-h / 2} {w / 2},{-h / 2 + fold} {w / 2 - fold},{-h / 2 + fold}" />
  {:else if shape.type === "actor"}
    <rect class="dg-hit" x={-w / 2} y={-h / 2} width={w} height={h} />
    <circle class="dg-body" cy={-18 * sy} r={8 * sy} fill-opacity={shape.opacity} />
    <path
      class="dg-limbs"
      d="M0,{-10 * sy} V{10 * sy} M{-13 * sx},{2 * sy} H{13 * sx} M0,{10 * sy} L{-10 * sx},{26 * sy} M0,{10 * sy} L{10 * sx},{26 * sy}"
    />
  {:else if shape.type === "text"}
    <rect class="dg-frame" x={-w / 2} y={-h / 2} width={w} height={h} rx="3" />
  {:else if shape.type === "image"}
    {#if image}
      <image href={image} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" opacity={shape.opacity} />
    {:else if image === null}
      <text class="dg-missing" font-size="12" text-anchor="middle" dominant-baseline="central">{t("missing_image")}</text>
    {/if}
    <rect class="dg-frame" class:missing={image === null} x={-w / 2} y={-h / 2} width={w} height={h} />
  {:else if shape.type === "custom"}
    <!-- Its name, unless its text already says it. -->
    {#if deleted && shape.customShapeRef?.name !== shape.text.trim()}
      <text class="dg-missing" font-size="12" text-anchor="middle" dominant-baseline="central">{shape.customShapeRef?.name}</text>
    {:else if image}
      <image href={image} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" opacity={shape.opacity} />
    {/if}
    <rect class="dg-frame" class:missing={deleted} x={-w / 2} y={-h / 2} width={w} height={h} />
  {:else}
    <rect class="dg-body" x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill-opacity={shape.opacity} />
  {/if}
  {#if shape.link}
    <g class="dg-link {shape.link.type === 'url' ? 'c-blue' : 'c-orange'}" data-link={shape.link.type} transform="translate({w / 2 - 2} {h / 2 - 2})">
      <title>{linkTitle}</title>
      <circle r="8" />
      <path d="M-3.5 1.5l-1 1a2.1 2.1 0 0 0 3 3l1.5-1.5M3.5-1.5l1-1a2.1 2.1 0 0 0-3-3L0-4M-2 2l4-4" />
    </g>
  {/if}
  {#if !editing && shape.text}
    <text font-size={shape.fontSize} text-anchor={text.anchor} dominant-baseline="central" transform="rotate({shape.textRotation})">
      {#each text.lines as line, index}
        <tspan x={text.x} y={text.y + index * text.lineHeight}>{line}</tspan>
      {/each}
    </text>
  {/if}
</g>

<style>
  .dg-body {
    fill: var(--fill);
    stroke: var(--stroke);
    stroke-width: 1.5;
  }
  .dg-fold {
    fill: var(--stroke);
    fill-opacity: 0.3;
    stroke: var(--stroke);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .dg-limbs {
    fill: none;
    stroke: var(--stroke);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .dg-hit {
    fill: transparent;
  }
  .dg-frame {
    fill: transparent;
    stroke: none;
  }
  /* A free text without text would be invisible: its frame shows, as when it is selected. */
  .dg-shape[data-type="text"].empty .dg-frame,
  .dg-frame.missing,
  .selected .dg-frame {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  text {
    fill: var(--text);
    pointer-events: none;
  }
  text.dg-missing {
    fill: var(--muted);
    font-style: italic;
  }
  .selected .dg-body,
  .selected .dg-limbs,
  .selected .dg-fold {
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .selected .dg-frame {
    stroke: var(--accent);
  }
  .dg-link circle {
    fill: var(--stroke);
    stroke: var(--bg);
    stroke-width: 1.5;
  }
  .dg-link path {
    fill: none;
    stroke: var(--bg);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
</style>
