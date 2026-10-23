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

/** A port of a custom shape, set in the shape editor: where it is, as parts of the width and height of the shape from its top-left corner. */
export interface Anchor {
  id: string;
  x: number;
  y: number;
}

/**
 * The box of a shape and its type, which gives its outline: a box without a type is a rectangle. A custom shape is a
 * rectangle too, whose ports are the anchors of its definition: none when it has no definition.
 */
export interface Outlined extends Box {
  type?: ShapeType;
  anchors?: readonly Anchor[];
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

/** The ports of the built-in shapes, from north clockwise. */
export const PORTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** The four directions offered by the Select tool, in the frame of the shape. */
export const CONNECTION_DIRECTIONS = ["N", "E", "S", "W"] as const;
export type ConnectionDirection = (typeof CONNECTION_DIRECTIONS)[number];

/** A connection handle sits outside the local box, 14 screen pixels from its side, regardless of zoom. */
export function connectionHandlePoint(box: Box, direction: ConnectionDirection, zoom: number): Point {
  return portPoint({ x: box.x, y: box.y, w: box.w + 28 / zoom, h: box.h + 28 / zoom, rotation: box.rotation }, direction);
}

/** The existing port used when pulling a connection from a side of a shape. */
export function connectionPort(shape: Outlined, direction: ConnectionDirection): string | null {
  if (shape.type !== "custom") return direction;
  const side = PORT_SIDES[direction];
  const target = { x: (side.x + 1) / 2, y: (side.y + 1) / 2 };
  let nearest: Anchor | undefined;
  let distance = Infinity;
  for (const anchor of shape.anchors ?? []) {
    const next = Math.hypot(anchor.x - target.x, anchor.y - target.y);
    if (next < distance) {
      nearest = anchor;
      distance = next;
    }
  }
  return nearest?.id ?? null;
}

/** The direction of each port from the center, in the frame of the shape: x right, y down. */
const PORT_SIDES: Record<string, Point> = {
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: -1 },
};

/** The ports a shape offers: the eight of a built-in shape, or the anchors of a custom shape, maybe none. */
export const portsOf = (shape: { type?: ShapeType; anchors?: readonly Anchor[] }): readonly string[] =>
  shape.type === "custom" ? (shape.anchors ?? []).map((anchor) => anchor.id) : PORTS;

/** Where an anchor of a custom shape is, in the frame of the shape; none for a port it does not have. */
function anchorPoint(shape: Outlined, port: string): Point | undefined {
  const anchor = shape.anchors?.find((anchor) => anchor.id === port);
  return anchor && { x: (anchor.x - 0.5) * shape.w, y: (anchor.y - 0.5) * shape.h };
}

/**
 * Where a port of a shape is, on its real outline: the corners of a rectangle, on the curve of an ellipse or a circle,
 * where the sides of a database meet its lids. It follows the rotation of the shape. An unknown port is the center.
 */
export function portPoint(shape: Outlined, port: string): Point {
  if (shape.type === "custom") {
    const at = rotate(anchorPoint(shape, port) ?? { x: 0, y: 0 }, shape.rotation);
    return { x: shape.x + at.x, y: shape.y + at.y };
  }
  const side = PORT_SIDES[port];
  if (!side) return { x: shape.x, y: shape.y };
  const a = shape.w / 2;
  const b = shape.type === "database" ? shape.h / 2 - lidOf(shape.h) : shape.h / 2;
  const local = { x: side.x * a, y: side.y * (side.x === 0 ? shape.h / 2 : b) };
  const factor = outlineFactor(shape, local);
  const onOutline = rotate({ x: local.x * factor, y: local.y * factor }, shape.rotation);
  return { x: shape.x + onOutline.x, y: shape.y + onOutline.y };
}

/** The direction a port faces, away from the center of its shape, as a unit vector; none for a port at the center. */
export function portDirection(shape: Outlined, port: string): Point {
  const side = shape.type === "custom" ? anchorPoint(shape, port) : PORT_SIDES[port];
  if (!side || (side.x === 0 && side.y === 0)) return { x: 0, y: 0 };
  const turned = rotate(side, shape.rotation);
  const length = Math.hypot(turned.x, turned.y);
  return { x: turned.x / length, y: turned.y / length };
}

/** Whether a point is on or inside the outline of a shape. */
export function contains(shape: Outlined, point: Point): boolean {
  const local = toLocal(shape, point);
  return (local.x === 0 && local.y === 0) || outlineFactor(shape, local) >= 1;
}

/**
 * Where the line from `inside`, a point within a shape, toward `toward` leaves its outline: the end of an arrow drawn
 * beside the center, such as one of several parallel arrows. Every outline is convex, so the crossing is found by halving.
 */
export function exitPoint(shape: Outlined, inside: Point, toward: Point): Point {
  const dx = toward.x - inside.x;
  const dy = toward.y - inside.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: inside.x, y: inside.y };
  // Past the outline for sure: the shape is never wider than w + h, whatever its rotation.
  let low = 0;
  let high = (shape.w + shape.h) / length;
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2;
    if (contains(shape, { x: inside.x + dx * middle, y: inside.y + dy * middle })) low = middle;
    else high = middle;
  }
  return { x: inside.x + dx * low, y: inside.y + dy * low };
}

/** An end of an arrow: attached to a shape, at one of its ports or automatically (`port: null`), or free at a point. */
export type Endpoint = { shapeId: string; port: string | null } | Point;

export const isAttached = (end: Endpoint): end is { shapeId: string; port: string | null } => "shapeId" in end;

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

/** The four corners of a box, turned with it. */
export function cornersOf(box: Box): Point[] {
  return (["nw", "ne", "se", "sw"] as const).map((corner) => {
    const sign = cornerSign(corner);
    const at = rotate({ x: (sign.x * box.w) / 2, y: (sign.y * box.h) / 2 }, box.rotation);
    return { x: box.x + at.x, y: box.y + at.y };
  });
}

/** Whether the whole box of a shape, turned, is within a rectangle given by its top-left corner and its size. */
export function boxWithin(box: Box, rectangle: { x: number; y: number; w: number; h: number }): boolean {
  // Within a hair: a corner turned by 90° lands a rounding error off.
  return cornersOf(box).every(({ x, y }) => x >= rectangle.x - 1e-9 && x <= rectangle.x + rectangle.w + 1e-9 && y >= rectangle.y - 1e-9 && y <= rectangle.y + rectangle.h + 1e-9);
}
