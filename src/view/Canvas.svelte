<script lang="ts">
  // The canvas of the open diagram, drawn in SVG from its model alone (lib/diagram.ts): what is drawn and what a click
  // finds both come from the shapes and arrows, through lib/geometry.ts and lib/arrows.ts. A gesture changes the model
  // as it goes and saves it when it ends.
  import { anchorOf, arrowAt, constrainAngle, endAt, endOf, headOf, isDrawable, isShiftable, layoutArrows, middlesOf, type Path, pathData, pathWithin, pointAlong, shiftSegment, snapWaypoint, startOf } from "../lib/arrows.ts";
  import { type Arrow, type Diagram, keepsRatio, newArrow, newId, newShape, removeShape, type Shape } from "../lib/diagram.ts";
  import { type Box, boxWithin, type Corner, cornerSign, degrees, type Endpoint, isAttached, type Point, portPoint, portsOf, resizeBox, shapeAt } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { save, type Tool, ui } from "../lib/store.svelte.ts";
  import { canvasMeasure } from "../lib/text.ts";
  import ArrowPanel from "./ArrowPanel.svelte";
  import ShapePanel from "./ShapePanel.svelte";
  import ShapeView from "./ShapeView.svelte";

  let { diagram }: { diagram: Diagram } = $props();

  const HEAD = 10;
  /** On screen, in pixels, whatever the zoom: the width of the click zone of an arrow on each side of its line, the reach
   * of a port, and how far the pointer goes before a press becomes a drag. */
  const HIT = 5;
  const PORT_REACH = 8;
  const DRAG = 3;
  /** How near the line of its neighbor a waypoint aligns with it, on screen. */
  const SNAP = 6;
  const CORNERS: Corner[] = ["nw", "ne", "se", "sw"];
  const measure = canvasMeasure();

  let svg = $state<SVGSVGElement>();
  /** The canvas shows the drawing moved by `pan` (in pixels of the screen) and scaled by `zoom`. */
  let pan = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let spaceHeld = false;

  /** Where a free arrow was when a move started: its ends and its waypoints. */
  type Line = { id: string; from: Point; to: Point; waypoints: Point[] };
  type Gesture =
    | { kind: "pan"; from: Point; pan: Point }
    | { kind: "move"; id: string; from: Point; starts: { id: string; x: number; y: number }[]; lines: Line[]; moved: boolean }
    | { kind: "draw"; from: Endpoint; press: Point; at: Point; moved: boolean }
    | { kind: "end"; id: string; which: "from" | "to"; moved: boolean }
    | { kind: "waypoint"; id: string; index: number; moved: boolean }
    | { kind: "segment"; id: string; index: number; path: Path; from: Point; press: Point; moved: boolean }
    | { kind: "marquee"; from: Point; to: Point; kept: string[] }
    | { kind: "resize"; id: string; corner: Corner; from: Point; start: Box; moved: boolean }
    | { kind: "rotate"; id: string; text: boolean; moved: boolean };
  let gesture = $state<Gesture | null>(null);
  /** Where the pointer is on the drawing, to show the ports it can reach. */
  let pointer = $state<Point | null>(null);

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
  const selectedArrows = $derived(diagram.arrows.filter((arrow) => ui.selection.includes(arrow.id)));
  /** The path of each arrow: the line, its click zone, its handles and its label all follow it. */
  const paths = $derived(layoutArrows(shapes, diagram.arrows));
  /**
   * The arrow that shows the handles of its ends: a single selected arrow, with the Select tool. With the Arrow tool, a
   * press on its end starts a new arrow, which then shares its port.
   */
  const withEnds = $derived(ui.tool === "select" && selectedArrows.length === 1 && ui.selection.length === 1 ? selectedArrows[0] : undefined);
  /** The reach of the pointer in units of the drawing, from a reach on screen. */
  const reach = (pixels: number) => pixels / zoom;
  /**
   * What an end would attach to at the pointer, while an arrow is drawn or an end dragged, or while the Arrow tool hovers:
   * its shape shows its ports, and the port aimed at is highlighted.
   */
  const aim = $derived(
    pointer && (gesture?.kind === "draw" || gesture?.kind === "end" || (!gesture && ui.tool === "arrow"))
      ? endAt(diagram.shapes, gesture?.kind === "draw" ? gesture.at : pointer, reach(PORT_REACH))
      : undefined,
  );
  /** Whether the Select tool hovers an arrow, which the cursor then shows. */
  const overArrow = $derived(ui.tool === "select" && !gesture && !!pointer && !!arrowAt(diagram.arrows, paths, pointer, reach(HIT)));
  const isFree = (arrow: Arrow) => !isAttached(arrow.from) && !isAttached(arrow.to);
  /** The end an arrow being drawn gets at a point: what is there, or free if it would join the start to itself. */
  function endingAt(from: Endpoint, at: Point): Endpoint {
    const { end } = endAt(diagram.shapes, at, reach(PORT_REACH));
    return isDrawable(from, end) ? end : { x: at.x, y: at.y };
  }
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
    const ctrl = event.ctrlKey || event.metaKey;
    // The Arrow tool draws from anywhere, but not from a locked shape.
    if (ui.tool === "arrow") {
      const start = endAt(diagram.shapes, at, reach(PORT_REACH));
      if (start.shape?.locked) return;
      return capture(event, { kind: "draw", from: start.end, press: { x: event.clientX, y: event.clientY }, at, moved: false });
    }
    // Near its line, an arrow wins over a shape under it.
    const item = arrowAt(diagram.arrows, paths, at, reach(HIT)) ?? shapeAt(diagram.shapes, at);
    if (!item) {
      if (!ctrl) ui.selection = [];
      // With the Select tool, a drag on the empty canvas draws a selection rectangle.
      if (ui.tool === "select") capture(event, { kind: "marquee", from: at, to: at, kept: [...ui.selection] });
      return;
    }
    // Ctrl/Cmd+click adds a shape or an arrow to the selection, or takes it out.
    if (ctrl) {
      ui.selection = ui.selection.includes(item.id) ? ui.selection.filter((id) => id !== item.id) : [...ui.selection, item.id];
      return;
    }
    if (!ui.selection.includes(item.id)) ui.selection = [item.id];
    // The selected shapes move, and the selected arrows whose two ends are free: an attached arrow does not move by its body.
    const starts = selectedShapes.map(({ id, x, y }) => ({ id, x, y }));
    const lines = selectedArrows.filter(isFree).map(({ id, from, to, waypoints }) => ({ id, from: { ...(from as Point) }, to: { ...(to as Point) }, waypoints: waypoints.map((point) => ({ ...point })) }));
    capture(event, { kind: "move", id: item.id, from: at, starts, lines, moved: false });
  }

  function onPointerMove(event: PointerEvent) {
    // Off the canvas, no port is shown, unless a gesture goes on.
    if (svg) pointer = gesture || svg.contains(event.target as Node) ? toDrawing(event) : null;
    if (!gesture) return;
    if (gesture.kind === "pan") {
      pan = { x: gesture.pan.x + event.clientX - gesture.from.x, y: gesture.pan.y + event.clientY - gesture.from.y };
      return;
    }
    const at = toDrawing(event);
    if (gesture.kind === "draw") {
      // Shift turns the arrow by steps of 45° around its start.
      gesture.at = event.shiftKey ? constrainAngle(anchorOf(shapes, gesture.from), at) : at;
      if (Math.hypot(event.clientX - gesture.press.x, event.clientY - gesture.press.y) > DRAG) gesture.moved = true;
    } else if (gesture.kind === "end") {
      const arrow = diagram.arrows.find((arrow) => arrow.id === (gesture as { id: string }).id);
      if (!arrow) return;
      // Shift turns the arrow by steps of 45° around its other end.
      const other = gesture.which === "from" ? arrow.to : arrow.from;
      arrow[gesture.which] = endingAt(other, event.shiftKey ? constrainAngle(anchorOf(shapes, other), at) : at);
      gesture.moved = true;
    } else if (gesture.kind === "waypoint") {
      const arrow = diagram.arrows.find((arrow) => arrow.id === (gesture as { id: string }).id);
      if (!arrow) return;
      moveWaypoint(arrow, gesture.index, at);
      gesture.moved = true;
    } else if (gesture.kind === "segment") {
      const arrow = diagram.arrows.find((arrow) => arrow.id === (gesture as { id: string }).id);
      // A click on the handle, without a drag, changes nothing.
      if (!arrow || (!gesture.moved && Math.hypot(event.clientX - gesture.press.x, event.clientY - gesture.press.y) <= DRAG)) return;
      const { index, path } = gesture;
      if (isShiftable(arrow.route, path, index)) {
        // A segment between two corners of an elbow route moves sideways.
        arrow.waypoints = shiftSegment(path, index, { x: at.x - gesture.from.x, y: at.y - gesture.from.y });
        gesture.moved = true;
      } else {
        // Elsewhere, the drag adds a waypoint there, and moves it. An elbow route keeps its corners as waypoints.
        const waypoints = arrow.route === "elbow" ? path.points.slice(1, -1) : [...arrow.waypoints];
        const inserted = arrow.route === "elbow" ? (index === 0 ? 0 : waypoints.length) : index;
        waypoints.splice(inserted, 0, at);
        arrow.waypoints = waypoints;
        moveWaypoint(arrow, inserted, at);
        gesture = { kind: "waypoint", id: arrow.id, index: inserted, moved: true };
      }
    } else if (gesture.kind === "marquee") gesture.to = at;
    else if (gesture.kind === "move") {
      const dx = at.x - gesture.from.x;
      const dy = at.y - gesture.from.y;
      for (const start of gesture.starts) {
        const shape = shapes.get(start.id);
        if (!shape) continue;
        shape.x = start.x + dx;
        shape.y = start.y + dy;
      }
      for (const line of gesture.lines) {
        const arrow = diagram.arrows.find((arrow) => arrow.id === line.id);
        if (!arrow) continue;
        arrow.from = { x: line.from.x + dx, y: line.from.y + dy };
        arrow.to = { x: line.to.x + dx, y: line.to.y + dy };
        arrow.waypoints = line.waypoints.map((point) => ({ x: point.x + dx, y: point.y + dy }));
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
    if (!ended) return;
    if (ended.kind !== "draw" && "moved" in ended && ended.moved) void save();
    // A click without a drag on an item of the selection selects it alone.
    if (ended.kind === "move" && !ended.moved && !event.ctrlKey && !event.metaKey) ui.selection = [ended.id];
    // A click without a drag draws nothing.
    if (ended.kind === "draw" && ended.moved) {
      const arrow = newArrow(newId("arrow"), ended.from, endingAt(ended.from, ended.at), nextZ());
      diagram.arrows.push(arrow);
      ui.selection = [arrow.id];
      void save();
    }
    // The rectangle selects the shapes and the arrows it holds entirely.
    if (ended.kind === "marquee") {
      const rectangle = { x: Math.min(ended.from.x, ended.to.x), y: Math.min(ended.from.y, ended.to.y), w: Math.abs(ended.to.x - ended.from.x), h: Math.abs(ended.to.y - ended.from.y) };
      if (rectangle.w === 0 && rectangle.h === 0) return;
      const inside = [
        ...diagram.shapes.filter((shape) => boxWithin(shape, rectangle)).map((shape) => shape.id),
        ...diagram.arrows.filter((arrow) => paths.has(arrow.id) && pathWithin(paths.get(arrow.id)!, rectangle)).map((arrow) => arrow.id),
      ];
      ui.selection = [...new Set([...ended.kept, ...inside])];
    }
  }

  function startEnd(event: PointerEvent, arrow: Arrow, which: "from" | "to") {
    if (event.button !== 0) return;
    capture(event, { kind: "end", id: arrow.id, which, moved: false });
  }

  /** Moves a waypoint to a point, aligned with the one before it and the one after it, or with the end there. */
  function moveWaypoint(arrow: Arrow, index: number, at: Point) {
    const before = index === 0 ? anchorOf(shapes, arrow.from) : arrow.waypoints[index - 1];
    const after = index === arrow.waypoints.length - 1 ? anchorOf(shapes, arrow.to) : arrow.waypoints[index + 1];
    arrow.waypoints[index] = snapWaypoint(at, [before, after], reach(SNAP));
  }

  function startWaypoint(event: PointerEvent, arrow: Arrow, index: number) {
    if (event.button !== 0) return;
    capture(event, { kind: "waypoint", id: arrow.id, index, moved: false });
  }

  function startSegment(event: PointerEvent, arrow: Arrow, path: Path, index: number) {
    if (event.button !== 0) return;
    capture(event, { kind: "segment", id: arrow.id, index, path, from: toDrawing(event), press: { x: event.clientX, y: event.clientY }, moved: false });
  }

  function removeWaypoint(event: MouseEvent, arrow: Arrow, index: number) {
    event.stopPropagation();
    arrow.waypoints = arrow.waypoints.filter((_, position) => position !== index);
    void save();
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
    // The label of an arrow is edited by ticket 05: a double-click on an arrow does nothing yet.
    if (arrowAt(diagram.arrows, paths, at, reach(HIT))) return;
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
      // Deleting a shape frees the ends of its arrows; Ctrl/Cmd+Delete deletes its arrows too.
      const withArrows = event.ctrlKey || event.metaKey;
      diagram.arrows = diagram.arrows.filter((arrow) => !ui.selection.includes(arrow.id));
      for (const id of ui.selection) if (shapes.has(id)) removeShape(diagram, id, { withArrows });
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
  const endName = (end: Endpoint) => {
    if (!isAttached(end)) return `(${Math.round(end.x)}, ${Math.round(end.y)})`;
    return end.port ? t("end_at_port", { shape: nameOf(end.shapeId), port: end.port }) : nameOf(end.shapeId);
  };
  const arrowName = (arrow: Arrow) => {
    const ends = { from: endName(arrow.from), to: endName(arrow.to) };
    return arrow.label ? t("arrow_named", { ...ends, label: arrow.label }) : t("arrow_between", ends);
  };
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
    class:over-arrow={overArrow}
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
          {@const path = paths.get(arrow.id)}
          {#if path}
            {@const head = headOf(path, HEAD + arrow.width * 2)}
            {@const middle = pointAlong(path, 0.5)}
            <!-- Arrows take no pointer events: a click finds them by the distance to their path (lib/arrows.ts). -->
            <g role="img" aria-label={arrowName(arrow)} class="dg-arrow" class:selected={ui.selection.includes(arrow.id)} style:--arrow-color={arrow.color}>
              <path
                class="dg-arrow-line"
                d={pathData(head.line)}
                stroke-width={arrow.width}
                stroke-dasharray={arrow.dashed ? `${arrow.width * 4} ${arrow.width * 3}` : undefined}
              />
              <polygon class="dg-arrow-head" points={head.points.map((point) => `${point.x},${point.y}`).join(" ")} />
              {#if arrow.label}
                <text class="dg-arrow-label" x={middle.x} y={middle.y} text-anchor="middle" dominant-baseline="central">{arrow.label}</text>
              {/if}
            </g>
          {/if}
        {/if}
      {/each}

      {#if gesture?.kind === "draw" && gesture.moved}
        {@const preview = layoutArrows(shapes, [{ id: "", from: gesture.from, to: endingAt(gesture.from, gesture.at), route: "straight" }]).get("")}
        {#if preview}
          <path class="dg-arrow-preview" d={pathData(preview)} stroke-width={2 / zoom} />
        {/if}
      {/if}

      {#if aim?.shape && !aim.shape.locked}
        {@const shape = aim.shape}
        {#each portsOf(shape) as port (port)}
          {@const at = portPoint(shape, port)}
          <circle class="dg-port" class:aimed={aim.port === port} data-port={port} cx={at.x} cy={at.y} r={(aim.port === port ? 5 : 3.5) / zoom} stroke-width={1.5 / zoom} />
        {/each}
      {/if}

      {#if withEnds && paths.get(withEnds.id)}
        {@const arrow = withEnds}
        {@const path = paths.get(arrow.id)!}
        <!-- A handle in the middle of each segment adds a waypoint, or moves the segment of an elbow route. -->
        {#each middlesOf(path) as at, index (index)}
          {@const elbow = isShiftable(arrow.route, path, index)}
          <rect
            role="button"
            tabindex="-1"
            aria-label={t(elbow ? "elbow_segment_handle" : "segment_handle")}
            class="dg-handle dg-segment"
            class:elbow
            x={at.x - 3.5 / zoom}
            y={at.y - 3.5 / zoom}
            width={7 / zoom}
            height={7 / zoom}
            stroke-width={1.5 / zoom}
            onpointerdown={(event) => startSegment(event, arrow, path, index)}
          />
        {/each}
        {#each arrow.waypoints as at, index (index)}
          <circle
            role="button"
            tabindex="-1"
            aria-label={t("waypoint_handle")}
            class="dg-handle dg-waypoint"
            cx={at.x}
            cy={at.y}
            r={4.5 / zoom}
            stroke-width={1.5 / zoom}
            onpointerdown={(event) => startWaypoint(event, arrow, index)}
            ondblclick={(event) => removeWaypoint(event, arrow, index)}
          />
        {/each}
        {#each [["from", startOf(path)], ["to", endOf(path)]] as const as [which, at] (which)}
          <circle
            role="button"
            tabindex="-1"
            aria-label={t(which === "from" ? "arrow_start_handle" : "arrow_end_handle")}
            class="dg-handle dg-end"
            cx={at.x}
            cy={at.y}
            r={5 / zoom}
            stroke-width={1.5 / zoom}
            onpointerdown={(event) => startEnd(event, arrow, which)}
          />
        {/each}
      {/if}

      {#if gesture?.kind === "marquee"}
        <rect
          class="dg-marquee"
          x={Math.min(gesture.from.x, gesture.to.x)}
          y={Math.min(gesture.from.y, gesture.to.y)}
          width={Math.abs(gesture.to.x - gesture.from.x)}
          height={Math.abs(gesture.to.y - gesture.from.y)}
          stroke-width={1 / zoom}
        />
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

{#if selectedArrows.length && !selectedShapes.length}
  <ArrowPanel arrows={selectedArrows} />
{:else}
  <ShapePanel shapes={selectedShapes} onEditText={startEditing} />
{/if}

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
  svg.over-arrow {
    cursor: pointer;
  }
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
  /* The label is drawn over a halo of the background, which hides the line under it. */
  .dg-arrow-label {
    fill: var(--ink);
    font-size: 12px;
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 4px;
    stroke-linejoin: round;
  }
  .dg-port {
    fill: var(--bg);
    stroke: var(--accent);
    pointer-events: none;
  }
  .dg-port.aimed {
    fill: var(--accent);
  }
  .dg-end,
  .dg-waypoint {
    cursor: move;
  }
  .dg-segment {
    cursor: copy;
  }
  .dg-segment.elbow {
    cursor: move;
  }
  .dg-marquee {
    fill: var(--accent-soft);
    stroke: var(--accent);
    pointer-events: none;
  }
  .dg-arrow.selected {
    --arrow-color: var(--accent) !important;
  }
  .dg-arrow-preview {
    fill: none;
    stroke: var(--accent);
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
