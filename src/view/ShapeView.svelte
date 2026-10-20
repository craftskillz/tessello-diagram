<script lang="ts">
  // A shape as the original draws it: the database has its cylinder, the post-it its folded corner, the actor its
  // silhouette, and the free text no outline. Its colors come from its palette key (base.css), in the light or dark
  // variant; the opacity is that of its fill only, so that its outline and text stay readable.
  import type { Shape } from "../lib/diagram.ts";
  import { lidOf } from "../lib/geometry.ts";
  import { layoutText, type Measure } from "../lib/text.ts";

  let { shape, label, selected, editing, measure }: { shape: Shape; label: string; selected: boolean; editing: boolean; measure: Measure } = $props();

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
  {:else}
    <rect class="dg-body" x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill-opacity={shape.opacity} />
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
  .empty .dg-frame,
  .selected .dg-frame {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  text {
    fill: var(--text);
    pointer-events: none;
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
</style>
