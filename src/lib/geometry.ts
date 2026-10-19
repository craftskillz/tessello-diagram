// The geometry of the canvas, as pure functions of the model (diagram.ts): coordinates are those of the drawing, with
// y growing downward as in SVG, and a rotation is in degrees, clockwise.

export interface Point {
  x: number;
  y: number;
}

/** The box of a shape: its center, its size and its rotation. */
export interface Box extends Point {
  w: number;
  h: number;
  rotation: number;
}

/** Turns a point around the origin by `degrees`, clockwise on screen. */
function rotate({ x, y }: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** The point in the frame of a box: from its center, without its rotation. */
const toLocal = (box: Box, point: Point): Point => rotate({ x: point.x - box.x, y: point.y - box.y }, -box.rotation);

/**
 * Where the segment from the center of a rectangle toward `toward` crosses its outline: the end of an arrow attached
 * automatically, which never enters the shape. Toward the center itself, the center.
 */
export function outlinePoint(box: Box, toward: Point): Point {
  // In the frame of the rectangle, its sides are axis-aligned.
  const local = toLocal(box, toward);
  const scale = Math.max(Math.abs(local.x) / (box.w / 2), Math.abs(local.y) / (box.h / 2));
  if (scale === 0) return { x: box.x, y: box.y };
  const onOutline = rotate({ x: local.x / scale, y: local.y / scale }, box.rotation);
  return { x: box.x + onOutline.x, y: box.y + onOutline.y };
}

/** An end of an arrow: attached to a shape, at one of its ports or automatically (`port: null`), or free at a point. */
export type Endpoint = { shapeId: string; port: string | null } | Point;

export const isAttached = (end: Endpoint): end is { shapeId: string; port: string | null } => "shapeId" in end;

/**
 * Where an arrow starts and ends. An end attached to a shape aims at the other end (the center of its shape, or its
 * point) and stops at the outline. Null when an end is attached to a shape that is not there.
 */
export function arrowEnds(shapes: ReadonlyMap<string, Box>, arrow: { from: Endpoint; to: Endpoint }): { start: Point; end: Point } | null {
  const from = isAttached(arrow.from) ? shapes.get(arrow.from.shapeId) : arrow.from;
  const to = isAttached(arrow.to) ? shapes.get(arrow.to.shapeId) : arrow.to;
  if (!from || !to) return null;
  return {
    start: isAttached(arrow.from) ? outlinePoint(from as Box, to) : { x: from.x, y: from.y },
    end: isAttached(arrow.to) ? outlinePoint(to as Box, from) : { x: to.x, y: to.y },
  };
}

/** The frontmost shape whose outline holds the point, if any. */
export function shapeAt<S extends Box & { z: number }>(shapes: readonly S[], point: Point): S | undefined {
  return shapes.reduce<S | undefined>((front, shape) => {
    const local = toLocal(shape, point);
    const inside = Math.abs(local.x) <= shape.w / 2 && Math.abs(local.y) <= shape.h / 2;
    return inside && (!front || shape.z >= front.z) ? shape : front;
  }, undefined);
}

/**
 * The head of an arrow ending at `end`, coming from `start`: a triangle as long as `length` and half as wide on each
 * side, whose tip is on the end. The line stops at its base, so that it never shows past the tip.
 */
export function arrowHead(start: Point, end: Point, length: number): { base: Point; points: [Point, Point, Point] } {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance === 0) return { base: end, points: [end, end, end] };
  const ux = (end.x - start.x) / distance;
  const uy = (end.y - start.y) / distance;
  const base = { x: end.x - ux * length, y: end.y - uy * length };
  const half = length / 2;
  return { base, points: [end, { x: base.x - uy * half, y: base.y + ux * half }, { x: base.x + uy * half, y: base.y - ux * half }] };
}
