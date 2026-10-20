// The arrows of a diagram, as pure functions of the model (diagram.ts): where an end lands when it is released, and the
// path each arrow follows. The drawn line, its click zone and its label all come from that one path, so that what the
// User sees is what they can click.

import { arrowHead, contains, type Endpoint, exitPoint, isAttached, type Outlined, outlinePoint, type Point, portDirection, portPoint, portsOf } from "./geometry.ts";

/** A shape as the arrows see it: its outline, its place in the drawing order, and whether it is locked. */
export interface Target extends Outlined {
  id: string;
  z: number;
  locked: boolean;
}

/** Shapes from the frontmost to the backmost: higher `z` first, and later in the list first among equals. */
const frontFirst = <S extends Target>(shapes: readonly S[]): S[] =>
  shapes
    .map((shape, index) => ({ shape, index }))
    .sort((a, b) => b.shape.z - a.shape.z || b.index - a.index)
    .map(({ shape }) => shape);

/**
 * Where an end released at `point` lands: at a port of the frontmost shape when the point is within `reach` of it,
 * automatic when it is elsewhere on that shape, free otherwise. A locked shape takes no end: it is free there.
 * `shape` and `port` say what the end aims at, so that it can be highlighted while the end is dragged.
 */
export function endAt<S extends Target>(shapes: readonly S[], point: Point, reach: number): { end: Endpoint; shape?: S; port: string | null } {
  const free = { x: point.x, y: point.y };
  for (const shape of frontFirst(shapes)) {
    const port = portsOf(shape).find((port) => {
      const at = portPoint(shape, port);
      return Math.hypot(at.x - point.x, at.y - point.y) <= reach;
    });
    if (!port && !contains(shape, point)) continue;
    if (shape.locked) return { end: free, shape, port: null };
    return { end: { shapeId: shape.id, port: port ?? null }, shape, port: port ?? null };
  }
  return { end: free, port: null };
}

/** The path of an arrow: a straight line, or a cubic Bézier curve through its two control points. */
export interface Path {
  start: Point;
  end: Point;
  controls: [Point, Point] | null;
}

/** An arrow as its path sees it. Elbow routes come with ticket 04: until then, they are drawn straight. */
export interface Routed {
  id: string;
  from: Endpoint;
  to: Endpoint;
  route: "straight" | "curved" | "elbow";
}

/** The space between parallel straight arrows: enough for their labels not to touch. */
const GAP = 24;
/** The space between arrows that share a port. */
const FAN = 8;
/** How far a single curve bends from its chord, and how far apart parallel curves bend, as a part of its length. */
const BEND = 0.2;
const SPREAD = 0.3;
/** How far a curve leaves a port in the direction it faces, at least. */
const REACH = 40;

const plus = (a: Point, b: Point, scale = 1): Point => ({ x: a.x + b.x * scale, y: a.y + b.y * scale });
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** The unit vector a quarter turn clockwise from `a` to `b`; none when they are on the same point. */
function normalOf(a: Point, b: Point): Point {
  const length = distance(a, b);
  return length === 0 ? { x: 0, y: 0 } : { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
}

/** The point an end stands for: its port, the center of its shape, or its own point; nowhere (NaN) when its shape is not there. */
export function anchorOf(shapes: ReadonlyMap<string, Outlined>, end: Endpoint): Point {
  if (!isAttached(end)) return { x: end.x, y: end.y };
  const shape = shapes.get(end.shapeId);
  if (!shape) return { x: NaN, y: NaN };
  return end.port ? portPoint(shape, end.port) : { x: shape.x, y: shape.y };
}

/**
 * The path of every arrow whose shapes are there, by id. An end attached to a port starts on it; an automatic end aims
 * at the next point of the arrow and stops at the outline, so that the line never enters its shape; a free end is its
 * point. Arrows that would be drawn on top of each other are spread apart:
 * - arrows between the same two shapes, automatic at both ends, are side by side if straight, bent apart if curved;
 * - arrows that share a port fan out from it, in the order of where they go, so that they do not cross.
 */
export function layoutArrows(shapes: ReadonlyMap<string, Outlined>, arrows: readonly Routed[]): Map<string, Path> {
  const drawn = arrows.filter((arrow) => [arrow.from, arrow.to].every((end) => !isAttached(end) || shapes.has(end.shapeId)));
  const shapeOf = (end: Endpoint) => (isAttached(end) ? shapes.get(end.shapeId) : undefined);
  const anchor = (end: Endpoint) => anchorOf(shapes, end);

  // Arrows between the same two shapes, automatic at both ends: each gets its rank from the middle of its group, and
  // the side of the group, the same whichever way the arrow goes.
  const groups = new Map<string, Routed[]>();
  for (const arrow of drawn) {
    if (!isAttached(arrow.from) || !isAttached(arrow.to) || arrow.from.port || arrow.to.port || arrow.from.shapeId === arrow.to.shapeId) continue;
    const key = [arrow.from.shapeId, arrow.to.shapeId].sort().join("\n");
    groups.set(key, [...(groups.get(key) ?? []), arrow]);
  }
  const ranks = new Map<string, { rank: number; normal: Point }>();
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [first, second] = key.split("\n").map((id) => shapes.get(id)!);
    const normal = normalOf(first, second);
    group.forEach((arrow, index) => ranks.set(arrow.id, { rank: index - (group.length - 1) / 2, normal }));
  }

  // Ends on the same port: each is moved along the outline, by its rank in the order of where its arrow goes.
  const ports = new Map<string, { key: string; side: number }[]>();
  for (const arrow of drawn) {
    for (const [which, end, other] of [["from", arrow.from, arrow.to], ["to", arrow.to, arrow.from]] as const) {
      if (!isAttached(end) || !end.port) continue;
      const shape = shapeOf(end)!;
      const facing = portDirection(shape, end.port);
      const toward = minus(anchor(other), portPoint(shape, end.port));
      const key = `${end.shapeId}\n${end.port}`;
      ports.set(key, [...(ports.get(key) ?? []), { key: `${arrow.id}\n${which}`, side: facing.x * toward.y - facing.y * toward.x }]);
    }
  }
  const fans = new Map<string, number>();
  for (const ends of ports.values()) {
    [...ends].sort((a, b) => a.side - b.side).forEach((end, index) => fans.set(end.key, (index - (ends.length - 1) / 2) * FAN));
  }

  /** The anchor of an end, moved along the outline when it shares its port: aside, then back onto the outline. */
  const fanned = (arrow: Routed, which: "from" | "to"): Point => {
    const end = arrow[which];
    const shift = fans.get(`${arrow.id}\n${which}`);
    if (!shift || !isAttached(end) || !end.port) return anchor(end);
    const shape = shapeOf(end)!;
    const facing = portDirection(shape, end.port);
    return outlinePoint(shape, plus(anchor(end), { x: -facing.y, y: facing.x }, shift));
  };

  const paths = new Map<string, Path>();
  for (const arrow of drawn) {
    const from = fanned(arrow, "from");
    const to = fanned(arrow, "to");
    const spread = ranks.get(arrow.id);
    const fromShape = shapeOf(arrow.from);
    const toShape = shapeOf(arrow.to);
    const automatic = (end: Endpoint) => isAttached(end) && !end.port;

    if (arrow.route === "curved") {
      const length = distance(from, to);
      const normal = spread?.normal ?? normalOf(from, to);
      const bend = spread ? spread.rank * SPREAD * length : BEND * length;
      /** A control point: out of its port in the direction it faces, or a third of the way along the bent chord. */
      const control = (end: Endpoint, at: Point, other: Point): Point =>
        isAttached(end) && end.port ? plus(at, portDirection(shapeOf(end)!, end.port), Math.max(REACH, length / 3)) : plus(plus(at, minus(other, at), 1 / 3), normal, bend);
      const controls: [Point, Point] = [control(arrow.from, from, to), control(arrow.to, to, from)];
      // An automatic end leaves its shape toward its control point, the way the curve goes, so it never enters it.
      paths.set(arrow.id, {
        start: automatic(arrow.from) ? outlinePoint(fromShape!, controls[0]) : from,
        end: automatic(arrow.to) ? outlinePoint(toShape!, controls[1]) : to,
        controls,
      });
      continue;
    }

    const offset = spread ? { x: spread.normal.x * spread.rank * GAP, y: spread.normal.y * spread.rank * GAP } : { x: 0, y: 0 };
    /** An automatic end, moved aside by the offset: it leaves its shape from beside the center, if that is inside. */
    const clip = (shape: Outlined, other: Point): Point => {
      const beside = plus(shape, offset);
      if (offset.x === 0 && offset.y === 0) return outlinePoint(shape, other);
      return contains(shape, beside) ? exitPoint(shape, beside, plus(other, offset)) : outlinePoint(shape, plus(other, offset));
    };
    paths.set(arrow.id, {
      start: automatic(arrow.from) ? clip(fromShape!, to) : from,
      end: automatic(arrow.to) ? clip(toShape!, from) : to,
      controls: null,
    });
  }
  return paths;
}

/** The point of a path at `t`, from 0 at its start to 1 at its end. */
export function pointAlong({ start, end, controls }: Path, t: number): Point {
  if (!controls) return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  const u = 1 - t;
  const [a, b, c] = [u * u * u, 3 * u * u * t, 3 * u * t * t];
  const d = t * t * t;
  return {
    x: a * start.x + b * controls[0].x + c * controls[1].x + d * end.x,
    y: a * start.y + b * controls[0].y + c * controls[1].y + d * end.y,
  };
}

/** The SVG path data of a path. */
export const pathData = ({ start, end, controls }: Path): string =>
  controls
    ? `M${start.x},${start.y} C${controls[0].x},${controls[0].y} ${controls[1].x},${controls[1].y} ${end.x},${end.y}`
    : `M${start.x},${start.y} L${end.x},${end.y}`;

/** A curve is measured as this many straight pieces: less than a tenth of a unit off, on the curves of a diagram. */
const PIECES = 64;

/** The points of a path, from its start to its end: its two ends if straight, and as many as needed along a curve. */
const pointsOf = (path: Path): Point[] =>
  path.controls ? Array.from({ length: PIECES + 1 }, (_, index) => pointAlong(path, index / PIECES)) : [path.start, path.end];

function segmentDistance(point: Point, a: Point, b: Point): number {
  const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length));
  return distance(point, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}

/** How far a point is from a path, as drawn: the click zone of an arrow is made of this distance. */
export function distanceTo(path: Path, point: Point): number {
  const points = pointsOf(path);
  let nearest = Infinity;
  for (let index = 1; index < points.length; index++) nearest = Math.min(nearest, segmentDistance(point, points[index - 1], points[index]));
  return nearest;
}

/**
 * The arrow whose path passes nearest to a point, within `reach`: at equal distance, the frontmost. The reach is given in
 * units of the drawing, so that the click zone stays the same width on screen at any zoom.
 */
export function arrowAt<A extends { id: string; z: number }>(arrows: readonly A[], paths: ReadonlyMap<string, Path>, point: Point, reach: number): A | undefined {
  let found: { arrow: A; distance: number } | undefined;
  for (const arrow of arrows) {
    const path = paths.get(arrow.id);
    if (!path) continue;
    const away = distanceTo(path, point);
    if (away > reach) continue;
    if (!found || away < found.distance || (away === found.distance && arrow.z >= found.arrow.z)) found = { arrow, distance: away };
  }
  return found?.arrow;
}

/**
 * The head at the end of a path, `length` long: its tip is on the end, and the line stops at its base, so that it never
 * shows past the tip. On a curve, the base is the point of the curve `length` before the end, and the curve is cut there.
 */
export function headOf(path: Path, length: number): { line: Path; points: [Point, Point, Point] } {
  if (!path.controls || distance(path.start, path.end) <= length) {
    const { base, points } = arrowHead(path.start, path.end, length);
    return { line: { ...path, end: base, controls: path.controls && [path.controls[0], path.controls[1]] }, points };
  }
  // The last point of the curve as far as `length` from the end, found by halving.
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (distance(pointAlong(path, middle), path.end) > length) low = middle;
    else high = middle;
  }
  const t = low;
  // The curve from 0 to t, by de Casteljau.
  const [p0, p1, p2, p3] = [path.start, path.controls[0], path.controls[1], path.end];
  const lerp = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp(p0, p1);
  const b = lerp(p1, p2);
  const c = lerp(p2, p3);
  const ab = lerp(a, b);
  const bc = lerp(b, c);
  const base = lerp(ab, bc);
  return { line: { start: p0, end: base, controls: [a, ab] }, points: arrowHead(base, path.end, length).points };
}

/** Whether all of a path is within a rectangle, given by its top-left corner and its size. */
export const pathWithin = (path: Path, rectangle: { x: number; y: number; w: number; h: number }): boolean =>
  pointsOf(path).every(({ x, y }) => x >= rectangle.x && x <= rectangle.x + rectangle.w && y >= rectangle.y && y <= rectangle.y + rectangle.h);

/** The point an arrow drawn from `origin` reaches with Shift: its direction turned to the nearest step of 45°, its length kept. */
export function constrainAngle(origin: Point, point: Point): Point {
  const length = distance(origin, point);
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(point.y - origin.y, point.x - origin.x) / step) * step;
  return { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) };
}

/** Whether an arrow can join two ends: not a shape to itself, unless between two of its ports. */
export const isDrawable = (from: Endpoint, to: Endpoint): boolean =>
  !isAttached(from) || !isAttached(to) || from.shapeId !== to.shapeId || (from.port !== null && to.port !== null && from.port !== to.port);
