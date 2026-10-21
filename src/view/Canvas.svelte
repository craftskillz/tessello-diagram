<script lang="ts">
  // The canvas of the open diagram, drawn in SVG from its model alone (lib/diagram.ts): what is drawn and what a click
  // finds both come from the shapes and arrows, through lib/geometry.ts and lib/arrows.ts. A gesture changes the model
  // as it goes and saves it when it ends.
  import { anchorOf, arrowAt, constrainAngle, endAt, endOf, headsOf, isDrawable, isShiftable, labelPlacement, labelPoint, layoutArrows, middlesOf, type Path, pathData, pathWithin, shiftSegment, snapWaypoint, startOf } from "../lib/arrows.ts";
  import { applyStyle, copyItems, copyStyle, pasteItems } from "../lib/clipboard.ts";
  import { type Arrow, COLORS, type Diagram, keepsRatio, newArrow, newId, newShape, nextZ, removeShape, type Shape, withGroups } from "../lib/diagram.ts";
  import { type Box, boxWithin, type Corner, cornersOf, cornerSign, degrees, type Endpoint, isAttached, type Point, portPoint, portsOf, resizeBox, shapeAt } from "../lib/geometry.ts";
  import { t } from "../lib/i18n.ts";
  import { alignment, type Bounds, boundsOf, fitView, GRID, type Guide, pointsBounds, scaleBoxes, snapToGrid } from "../lib/placement.ts";
  import { captionOf } from "../lib/images.ts";
  import { images, insertImage, redo, requestImages, save, type Tool, ui, undo } from "../lib/store.svelte.ts";
  import { canvasMeasure, layoutLabel, LINE_HEIGHT } from "../lib/text.ts";
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
  /** The space between a label and the edge of its background. */
  const LABEL_PAD = 3;
  /** The narrowest a label can be made by its handle. */
  const LABEL_MIN = 20;
  const CORNERS: Corner[] = ["nw", "ne", "se", "sw"];
  /** How far each paste lands from the last, in units of the drawing. */
  const PASTE_OFFSET = 40;
  /** The zooms the canvas allows, the step of its buttons, and the margin around the drawing when the view fits it, on screen. */
  const ZOOM = { min: 0.1, max: 4, step: 1.25 };
  const FIT_MARGIN = 40;
  /** How far around a group its dashed outline is drawn, on screen. */
  const GROUP_PAD = 6;
  const measure = canvasMeasure();

  let svg = $state<SVGSVGElement>();
  /** The file chooser of the Image tool, and where the image chosen will be placed. */
  let picker = $state<HTMLInputElement>();
  let pickedAt: Point = { x: 0, y: 0 };
  /** The canvas shows the drawing moved by `pan` (in pixels of the screen) and scaled by `zoom`. */
  let pan = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let spaceHeld = false;

  /** Where a free arrow was when a move started: its ends and its waypoints. */
  type Line = { id: string; from: Point; to: Point; waypoints: Point[] };
  type Gesture =
    | { kind: "pan"; from: Point; pan: Point }
    | { kind: "move"; id: string; from: Point; starts: (Box & { id: string })[]; lines: Line[]; moved: boolean }
    | { kind: "draw"; from: Endpoint; press: Point; at: Point; moved: boolean }
    | { kind: "end"; id: string; which: "from" | "to"; moved: boolean }
    | { kind: "waypoint"; id: string; index: number; moved: boolean }
    | { kind: "segment"; id: string; index: number; path: Path; from: Point; press: Point; moved: boolean }
    | { kind: "label"; id: string; grab: Point; moved: boolean }
    | { kind: "labelWidth"; id: string; moved: boolean }
    | { kind: "marquee"; from: Point; to: Point; kept: string[] }
    | { kind: "resize"; id: string; corner: Corner; from: Point; start: Box; moved: boolean }
    | { kind: "resizeGroup"; corner: Corner; from: Point; bounds: Bounds; starts: (Box & { id: string })[]; moved: boolean }
    | { kind: "rotate"; id: string; text: boolean; moved: boolean };
  let gesture = $state<Gesture | null>(null);
  /** The alignment guides shown while shapes move. */
  let guides = $state<Guide[]>([]);
  /** Where the pointer is on the drawing, to show the ports it can reach. */
  let pointer = $state<Point | null>(null);

  /** The shape whose text, or the arrow whose label, is being edited, and the text typed so far. */
  let editing = $state<{ kind: "shape" | "label"; id: string; text: string } | null>(null);

  const shapes = $derived(new Map(diagram.shapes.map((shape) => [shape.id, shape])));
  const arrows = $derived(new Map(diagram.arrows.map((arrow) => [arrow.id, arrow])));
  /** Shapes and arrows in drawing order: higher `z` in front. */
  const items = $derived(
    [...diagram.shapes.map((shape) => ({ kind: "shape" as const, shape })), ...diagram.arrows.map((arrow) => ({ kind: "arrow" as const, arrow }))].sort(
      (a, b) => (a.kind === "shape" ? a.shape.z : a.arrow.z) - (b.kind === "shape" ? b.shape.z : b.arrow.z),
    ),
  );
  const selectedShapes = $derived(diagram.shapes.filter((shape) => ui.selection.includes(shape.id)));
  const selectedArrows = $derived(diagram.arrows.filter((arrow) => ui.selection.includes(arrow.id)));
  /** The selected items that are locked: they can be neither moved, resized nor deleted, and their panel only unlocks them. */
  const selectedLocked = $derived([...selectedShapes, ...selectedArrows].filter((item) => item.locked));
  /** The ids of what can be selected by a rectangle or Ctrl/Cmd+A, or deleted: what is not locked. */
  const unlockedIds = (ids: readonly string[]) => ids.filter((id) => !(shapes.get(id) ?? arrows.get(id))?.locked);
  /** The path of each arrow: the line, its click zone, its handles and its label all follow it. */
  const paths = $derived(layoutArrows(shapes, diagram.arrows));
  /**
   * The arrow that shows the handles of its ends: a single selected arrow, with the Select tool, unless it is locked.
   * With the Arrow tool, a press on its end starts a new arrow, which then shares its port.
   */
  const withEnds = $derived(ui.tool === "select" && selectedArrows.length === 1 && ui.selection.length === 1 && !selectedArrows[0].locked ? selectedArrows[0] : undefined);
  /** The groups selected whole, each with the bounds of its members, outlined by a dashed line: not a member selected alone. */
  const selectedGroups = $derived.by(() => {
    const ids = new Set(selectedShapes.map((shape) => shape.groupId).filter((id) => id !== null));
    return [...ids]
      .map((id) => ({ id, members: diagram.shapes.filter((shape) => shape.groupId === id) }))
      .filter(({ members }) => members.every((shape) => ui.selection.includes(shape.id)))
      .map(({ id, members }) => ({ id, bounds: boundsOf(members)! }));
  });
  /** A group selected alone, with nothing locked: it shows the handles that resize it as one block. */
  const groupWithHandles = $derived(
    selectedGroups.length === 1 && !selectedLocked.length && !editing && selectedShapes.length > 1 && selectedShapes.every((shape) => shape.groupId === selectedGroups[0].id)
      ? selectedGroups[0]
      : undefined,
  );
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
  /** Where the label of an arrow is, its lines and the size of its box: its center slides along the path of the arrow. */
  function labelOf(arrow: Arrow, path: Path) {
    return { center: labelPoint(path, arrow.labelAt, arrow.labelOffset), ...layoutLabel(arrow, measure) };
  }
  /** Whether an arrow's color is a key of the palette, drawn in its outline color, rather than a CSS color written by an older version. */
  const isPaletteKey = (color: string) => (COLORS as readonly string[]).includes(color);
  /** The frontmost arrow whose label's box holds a point, turned with the label. */
  function labelAt(point: Point): Arrow | undefined {
    return [...diagram.arrows]
      .sort((a, b) => b.z - a.z)
      .find((arrow) => {
        const path = paths.get(arrow.id);
        if (!arrow.label || !path) return false;
        const { center, w, h } = labelOf(arrow, path);
        const radians = (arrow.labelRotation * Math.PI) / 180;
        const [dx, dy] = [point.x - center.x, point.y - center.y];
        const across = dx * Math.cos(radians) + dy * Math.sin(radians);
        const down = -dx * Math.sin(radians) + dy * Math.cos(radians);
        return Math.abs(across) <= w / 2 + LABEL_PAD && Math.abs(down) <= h / 2 + LABEL_PAD;
      });
  }
  /** The shape that shows the handles to resize and turn it: a single selected shape, unless it is locked. */
  const withHandles = $derived(selectedShapes.length === 1 && !editing && !selectedShapes[0].locked ? selectedShapes[0] : undefined);

  // The images the diagram shows are read from the storage once.
  $effect(() => {
    requestImages(diagram.shapes.flatMap((shape) => (shape.imageKey ? [shape.imageKey] : [])));
  });

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
    // A click on a member of a group selects the whole group; Alt+click selects the member alone.
    const picked = event.altKey ? [item.id] : withGroups(diagram, [item.id]);
    // Ctrl/Cmd+click adds a shape or an arrow to the selection, or takes it out.
    if (ctrl) {
      ui.selection = ui.selection.includes(item.id) ? ui.selection.filter((id) => !picked.includes(id)) : [...new Set([...ui.selection, ...picked])];
      return;
    }
    if (!ui.selection.includes(item.id)) ui.selection = picked;
    // A locked item is selected, and goes no further.
    if (item.locked) return;
    // The selected shapes move, and the selected arrows whose two ends are free: an attached arrow does not move by its
    // body. Locked items stay.
    const starts = selectedShapes.filter((shape) => !shape.locked).map(({ id, x, y, w, h, rotation }) => ({ id, x, y, w, h, rotation }));
    const lines = selectedArrows
      .filter((arrow) => isFree(arrow) && !arrow.locked)
      .map(({ id, from, to, waypoints }) => ({ id, from: { ...(from as Point) }, to: { ...(to as Point) }, waypoints: waypoints.map((point) => ({ ...point })) }));
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
    } else if (gesture.kind === "label") {
      const arrow = arrows.get(gesture.id);
      const path = arrow && paths.get(arrow.id);
      if (!arrow || !path) return;
      // The label slides along its line, and moves aside from it, where the pointer takes its center.
      const { at: along, offset } = labelPlacement(path, { x: at.x + gesture.grab.x, y: at.y + gesture.grab.y });
      arrow.labelAt = along;
      arrow.labelOffset = offset;
      gesture.moved = true;
    } else if (gesture.kind === "labelWidth") {
      const arrow = arrows.get(gesture.id);
      const path = arrow && paths.get(arrow.id);
      if (!arrow || !path) return;
      // The handle is on the right edge of the label, in its turned frame: the label widens on both sides of its center.
      const { center } = labelOf(arrow, path);
      const radians = (arrow.labelRotation * Math.PI) / 180;
      const across = (at.x - center.x) * Math.cos(radians) + (at.y - center.y) * Math.sin(radians);
      arrow.labelWidth = Math.max(LABEL_MIN, 2 * (Math.abs(across) - LABEL_PAD));
      gesture.moved = true;
    } else if (gesture.kind === "marquee") gesture.to = at;
    else if (gesture.kind === "move") {
      const { dx, dy } = snapMove(gesture, at.x - gesture.from.x, at.y - gesture.from.y);
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
    } else if (gesture.kind === "resizeGroup") {
      // The bounds of the group resize as a shape would; each member keeps its place and its size within them.
      const { bounds } = gesture;
      const box = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, w: bounds.w, h: bounds.h, rotation: 0 };
      const delta = { x: at.x - gesture.from.x, y: at.y - gesture.from.y };
      const resized = resizeBox(box, gesture.corner, delta, { keepRatio: event.shiftKey, fromCenter: ui.resizeFromCenter });
      const to = { x: resized.x - resized.w / 2, y: resized.y - resized.h / 2, w: resized.w, h: resized.h };
      for (const { id, x, y, w, h } of scaleBoxes(gesture.starts, bounds, to)) {
        const shape = shapes.get(id);
        if (shape) Object.assign(shape, { x, y, w, h });
      }
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

  /**
   * The move of a drag, lined up with the other shapes by the guides, else snapped to the grid: the guides line up the
   * bounds of the moved shapes, and the grid takes the center of the shape pressed. Free arrows moved alone are not snapped.
   */
  function snapMove(move: Extract<Gesture, { kind: "move" }>, dx: number, dy: number): { dx: number; dy: number } {
    let aligned: ReturnType<typeof alignment> = { dx: null, dy: null, guides: [] };
    if (diagram.guides && move.starts.length) {
      const moving = boundsOf(move.starts.map((start) => ({ ...start, x: start.x + dx, y: start.y + dy })))!;
      const others = diagram.shapes.filter((shape) => !move.starts.some((start) => start.id === shape.id)).map((shape) => boundsOf([shape])!);
      aligned = alignment(moving, others, reach(SNAP));
    }
    guides = aligned.guides;
    const anchor: Point | undefined = move.starts.find((start) => start.id === move.id) ?? move.starts[0];
    const grid = diagram.grid && anchor ? snapToGrid({ x: anchor.x + dx, y: anchor.y + dy }) : undefined;
    return {
      dx: aligned.dx !== null ? dx + aligned.dx : grid ? grid.x - anchor!.x : dx,
      dy: aligned.dy !== null ? dy + aligned.dy : grid ? grid.y - anchor!.y : dy,
    };
  }

  function onPointerUp(event: PointerEvent) {
    const ended = gesture;
    gesture = null;
    guides = [];
    if (!ended) return;
    if (ended.kind !== "draw" && "moved" in ended && ended.moved) void save();
    // A click without a drag on an item of the selection selects it alone, with its group unless Alt is held.
    if ((ended.kind === "move" || ended.kind === "label") && !ended.moved && !event.ctrlKey && !event.metaKey)
      ui.selection = event.altKey ? [ended.id] : withGroups(diagram, [ended.id]);
    // A click without a drag draws nothing.
    if (ended.kind === "draw" && ended.moved) {
      const arrow = newArrow(newId("arrow"), ended.from, endingAt(ended.from, ended.at), nextZ(diagram));
      diagram.arrows.push(arrow);
      ui.selection = [arrow.id];
      void save();
    }
    // The rectangle selects the shapes and the arrows it holds entirely, and the groups of those shapes, but nothing locked.
    if (ended.kind === "marquee") {
      const rectangle = { x: Math.min(ended.from.x, ended.to.x), y: Math.min(ended.from.y, ended.to.y), w: Math.abs(ended.to.x - ended.from.x), h: Math.abs(ended.to.y - ended.from.y) };
      if (rectangle.w === 0 && rectangle.h === 0) return;
      const inside = [
        ...diagram.shapes.filter((shape) => boxWithin(shape, rectangle)).map((shape) => shape.id),
        ...diagram.arrows.filter((arrow) => paths.has(arrow.id) && pathWithin(paths.get(arrow.id)!, rectangle)).map((arrow) => arrow.id),
      ];
      ui.selection = [...new Set([...ended.kept, ...unlockedIds(withGroups(diagram, unlockedIds(inside)))])];
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

  /**
   * A press on the label of an arrow, with the Select tool, selects the arrow and drags the label; Ctrl/Cmd+click adds
   * the arrow to the selection or takes it out. With another tool, the press goes on to the canvas.
   */
  function startLabel(event: PointerEvent, arrow: Arrow, center: Point) {
    if (event.button !== 0 || ui.tool !== "select" || spaceHeld || editing) return;
    if (event.ctrlKey || event.metaKey) {
      event.stopPropagation();
      ui.selection = ui.selection.includes(arrow.id) ? ui.selection.filter((id) => id !== arrow.id) : [...ui.selection, arrow.id];
      return;
    }
    if (!ui.selection.includes(arrow.id)) ui.selection = [arrow.id];
    if (arrow.locked) return event.stopPropagation();
    const at = toDrawing(event);
    capture(event, { kind: "label", id: arrow.id, grab: { x: center.x - at.x, y: center.y - at.y }, moved: false });
  }

  function startLabelWidth(event: PointerEvent, arrow: Arrow) {
    if (event.button !== 0) return;
    capture(event, { kind: "labelWidth", id: arrow.id, moved: false });
  }

  function startResize(event: PointerEvent, shape: Shape, corner: Corner) {
    if (event.button !== 0) return;
    const { x, y, w, h, rotation } = shape;
    capture(event, { kind: "resize", id: shape.id, corner, from: toDrawing(event), start: { x, y, w, h, rotation }, moved: false });
  }

  function startResizeGroup(event: PointerEvent, bounds: Bounds, corner: Corner) {
    if (event.button !== 0) return;
    const starts = selectedShapes.map(({ id, x, y, w, h, rotation }) => ({ id, x, y, w, h, rotation }));
    capture(event, { kind: "resizeGroup", corner, from: toDrawing(event), bounds: { ...bounds }, starts, moved: false });
  }

  function startRotate(event: PointerEvent, shape: Shape, text: boolean) {
    if (event.button !== 0) return;
    capture(event, { kind: "rotate", id: shape.id, text, moved: false });
  }

  function onDoubleClick(event: MouseEvent) {
    const at = toDrawing(event);
    // A double-click on an arrow or on its label edits its label. The pointer is captured by the canvas during a press,
    // so the double-click reaches the canvas, and the label is found by its box.
    // A locked item is not edited.
    const arrow = labelAt(at) ?? arrowAt(diagram.arrows, paths, at, reach(HIT));
    if (arrow) return arrow.locked || startEditingLabel(arrow.id);
    const shape = shapeAt(diagram.shapes, at);
    if (shape) return shape.locked || startEditing(shape.id);
    if (ui.tool === "select" || ui.tool === "arrow") return;
    // The Image tool asks for a picture, placed where the double-click was.
    if (ui.tool === "image") {
      pickedAt = at;
      return picker?.click();
    }
    const created = newShape(newId("shape"), at, nextZ(diagram), ui.tool);
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
      zoomTo(zoom * Math.exp(-event.deltaY * 0.01), { x: event.clientX - box.left, y: event.clientY - box.top });
    } else pan = { x: pan.x - event.deltaX, y: pan.y - event.deltaY };
  }

  /** Zooms around a point of the canvas, in pixels, which stays where it is: by default its center. */
  function zoomTo(next: number, around: Point = { x: svg!.clientWidth / 2, y: svg!.clientHeight / 2 }) {
    next = Math.min(ZOOM.max, Math.max(ZOOM.min, next));
    pan = { x: around.x - ((around.x - pan.x) * next) / zoom, y: around.y - ((around.y - pan.y) * next) / zoom };
    zoom = next;
  }

  /** "Fit": shows the whole drawing, its shapes and its arrows, centered; an empty drawing shows its origin at 100%. */
  function fit() {
    const points = [...diagram.shapes.flatMap((shape) => cornersOf(shape)), ...[...paths.values()].flatMap((path) => path.points)];
    const content = pointsBounds(points);
    const viewport = { w: svg!.clientWidth, h: svg!.clientHeight };
    ({ zoom, pan } = content ? fitView(content, viewport, FIT_MARGIN) : { zoom: 1, pan: { x: viewport.w / 2, y: viewport.h / 2 } });
  }

  const TOOL_KEYS: Record<string, Tool> = { s: "select", r: "rect", e: "ellipse", d: "database", c: "circle", a: "actor", p: "postit", t: "text", f: "arrow", i: "image" };

  /** Whether the keys go to a text being edited, a field or a dialog, rather than to the canvas. */
  const typing = (event: Event) => !!editing || !!(event.target as HTMLElement).closest("input, textarea, [role=dialog]");

  function onKeyDown(event: KeyboardEvent) {
    if (typing(event)) return;
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;
    // With Alt, a Mac types another letter: the shortcuts of the style go by the key pressed.
    if (ctrl && event.altKey && (event.code === "KeyC" || event.code === "KeyV")) {
      event.preventDefault();
      return event.code === "KeyC" ? copySelectionStyle() : pasteSelectionStyle();
    }
    if (event.key === " ") {
      // Space on a button presses it, rather than moving the canvas.
      if ((event.target as HTMLElement).closest("button")) return;
      spaceHeld = true;
      event.preventDefault();
    } else if (ctrl && key === "z") {
      // Ctrl/Cmd+Z undoes, with Shift it redoes; not in the middle of a gesture, which is not saved yet.
      event.preventDefault();
      if (!gesture) void (event.shiftKey ? redo() : undo());
    } else if (ctrl && key === "a") {
      event.preventDefault();
      ui.selection = unlockedIds([...diagram.shapes.map((shape) => shape.id), ...diagram.arrows.map((arrow) => arrow.id)]);
    } else if (ctrl && key === "c") {
      if (!ui.selection.length) return;
      ui.clip = copyItems(diagram, ui.selection);
      ui.pastes = 0;
    } else if ((event.key === "Delete" || event.key === "Backspace") && ui.selection.length) {
      // Deleting a shape frees the ends of its arrows; Ctrl/Cmd+Delete deletes its arrows too. Locked items stay.
      const removed = unlockedIds(ui.selection);
      if (!removed.length) return;
      diagram.arrows = diagram.arrows.filter((arrow) => !removed.includes(arrow.id));
      for (const id of removed) if (shapes.has(id)) removeShape(diagram, id, { withArrows: ctrl });
      ui.selection = ui.selection.filter((id) => !removed.includes(id));
      void save();
    } else if (key === "g" && !ctrl && !event.altKey) {
      diagram.grid = !diagram.grid;
      void save();
    } else if (event.key === "Escape") {
      ui.tool = "select";
      ui.selection = [];
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && TOOL_KEYS[key]) ui.tool = TOOL_KEYS[key];
  }

  /**
   * Ctrl/Cmd+V: an image of the system clipboard is placed in the middle of the view, captioned "image"; without one,
   * what Ctrl/Cmd+C copied is pasted. Only the `paste` event tells what the system clipboard holds.
   */
  function onPaste(event: ClipboardEvent) {
    if (typing(event)) return;
    const file = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      return void insertImage(file, captionOf(""), viewCenter());
    }
    if (!ui.clip?.shapes.length && !ui.clip?.arrows.length) return;
    event.preventDefault();
    ui.pastes++;
    ui.selection = pasteItems(diagram, ui.clip, PASTE_OFFSET * ui.pastes);
    void save();
  }

  /** The point of the drawing in the middle of the canvas. */
  const viewCenter = (): Point => ({ x: (svg!.clientWidth / 2 - pan.x) / zoom, y: (svg!.clientHeight / 2 - pan.y) / zoom });

  function onPicked(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void insertImage(file, captionOf(file.name), pickedAt);
  }

  /** "Copy style": the style of the first selected shape, else of the first selected arrow. */
  function copySelectionStyle() {
    const source = selectedShapes[0] ?? selectedArrows[0];
    if (source) ui.style = copyStyle(source, ui.styleWithSize);
  }

  /** "Paste style": applies the copied style to the selected items of its kind that are not locked. */
  function pasteSelectionStyle() {
    if (!ui.style) return;
    applyStyle(
      ui.style,
      selectedShapes.filter((shape) => !shape.locked),
      selectedArrows.filter((arrow) => !arrow.locked),
    );
    void save();
  }

  /** Locks the selection, which stays selected: its panel then offers to unlock it. */
  function setLocked(locked: boolean) {
    for (const item of [...selectedShapes, ...selectedArrows]) item.locked = locked;
    void save();
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.key === " ") spaceHeld = false;
  }

  // ── Text of a shape or label of an arrow: Enter applies, Shift+Enter adds a line, Escape abandons, leaving the field applies ──
  function startEditing(id: string) {
    editing = { kind: "shape", id, text: shapes.get(id)?.text ?? "" };
  }

  function startEditingLabel(id: string) {
    const arrow = arrows.get(id);
    if (!arrow) return;
    ui.selection = [id];
    editing = { kind: "label", id, text: arrow.label };
  }

  function applyText() {
    if (!editing) return;
    const { kind, id, text } = editing;
    editing = null;
    if (kind === "shape") {
      const shape = shapes.get(id);
      if (!shape || shape.text === text) return;
      shape.text = text;
    } else {
      const arrow = arrows.get(id);
      if (!arrow || arrow.label === text) return;
      arrow.label = text;
    }
    void save();
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

  const editedShape = $derived(editing?.kind === "shape" ? shapes.get(editing.id) : undefined);
  /** The arrow whose label is edited, and where its label is, for the field to cover it. */
  const editedLabel = $derived.by(() => {
    if (editing?.kind !== "label") return undefined;
    const arrow = arrows.get(editing.id);
    const path = arrow && paths.get(arrow.id);
    return arrow && path ? { arrow, ...labelOf({ ...arrow, label: editing.text || " " }, path) } : undefined;
  });
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
  onpaste={onPaste}
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
    <!-- The grid follows the pan and the zoom; it is not drawn when its lines would crowd together. -->
    {#if diagram.grid && GRID * zoom >= 6}
      <defs>
        <pattern id="dg-grid" width={GRID * zoom} height={GRID * zoom} x={pan.x} y={pan.y} patternUnits="userSpaceOnUse">
          <path class="dg-grid-line" d="M{GRID * zoom} 0H0V{GRID * zoom}" />
        </pattern>
      </defs>
      <rect class="dg-grid" width="100%" height="100%" fill="url(#dg-grid)" />
    {/if}
    <g transform="translate({pan.x} {pan.y}) scale({zoom})">
      {#each items as item (item.kind === "shape" ? item.shape.id : item.arrow.id)}
        {#if item.kind === "shape"}
          <ShapeView
            shape={item.shape}
            label={nameOf(item.shape.id)}
            selected={ui.selection.includes(item.shape.id)}
            editing={editing?.kind === "shape" && editing.id === item.shape.id}
            image={item.shape.imageKey ? images[item.shape.imageKey] : undefined}
            {measure}
          />
        {:else}
          {@const arrow = item.arrow}
          {@const path = paths.get(arrow.id)}
          {#if path}
            {@const drawn = headsOf(path, arrow.heads, HEAD + arrow.width * 2)}
            {@const palette = isPaletteKey(arrow.color)}
            <!-- The line of an arrow takes no pointer events: a click finds it by the distance to its path (lib/arrows.ts). -->
            <g
              role="img"
              aria-label={arrowName(arrow)}
              class="dg-arrow {palette ? arrow.color : ''}"
              class:selected={ui.selection.includes(arrow.id)}
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
              {#if arrow.label && !(editing?.kind === "label" && editing.id === arrow.id)}
                {@const label = labelOf(arrow, path)}
                <!-- The label is drawn over a background, which hides the line under it; it is dragged by its box. -->
                <g
                  role="button"
                  tabindex="-1"
                  aria-label={t("label_handle")}
                  class="dg-arrow-label"
                  transform="translate({label.center.x} {label.center.y}) rotate({arrow.labelRotation})"
                  onpointerdown={(event) => startLabel(event, arrow, label.center)}
                >
                  <rect x={-label.w / 2 - LABEL_PAD} y={-label.h / 2 - LABEL_PAD} width={label.w + LABEL_PAD * 2} height={label.h + LABEL_PAD * 2} rx="3" />
                  <text font-size={arrow.labelSize} text-anchor="middle" dominant-baseline="central">
                    {#each label.lines as line, index}
                      <tspan x="0" y={(index - (label.lines.length - 1) / 2) * label.lineHeight}>{line}</tspan>
                    {/each}
                  </text>
                </g>
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
        {#if arrow.label && !(editing?.kind === "label" && editing.id === arrow.id)}
          {@const label = labelOf(arrow, path)}
          <!-- A handle on the right edge of the label sets the width its lines wrap within. -->
          <rect
            role="button"
            tabindex="-1"
            aria-label={t("label_width_handle")}
            class="dg-handle dg-label-width"
            transform="translate({label.center.x} {label.center.y}) rotate({arrow.labelRotation})"
            x={label.w / 2 + LABEL_PAD - 3 / zoom}
            y={-5 / zoom}
            width={6 / zoom}
            height={10 / zoom}
            stroke-width={1.5 / zoom}
            onpointerdown={(event) => startLabelWidth(event, arrow)}
          />
        {/if}
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

      {#each selectedGroups as group (group.id)}
        {@const pad = GROUP_PAD / zoom}
        <rect
          class="dg-group-outline"
          data-group={group.id}
          x={group.bounds.x - pad}
          y={group.bounds.y - pad}
          width={group.bounds.w + pad * 2}
          height={group.bounds.h + pad * 2}
          stroke-width={1.5 / zoom}
          stroke-dasharray="{6 / zoom} {4 / zoom}"
        />
      {/each}

      {#each guides as guide, index (index)}
        <line
          class="dg-guide"
          x1={guide.axis === "x" ? guide.at : guide.from}
          y1={guide.axis === "x" ? guide.from : guide.at}
          x2={guide.axis === "x" ? guide.at : guide.to}
          y2={guide.axis === "x" ? guide.to : guide.at}
          stroke-width={1 / zoom}
          stroke-dasharray="{4 / zoom} {4 / zoom}"
        />
      {/each}

      <!-- A locked item shows a padlock: at the top-right corner of a shape, in the middle of an arrow. -->
      {#each selectedLocked as item (item.id)}
        {@const path = "from" in item ? paths.get(item.id) : undefined}
        {@const bounds = "from" in item ? undefined : boundsOf([item])}
        {@const spot = path ? labelPoint(path, 0.5, 0) : bounds ? { x: bounds.x + bounds.w, y: bounds.y } : undefined}
        {#if spot}
          <g role="img" aria-label={t("locked_badge")} class="dg-lock-badge" transform="translate({spot.x} {spot.y}) scale({1 / zoom})">
            <circle r="10" />
            <path d="M-4,-1V-4a4,4 0 0 1 8,0V-1M-5.5,-1h11v7h-11z" />
          </g>
        {/if}
      {/each}

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

      {#if groupWithHandles}
        {@const bounds = groupWithHandles.bounds}
        {@const size = 5 / zoom}
        {#each CORNERS as corner (corner)}
          <rect
            role="button"
            tabindex="-1"
            aria-label={t(`resize_${corner}`)}
            class="dg-handle resize-{corner}"
            x={bounds.x + ((cornerSign(corner).x + 1) * bounds.w) / 2 - size}
            y={bounds.y + ((cornerSign(corner).y + 1) * bounds.h) / 2 - size}
            width={size * 2}
            height={size * 2}
            stroke-width={1.5 / zoom}
            onpointerdown={(event) => startResizeGroup(event, bounds, corner)}
          />
        {/each}
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
  {:else if editing && editedLabel}
    {@const { center, w, h, arrow } = editedLabel}
    {@const width = Math.max(w, 120) + LABEL_PAD * 2}
    {@const height = h + LABEL_PAD * 2 + 8}
    <textarea
      class="dg-text-editor dg-label-editor"
      aria-label={t("label_text")}
      style:left="{pan.x + (center.x - width / 2) * zoom}px"
      style:top="{pan.y + (center.y - height / 2) * zoom}px"
      style:width="{width * zoom}px"
      style:height="{height * zoom}px"
      style:font-size="{arrow.labelSize * zoom}px"
      style:line-height={LINE_HEIGHT}
      bind:value={editing.text}
      onkeydown={onTextKey}
      onblur={applyText}
      use:focus
    ></textarea>
  {/if}

  <input bind:this={picker} type="file" accept="image/*" hidden aria-label={t("choose_image")} onchange={onPicked} />

  <div class="dg-zoom" role="group" aria-label={t("zoom")}>
    <button type="button" class="dg-btn" aria-label={t("zoom_out")} title={t("zoom_out")} onclick={() => zoomTo(zoom / ZOOM.step)}>−</button>
    <output aria-label={t("zoom")}>{Math.round(zoom * 100)}%</output>
    <button type="button" class="dg-btn" aria-label={t("zoom_in")} title={t("zoom_in")} onclick={() => zoomTo(zoom * ZOOM.step)}>+</button>
    <button type="button" class="dg-btn" title={t("zoom_fit_hint")} onclick={fit}>{t("zoom_fit")}</button>
  </div>
</div>

{#if selectedLocked.length}
  <aside class="dg-panel" aria-label={t("locked_panel")}>
    <button type="button" class="dg-btn" onclick={() => setLocked(false)}>{t("unlock")}</button>
  </aside>
{:else if selectedArrows.length && !selectedShapes.length}
  <ArrowPanel arrows={selectedArrows} onEditLabel={startEditingLabel} onLock={() => setLocked(true)} onCopyStyle={copySelectionStyle} onPasteStyle={pasteSelectionStyle} />
{:else}
  <ShapePanel shapes={selectedShapes} onEditText={startEditing} onLock={() => setLocked(true)} onCopyStyle={copySelectionStyle} onPasteStyle={pasteSelectionStyle} />
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
  .dg-label-width {
    cursor: ew-resize;
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
  .dg-label-editor {
    text-align: center;
  }
  .dg-grid {
    pointer-events: none;
  }
  .dg-grid-line {
    fill: none;
    stroke: var(--line);
    stroke-width: 1;
  }
  .dg-group-outline {
    fill: none;
    stroke: var(--accent);
    pointer-events: none;
  }
  .dg-guide {
    stroke: var(--accent);
    pointer-events: none;
  }
  .dg-lock-badge {
    pointer-events: none;
  }
  .dg-lock-badge circle {
    fill: var(--accent);
  }
  .dg-lock-badge path {
    fill: none;
    stroke: var(--bg);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  .dg-zoom {
    position: absolute;
    left: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    font-size: 12px;
  }
  .dg-zoom output {
    min-width: 42px;
    text-align: center;
    color: var(--muted);
  }
</style>
