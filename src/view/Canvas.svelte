<script lang="ts">
  // The canvas of the open diagram, drawn in SVG from its model alone (lib/diagram.ts): what is drawn and what a click
  // finds both come from the shapes and arrows, through lib/geometry.ts. A gesture changes the model as it goes and
  // saves it when it ends.
  import { type Diagram, keepsRatio, newArrow, newId, newShape, removeShape, type Shape } from "../lib/diagram.ts";
  import { arrowEnds, arrowHead, type Box, type Corner, cornerSign, degrees, type Endpoint, isAttached, type Point, resizeBox, shapeAt } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { save, type Tool, ui } from "../lib/store.svelte.ts";
  import { canvasMeasure } from "../lib/text.ts";
  import ShapePanel from "./ShapePanel.svelte";
  import ShapeView from "./ShapeView.svelte";

  let { diagram }: { diagram: Diagram } = $props();

  const HEAD = 10;
  const CORNERS: Corner[] = ["nw", "ne", "se", "sw"];
  const measure = canvasMeasure();

  let svg = $state<SVGSVGElement>();
  /** The canvas shows the drawing moved by `pan` (in pixels of the screen) and scaled by `zoom`. */
  let pan = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let spaceHeld = false;

  type Gesture =
    | { kind: "pan"; from: Point; pan: Point }
    | { kind: "move"; id: string; from: Point; starts: { id: string; x: number; y: number }[]; moved: boolean }
    | { kind: "arrow"; from: string; to: Point }
    | { kind: "resize"; id: string; corner: Corner; from: Point; start: Box; moved: boolean }
    | { kind: "rotate"; id: string; text: boolean; moved: boolean };
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
  const selectedShapes = $derived(diagram.shapes.filter((shape) => ui.selection.includes(shape.id)));
  /** The shape that shows the handles to resize and turn it: a single selected shape. */
  const withHandles = $derived(selectedShapes.length === 1 && !editing ? selectedShapes[0] : undefined);

  // A diagram opens with its origin in the middle of the canvas, and nothing selected.
  $effect(() => {
    void diagram.id;
    ui.selection = [];
    editing = null;
    zoom = 1;
    if (svg) pan = { x: svg.clientWidth / 2, y: svg.clientHeight / 2 };
  });

  function toDrawing(event: MouseEvent): Point {
    const box = svg!.getBoundingClientRect();
    return { x: (event.clientX - box.left - pan.x) / zoom, y: (event.clientY - box.top - pan.y) / zoom };
  }

  function capture(event: PointerEvent, started: Gesture) {
    event.stopPropagation();
    gesture = started;
    svg!.setPointerCapture(event.pointerId);
  }

  function onPointerDown(event: PointerEvent) {
    if (editing) return;
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      event.preventDefault();
      return capture(event, { kind: "pan", from: { x: event.clientX, y: event.clientY }, pan: { ...pan } });
    }
    if (event.button !== 0) return;
    const at = toDrawing(event);
    const shape = shapeAt(diagram.shapes, at);
    if (ui.tool === "arrow" && shape) return capture(event, { kind: "arrow", from: shape.id, to: at });
    if (!shape) {
      if (!event.ctrlKey && !event.metaKey) ui.selection = [];
      return;
    }
    // Ctrl/Cmd+click adds a shape to the selection, or takes it out.
    if (event.ctrlKey || event.metaKey) {
      const selected = ui.selection.filter((id) => shapes.has(id));
      ui.selection = selected.includes(shape.id) ? selected.filter((id) => id !== shape.id) : [...selected, shape.id];
      return;
    }
    if (!ui.selection.includes(shape.id)) ui.selection = [shape.id];
    const starts = selectedShapes.map(({ id, x, y }) => ({ id, x, y }));
    capture(event, { kind: "move", id: shape.id, from: at, starts, moved: false });
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture) return;
    if (gesture.kind === "pan") {
      pan = { x: gesture.pan.x + event.clientX - gesture.from.x, y: gesture.pan.y + event.clientY - gesture.from.y };
      return;
    }
    const at = toDrawing(event);
    if (gesture.kind === "arrow") gesture.to = at;
    else if (gesture.kind === "move") {
      for (const start of gesture.starts) {
        const shape = shapes.get(start.id);
        if (!shape) continue;
        shape.x = start.x + at.x - gesture.from.x;
        shape.y = start.y + at.y - gesture.from.y;
      }
      gesture.moved = true;
    } else if (gesture.kind === "resize") {
      const shape = shapes.get(gesture.id);
      if (!shape) return;
      // Shift keeps the proportions; some shapes always keep them.
      const keepRatio = event.shiftKey || keepsRatio(shape.type);
      const delta = { x: at.x - gesture.from.x, y: at.y - gesture.from.y };
      const { x, y, w, h } = resizeBox(gesture.start, gesture.corner, delta, { keepRatio, fromCenter: ui.resizeFromCenter });
      Object.assign(shape, { x, y, w, h });
      gesture.moved = true;
    } else {
      const shape = shapes.get(gesture.id);
      if (!shape) return;
      // The handle is above the center: pointing straight up is no rotation. Shift turns by steps of 15°.
      let angle = (Math.atan2(at.y - shape.y, at.x - shape.x) * 180) / Math.PI + 90;
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      if (gesture.text) shape.textRotation = degrees(angle - shape.rotation);
      else shape.rotation = degrees(angle);
      gesture.moved = true;
    }
  }

  function onPointerUp(event: PointerEvent) {
    const ended = gesture;
    gesture = null;
    if (ended && "moved" in ended && ended.moved) void save();
    // A click without a drag on a shape of the selection selects it alone.
    if (ended?.kind === "move" && !ended.moved) ui.selection = [ended.id];
    if (ended?.kind === "arrow") {
      const target = shapeAt(diagram.shapes, toDrawing(event));
      if (target && target.id !== ended.from) {
        const arrow = newArrow(newId("arrow"), { shapeId: ended.from, port: null }, { shapeId: target.id, port: null }, nextZ());
        diagram.arrows.push(arrow);
        ui.selection = [arrow.id];
        void save();
      }
    }
  }

  function startResize(event: PointerEvent, shape: Shape, corner: Corner) {
    if (event.button !== 0) return;
    const { x, y, w, h, rotation } = shape;
    capture(event, { kind: "resize", id: shape.id, corner, from: toDrawing(event), start: { x, y, w, h, rotation }, moved: false });
  }

  function startRotate(event: PointerEvent, shape: Shape, text: boolean) {
    if (event.button !== 0) return;
    capture(event, { kind: "rotate", id: shape.id, text, moved: false });
  }

  function onDoubleClick(event: MouseEvent) {
    const at = toDrawing(event);
    const shape = shapeAt(diagram.shapes, at);
    if (shape) return startEditing(shape.id);
    if (ui.tool === "select" || ui.tool === "arrow") return;
    const created = newShape(newId("shape"), at, nextZ(), ui.tool);
    diagram.shapes.push(created);
    ui.selection = [created.id];
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

  const TOOL_KEYS: Record<string, Tool> = { s: "select", r: "rect", e: "ellipse", d: "database", c: "circle", a: "actor", p: "postit", t: "text", f: "arrow" };

  function onKeyDown(event: KeyboardEvent) {
    if (editing || (event.target as HTMLElement).closest("input, textarea, [role=dialog]")) return;
    const key = event.key.toLowerCase();
    if (event.key === " ") {
      // Space on a button presses it, rather than moving the canvas.
      if ((event.target as HTMLElement).closest("button")) return;
      spaceHeld = true;
      event.preventDefault();
    } else if ((event.ctrlKey || event.metaKey) && key === "a") {
      event.preventDefault();
      ui.selection = [...diagram.shapes.map((shape) => shape.id), ...diagram.arrows.map((arrow) => arrow.id)];
    } else if ((event.key === "Delete" || event.key === "Backspace") && ui.selection.length) {
      diagram.arrows = diagram.arrows.filter((arrow) => !ui.selection.includes(arrow.id));
      for (const id of ui.selection) if (shapes.has(id)) removeShape(diagram, id);
      ui.selection = [];
      void save();
    } else if (event.key === "Escape") {
      ui.tool = "select";
      ui.selection = [];
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && TOOL_KEYS[key]) ui.tool = TOOL_KEYS[key];
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.key === " ") spaceHeld = false;
  }

  function selectArrow(event: PointerEvent, id: string) {
    if (event.button !== 0 || spaceHeld || ui.tool === "arrow") return;
    event.stopPropagation();
    ui.selection = [id];
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
    const shape = shapes.get(id);
    if (!shape) return "";
    const type = t(`type_${shape.type}`);
    const text = shape.text.trim();
    return text ? t("shape_named", { type, text }) : type;
  };
  const endName = (end: Endpoint) => (isAttached(end) ? nameOf(end.shapeId) : `(${Math.round(end.x)}, ${Math.round(end.y)})`);
</script>

<!-- A gesture follows the pointer over the whole View, even past the canvas, where pointer capture may not hold. -->
<svelte:window
  onkeydown={onKeyDown}
  onkeyup={onKeyUp}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={() => (gesture = null)}
/>

<div class="dg-canvas">
  <svg
    bind:this={svg}
    role="application"
    aria-label={t("canvas")}
    class="tool-{ui.tool === 'select' || ui.tool === 'arrow' ? ui.tool : 'shape'}"
    class:panning={gesture?.kind === "pan"}
    onpointerdown={onPointerDown}
    onmousedown={(event) => event.button === 1 && event.preventDefault()}
    ondblclick={onDoubleClick}
    onwheel={onWheel}
  >
    <g transform="translate({pan.x} {pan.y}) scale({zoom})">
      {#each items as item (item.kind === "shape" ? item.shape.id : item.arrow.id)}
        {#if item.kind === "shape"}
          <ShapeView
            shape={item.shape}
            label={nameOf(item.shape.id)}
            selected={ui.selection.includes(item.shape.id)}
            editing={editing?.id === item.shape.id}
            {measure}
          />
        {:else}
          {@const arrow = item.arrow}
          {@const ends = arrowEnds(shapes, arrow)}
          {#if ends}
            {@const head = arrowHead(ends.start, ends.end, HEAD + arrow.width * 2)}
            <g
              role="img"
              aria-label={t("arrow_between", { from: endName(arrow.from), to: endName(arrow.to) })}
              class="dg-arrow"
              class:selected={ui.selection.includes(arrow.id)}
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

      {#if withHandles}
        {@const shape = withHandles}
        {@const size = 5 / zoom}
        {@const stem = 26 / zoom}
        <g class="dg-handles" transform="translate({shape.x} {shape.y}) rotate({shape.rotation})">
          <line class="dg-stem" x1="0" y1={-shape.h / 2} x2="0" y2={-shape.h / 2 - stem} stroke-width={1 / zoom} />
          {#each CORNERS as corner (corner)}
            <rect
              role="button"
              tabindex="-1"
              aria-label={t(`resize_${corner}`)}
              class="dg-handle resize-{corner}"
              x={(cornerSign(corner).x * shape.w) / 2 - size}
              y={(cornerSign(corner).y * shape.h) / 2 - size}
              width={size * 2}
              height={size * 2}
              stroke-width={1.5 / zoom}
              onpointerdown={(event) => startResize(event, shape, corner)}
            />
          {/each}
          <circle
            role="button"
            tabindex="-1"
            aria-label={t("rotate_handle")}
            class="dg-handle rotate"
            cy={-shape.h / 2 - stem}
            r={size * 1.2}
            stroke-width={1.5 / zoom}
            onpointerdown={(event) => startRotate(event, shape, false)}
          />
          <g
            role="button"
            tabindex="-1"
            aria-label={t("rotate_text_handle")}
            class="dg-handle-text"
            transform="translate({-stem} {-shape.h / 2 - stem})"
            onpointerdown={(event) => startRotate(event, shape, true)}
          >
            <circle class="dg-handle" r={size * 1.6} stroke-width={1.5 / zoom} />
            <text font-size={size * 2} text-anchor="middle" dominant-baseline="central">T</text>
          </g>
        </g>
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
      style:text-align={editedShape.textAlign}
      bind:value={editing.text}
      onkeydown={onTextKey}
      onblur={applyText}
      use:focus
    ></textarea>
  {/if}
</div>

<ShapePanel shapes={selectedShapes} onEditText={startEditing} />

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
  svg.tool-shape {
    cursor: crosshair;
  }
  svg.tool-arrow {
    cursor: cell;
  }
  svg.panning {
    cursor: grabbing;
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
  .dg-stem {
    stroke: var(--accent);
  }
  .dg-handle {
    fill: var(--bg);
    stroke: var(--accent);
    outline: none;
  }
  .resize-nw,
  .resize-se {
    cursor: nwse-resize;
  }
  .resize-ne,
  .resize-sw {
    cursor: nesw-resize;
  }
  .rotate,
  .dg-handle-text {
    cursor: grab;
    outline: none;
  }
  .dg-handle-text text {
    fill: var(--accent);
    font-weight: 700;
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
    resize: none;
    outline: none;
  }
</style>
