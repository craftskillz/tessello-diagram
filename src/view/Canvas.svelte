<script lang="ts">
  // The canvas of the open diagram, drawn in SVG from its model alone (lib/diagram.ts): what is drawn and what a click
  // finds both come from the shapes and arrows, through lib/geometry.ts. A gesture changes the model as it goes and
  // saves it when it ends.
  import { type Diagram, newArrow, newId, newShape, removeShape } from "../lib/diagram.ts";
  import { arrowEnds, arrowHead, type Endpoint, isAttached, type Point, shapeAt } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { save, type Tool, ui } from "../lib/store.svelte.ts";

  let { diagram }: { diagram: Diagram } = $props();

  const HEAD = 10;
  const LINE_HEIGHT = 1.25;

  let svg = $state<SVGSVGElement>();
  /** The canvas shows the drawing moved by `pan` (in pixels of the screen) and scaled by `zoom`. */
  let pan = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let spaceHeld = false;

  type Gesture =
    | { kind: "pan"; from: Point; pan: Point }
    | { kind: "move"; id: string; offset: Point; moved: boolean }
    | { kind: "arrow"; from: string; to: Point };
  let gesture = $state<Gesture | null>(null);

  /** The shape whose text is being edited, and the text typed so far. */
  let editing = $state<{ id: string; text: string } | null>(null);

  const shapes = $derived(new Map(diagram.shapes.map((shape) => [shape.id, shape])));
  /** Shapes and arrows in drawing order: higher `z` in front. */
  const items = $derived(
    [...diagram.shapes.map((shape) => ({ kind: "shape" as const, shape })), ...diagram.arrows.map((arrow) => ({ kind: "arrow" as const, arrow }))].sort(
      (a, b) => (a.kind === "shape" ? a.shape.z : a.arrow.z) - (b.kind === "shape" ? b.shape.z : b.arrow.z),
    ),
  );
  const nextZ = () => Math.max(-1, ...diagram.shapes.map((shape) => shape.z), ...diagram.arrows.map((arrow) => arrow.z)) + 1;

  // A diagram opens with its origin in the middle of the canvas, and nothing selected.
  $effect(() => {
    void diagram.id;
    ui.selected = null;
    editing = null;
    zoom = 1;
    if (svg) pan = { x: svg.clientWidth / 2, y: svg.clientHeight / 2 };
  });

  function toDrawing(event: MouseEvent): Point {
    const box = svg!.getBoundingClientRect();
    return { x: (event.clientX - box.left - pan.x) / zoom, y: (event.clientY - box.top - pan.y) / zoom };
  }

  function onPointerDown(event: PointerEvent) {
    if (editing) return;
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      event.preventDefault();
      gesture = { kind: "pan", from: { x: event.clientX, y: event.clientY }, pan: { ...pan } };
    } else if (event.button === 0) {
      const at = toDrawing(event);
      const shape = shapeAt(diagram.shapes, at);
      if (ui.tool === "arrow" && shape) gesture = { kind: "arrow", from: shape.id, to: at };
      else if (shape) {
        ui.selected = shape.id;
        gesture = { kind: "move", id: shape.id, offset: { x: at.x - shape.x, y: at.y - shape.y }, moved: false };
      } else ui.selected = null;
    }
    if (gesture) svg!.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture) return;
    if (gesture.kind === "pan") {
      pan = { x: gesture.pan.x + event.clientX - gesture.from.x, y: gesture.pan.y + event.clientY - gesture.from.y };
      return;
    }
    const at = toDrawing(event);
    if (gesture.kind === "arrow") gesture.to = at;
    else {
      const shape = shapes.get(gesture.id);
      if (!shape) return;
      shape.x = at.x - gesture.offset.x;
      shape.y = at.y - gesture.offset.y;
      gesture.moved = true;
    }
  }

  function onPointerUp(event: PointerEvent) {
    const ended = gesture;
    gesture = null;
    if (ended?.kind === "move" && ended.moved) void save();
    if (ended?.kind === "arrow") {
      const target = shapeAt(diagram.shapes, toDrawing(event));
      if (target && target.id !== ended.from) {
        const arrow = newArrow(newId("arrow"), { shapeId: ended.from, port: null }, { shapeId: target.id, port: null }, nextZ());
        diagram.arrows.push(arrow);
        ui.selected = arrow.id;
        void save();
      }
    }
  }

  function onDoubleClick(event: MouseEvent) {
    const at = toDrawing(event);
    const shape = shapeAt(diagram.shapes, at);
    if (shape) return startEditing(shape.id);
    if (ui.tool !== "rect") return;
    const created = newShape(newId("shape"), at, nextZ());
    diagram.shapes.push(created);
    ui.selected = created.id;
    void save();
    startEditing(created.id);
  }

  // Ctrl/Cmd + wheel zooms around the pointer; the wheel alone moves the canvas.
  function onWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const box = svg!.getBoundingClientRect();
      const pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
      const next = Math.min(4, Math.max(0.1, zoom * Math.exp(-event.deltaY * 0.01)));
      pan = { x: pointer.x - ((pointer.x - pan.x) * next) / zoom, y: pointer.y - ((pointer.y - pan.y) * next) / zoom };
      zoom = next;
    } else pan = { x: pan.x - event.deltaX, y: pan.y - event.deltaY };
  }

  const TOOL_KEYS: Record<string, Tool> = { v: "select", r: "rect", f: "arrow" };

  function onKeyDown(event: KeyboardEvent) {
    if (editing || (event.target as HTMLElement).closest("input, textarea, [role=dialog]")) return;
    if (event.key === " ") {
      spaceHeld = true;
      event.preventDefault();
    } else if ((event.key === "Delete" || event.key === "Backspace") && ui.selected) {
      if (shapes.has(ui.selected)) removeShape(diagram, ui.selected);
      else diagram.arrows = diagram.arrows.filter((arrow) => arrow.id !== ui.selected);
      ui.selected = null;
      void save();
    } else if (event.key === "Escape") ui.selected = null;
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && TOOL_KEYS[event.key.toLowerCase()]) ui.tool = TOOL_KEYS[event.key.toLowerCase()];
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.key === " ") spaceHeld = false;
  }

  function selectArrow(event: PointerEvent, id: string) {
    if (event.button !== 0 || spaceHeld || ui.tool === "arrow") return;
    event.stopPropagation();
    ui.selected = id;
  }

  // ── Text of a shape: Enter applies, Shift+Enter adds a line, Escape abandons, leaving the field applies ──
  function startEditing(id: string) {
    editing = { id, text: shapes.get(id)?.text ?? "" };
  }

  function applyText() {
    if (!editing) return;
    const shape = shapes.get(editing.id);
    const changed = shape && shape.text !== editing.text;
    if (changed) shape.text = editing.text;
    editing = null;
    if (changed) void save();
  }

  function onTextKey(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyText();
    } else if (event.key === "Escape") {
      event.preventDefault();
      editing = null;
    }
  }

  const focus = (element: HTMLTextAreaElement) => {
    element.focus();
    element.select();
  };

  const editedShape = $derived(editing ? shapes.get(editing.id) : undefined);
  const nameOf = (id: string) => {
    const text = shapes.get(id)?.text.trim();
    return text ? t("shape_named", { text }) : t("shape");
  };
  const endName = (end: Endpoint) => (isAttached(end) ? nameOf(end.shapeId) : `(${Math.round(end.x)}, ${Math.round(end.y)})`);
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div class="dg-canvas">
  <svg
    bind:this={svg}
    role="application"
    aria-label={t("canvas")}
    class="tool-{ui.tool}"
    class:panning={gesture?.kind === "pan"}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={() => (gesture = null)}
    onmousedown={(event) => event.button === 1 && event.preventDefault()}
    ondblclick={onDoubleClick}
    onwheel={onWheel}
  >
    <g transform="translate({pan.x} {pan.y}) scale({zoom})">
      {#each items as item (item.kind === "shape" ? item.shape.id : item.arrow.id)}
        {#if item.kind === "shape"}
          {@const shape = item.shape}
          {@const lines = shape.text.split("\n")}
          <g
            role="img"
            aria-label={nameOf(shape.id)}
            class="dg-shape {shape.color}"
            class:selected={ui.selected === shape.id}
            transform="translate({shape.x} {shape.y}) rotate({shape.rotation})"
          >
            <rect x={-shape.w / 2} y={-shape.h / 2} width={shape.w} height={shape.h} rx="6" fill-opacity={shape.opacity} />
            {#if editing?.id !== shape.id}
              <text font-size={shape.fontSize} text-anchor="middle" dominant-baseline="central">
                {#each lines as line, index}
                  <tspan x="0" dy={index === 0 ? (-(lines.length - 1) * LINE_HEIGHT * shape.fontSize) / 2 : LINE_HEIGHT * shape.fontSize}>{line}</tspan>
                {/each}
              </text>
            {/if}
          </g>
        {:else}
          {@const arrow = item.arrow}
          {@const ends = arrowEnds(shapes, arrow)}
          {#if ends}
            {@const head = arrowHead(ends.start, ends.end, HEAD + arrow.width * 2)}
            <g
              role="img"
              aria-label={t("arrow_between", { from: endName(arrow.from), to: endName(arrow.to) })}
              class="dg-arrow"
              class:selected={ui.selected === arrow.id}
              style:--arrow-color={arrow.color}
              onpointerdown={(event) => selectArrow(event, arrow.id)}
            >
              <line class="dg-arrow-hit" x1={ends.start.x} y1={ends.start.y} x2={ends.end.x} y2={ends.end.y} />
              <line
                class="dg-arrow-line"
                x1={ends.start.x}
                y1={ends.start.y}
                x2={head.base.x}
                y2={head.base.y}
                stroke-width={arrow.width}
                stroke-dasharray={arrow.dashed ? `${arrow.width * 4} ${arrow.width * 3}` : undefined}
              />
              <polygon class="dg-arrow-head" points={head.points.map((point) => `${point.x},${point.y}`).join(" ")} />
            </g>
          {/if}
        {/if}
      {/each}

      {#if gesture?.kind === "arrow"}
        {@const from = shapes.get(gesture.from)}
        {#if from}
          {@const ends = arrowEnds(shapes, { from: { shapeId: from.id, port: null }, to: gesture.to })}
          {#if ends}
            <line class="dg-arrow-preview" x1={ends.start.x} y1={ends.start.y} x2={ends.end.x} y2={ends.end.y} />
          {/if}
        {/if}
      {/if}
    </g>
  </svg>

  {#if editing && editedShape}
    <textarea
      class="dg-text-editor"
      aria-label={t("text_label")}
      style:left="{pan.x + (editedShape.x - editedShape.w / 2) * zoom}px"
      style:top="{pan.y + (editedShape.y - editedShape.h / 2) * zoom}px"
      style:width="{editedShape.w * zoom}px"
      style:height="{editedShape.h * zoom}px"
      style:font-size="{editedShape.fontSize * zoom}px"
      bind:value={editing.text}
      onkeydown={onTextKey}
      onblur={applyText}
      use:focus
    ></textarea>
  {/if}
</div>

<style>
  .dg-canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--bg);
    user-select: none;
    touch-action: none;
  }
  svg.tool-rect {
    cursor: crosshair;
  }
  svg.tool-arrow {
    cursor: cell;
  }
  svg.panning {
    cursor: grabbing;
  }
  .dg-shape rect {
    fill: var(--fill);
    stroke: var(--stroke);
    stroke-width: 1.5;
  }
  .dg-shape text {
    fill: var(--text);
    pointer-events: none;
  }
  .dg-shape.selected rect {
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .dg-arrow-hit {
    stroke: transparent;
    stroke-width: 14;
    stroke-linecap: round;
  }
  .dg-arrow-line {
    stroke: var(--arrow-color);
    pointer-events: none;
  }
  .dg-arrow-head {
    fill: var(--arrow-color);
    pointer-events: none;
  }
  .dg-arrow.selected {
    --arrow-color: var(--accent) !important;
  }
  .dg-arrow-preview {
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    pointer-events: none;
  }
  .dg-text-editor {
    position: absolute;
    padding: 4px;
    border: 2px solid var(--accent);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    font-family: inherit;
    text-align: center;
    resize: none;
    outline: none;
  }
</style>
