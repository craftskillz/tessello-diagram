// The geometry of the canvas, as pure functions of the model (diagram.ts): coordinates are those of the drawing, with
// y growing downward as in SVG, and a rotation is in degrees, clockwise.

import type { ShapeType } from "./diagram.ts";

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

/** The box of a shape and its type, which gives its outline: a box without a type is a rectangle. */
export interface Outlined extends Box {
  type?: ShapeType;
}

/**
 * How far along the ray from the center through `local` (a point in the frame of the shape, not at its center) the
 * outline is, as a multiple of `local`: 1 when the point is on the outline, more when it is inside.
 */
function outlineFactor(shape: Outlined, local: Point): number {
  const a = shape.w / 2;
  const b = shape.h / 2;
  switch (shape.type) {
    case "ellipse":
      return 1 / Math.hypot(local.x / a, local.y / b);
    case "circle": {
      const r = Math.min(a, b);
      return r / Math.hypot(local.x, local.y);
    }
    case "database":
      return cylinderFactor(a, b, local);
    default:
      // The sides of a rectangle are axis-aligned in its frame.
      return 1 / Math.max(Math.abs(local.x) / a, Math.abs(local.y) / b);
  }
}

/** The height of the lids of a database, half the height of its ellipses, as in living-documentation. */
export const lidOf = (h: number): number => Math.min(Math.max(h * 0.12, 6), h / 2);

/**
 * The outline of a cylinder of half-width `a` and half-height `b`: its sides, the top of its upper lid and the bottom
 * of its lower lid.
 */
function cylinderFactor(a: number, b: number, local: Point): number {
  const ry = lidOf(b * 2);
  const side = local.x === 0 ? Infinity : a / Math.abs(local.x);
  if (Math.abs(local.y * side) <= b - ry) return side;
  // The lid ellipse centered at (0, cy): (t·x / a)² + ((t·y − cy) / ry)² = 1, whose larger root is the far crossing.
  const cy = local.y < 0 ? -(b - ry) : b - ry;
  const qa = (local.x / a) ** 2 + (local.y / ry) ** 2;
  const qb = (-2 * local.y * cy) / ry ** 2;
  const qc = (cy / ry) ** 2 - 1;
  return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
}

/**
 * Where the segment from the center of a shape toward `toward` crosses its outline: the end of an arrow attached
 * automatically, which never enters the shape. Toward the center itself, the center.
 */
export function outlinePoint(shape: Outlined, toward: Point): Point {
  const local = toLocal(shape, toward);
  if (local.x === 0 && local.y === 0) return { x: shape.x, y: shape.y };
  const factor = outlineFactor(shape, local);
  const onOutline = rotate({ x: local.x * factor, y: local.y * factor }, shape.rotation);
  return { x: shape.x + onOutline.x, y: shape.y + onOutline.y };
}

/** Whether a point is on or inside the outline of a shape. */
export function contains(shape: Outlined, point: Point): boolean {
  const local = toLocal(shape, point);
  return (local.x === 0 && local.y === 0) || outlineFactor(shape, local) >= 1;
}

/** An end of an arrow: attached to a shape, at one of its ports or automatically (`port: null`), or free at a point. */
export type Endpoint = { shapeId: string; port: string | null } | Point;

export const isAttached = (end: Endpoint): end is { shapeId: string; port: string | null } => "shapeId" in end;

/**
 * Where an arrow starts and ends. An end attached to a shape aims at the other end (the center of its shape, or its
 * point) and stops at the outline. Null when an end is attached to a shape that is not there.
 */
export function arrowEnds(shapes: ReadonlyMap<string, Outlined>, arrow: { from: Endpoint; to: Endpoint }): { start: Point; end: Point } | null {
  const from = isAttached(arrow.from) ? shapes.get(arrow.from.shapeId) : arrow.from;
  const to = isAttached(arrow.to) ? shapes.get(arrow.to.shapeId) : arrow.to;
  if (!from || !to) return null;
  return {
    start: isAttached(arrow.from) ? outlinePoint(from as Outlined, to) : { x: from.x, y: from.y },
    end: isAttached(arrow.to) ? outlinePoint(to as Outlined, from) : { x: to.x, y: to.y },
  };
}

/** The frontmost shape whose outline holds the point, if any. */
export function shapeAt<S extends Outlined & { z: number }>(shapes: readonly S[], point: Point): S | undefined {
  return shapes.reduce<S | undefined>((front, shape) => (contains(shape, point) && (!front || shape.z >= front.z) ? shape : front), undefined);
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

/** A corner of a shape, in its own frame: north-west is its top-left corner before it is turned. */
export type Corner = "nw" | "ne" | "se" | "sw";

/** The side of a corner from the center of its shape, in its frame: 1 right or below, −1 left or above. */
export const cornerSign = (corner: Corner): Point => ({ x: corner === "ne" || corner === "se" ? 1 : -1, y: corner === "se" || corner === "sw" ? 1 : -1 });

/** An angle in whole degrees, from 0 to 359. */
export const degrees = (angle: number): number => ((Math.round(angle) % 360) + 360) % 360;

/** The smallest side of a shape, in units of the drawing. */
export const MIN_SIDE = 20;

/**
 * The box of a shape whose corner is dragged by `delta` (on screen, in units of the drawing): the opposite corner stays,
 * or the center in the fixed center mode. Keeping the ratio, the larger change wins. No side gets below `MIN_SIDE`.
 */
export function resizeBox(box: Box, corner: Corner, delta: Point, mode: { keepRatio: boolean; fromCenter: boolean }): Box {
  const local = rotate(delta, -box.rotation);
  const { x: sx, y: sy } = cornerSign(corner);
  const grow = mode.fromCenter ? 2 : 1;
  let w = box.w + sx * local.x * grow;
  let h = box.h + sy * local.y * grow;
  if (mode.keepRatio) {
    const scale = Math.max(w / box.w, h / box.h, MIN_SIDE / box.w, MIN_SIDE / box.h);
    w = box.w * scale;
    h = box.h * scale;
  } else {
    w = Math.max(MIN_SIDE, w);
    h = Math.max(MIN_SIDE, h);
  }
  if (mode.fromCenter) return { ...box, w, h };
  // The new center, from the opposite corner, in the frame of the shape.
  const center = rotate({ x: (sx * (w - box.w)) / 2, y: (sy * (h - box.h)) / 2 }, box.rotation);
  return { ...box, x: box.x + center.x, y: box.y + center.y, w, h };
}
