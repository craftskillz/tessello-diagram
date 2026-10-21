<script lang="ts">
  // Shapes and arrows of a diagram drawn from its model alone, by the same parts as the canvas, without what the canvas
  // adds: the grid, the handles, the selection. What a PNG shows (png.ts). The arrows are laid out among all the shapes
  // of the diagram, so that they follow the same paths as on the canvas.
  import { layoutArrows } from "../lib/arrows.ts";
  import type { Arrow, Diagram, Shape } from "../lib/diagram.ts";
  import { outlineOf, pictureKeyOf, type ShapeLibrary } from "../lib/library.ts";
  import type { Measure } from "../lib/text.ts";
  import ArrowView from "./ArrowView.svelte";
  import ShapeView from "./ShapeView.svelte";

  let {
    diagram,
    shapes,
    arrows,
    libraries,
    images,
    measure,
  }: {
    diagram: Diagram;
    /** What is drawn, of the diagram. */
    shapes: readonly Shape[];
    arrows: readonly Arrow[];
    libraries: readonly ShapeLibrary[];
    /** The pictures of the images and the custom shapes drawn, by key: null for one missing. */
    images: Readonly<Record<string, string | null>>;
    measure: Measure;
  } = $props();

  const paths = $derived(layoutArrows(new Map(diagram.shapes.map((shape) => [shape.id, outlineOf(libraries, shape)])), diagram.arrows));
  const items = $derived([...shapes, ...arrows].sort((a, b) => a.z - b.z));
</script>

<svg xmlns="http://www.w3.org/2000/svg">
  <g>
    {#each items as item (item.id)}
      {#if "from" in item}
        {@const path = paths.get(item.id)}
        {#if path}
          <ArrowView arrow={item} {path} label="" selected={false} editing={false} {measure} />
        {/if}
      {:else}
        {@const key = pictureKeyOf(libraries, item)}
        <ShapeView
          shape={item}
          label=""
          selected={false}
          editing={false}
          image={key ? images[key] : undefined}
          deleted={item.type === "custom" && !key}
          {measure}
        />
      {/if}
    {/each}
  </g>
</svg>
