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

/**
 * The path of an arrow: the points it passes through, from its start to its end, joined by straight pieces, or by cubic
 * Bézier curves through the two control points of each piece.
 */
export interface Path {
  points: Point[];
  controls: [Point, Point][] | null;
}

export const startOf = (path: Path): Point => path.points[0];
export const endOf = (path: Path): Point => path.points[path.points.length - 1];

/** An arrow as its path sees it: its waypoints are where the User wants it to pass, in order. */
export interface Routed {
  id: string;
  from: Endpoint;
  to: Endpoint;
  route: "straight" | "curved" | "elbow";
  waypoints?: readonly Point[];
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
const scaled = (a: Point, scale: number): Point => ({ x: a.x * scale, y: a.y * scale });
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
 * at the next point of the arrow, its nearest waypoint or else the other end, and stops at the outline, so that the line
 * never enters its shape; a free end is its point. Arrows that would be drawn on top of each other are spread apart:
 * - arrows between the same two shapes, automatic at both ends and without waypoints, are side by side if straight or
 *   elbow, bent apart if curved;
 * - arrows that share a port fan out from it, in the order of where they go, so that they do not cross.
 */
export function layoutArrows(shapes: ReadonlyMap<string, Outlined>, arrows: readonly Routed[]): Map<string, Path> {
  const drawn = arrows.filter((arrow) => [arrow.from, arrow.to].every((end) => !isAttached(end) || shapes.has(end.shapeId)));
  const shapeOf = (end: Endpoint) => (isAttached(end) ? shapes.get(end.shapeId) : undefined);
  const anchor = (end: Endpoint) => anchorOf(shapes, end);
  const waypointsOf = (arrow: Routed) => arrow.waypoints ?? [];
  /** The point an end aims at: the waypoint next to it, or the other end. */
  const nextTo = (arrow: Routed, which: "from" | "to"): Point => {
    const waypoints = waypointsOf(arrow);
    if (waypoints.length) return which === "from" ? waypoints[0] : waypoints[waypoints.length - 1];
    return anchor(which === "from" ? arrow.to : arrow.from);
  };

  // Arrows between the same two shapes, automatic at both ends: each gets its rank from the middle of its group, and
  // the side of the group, the same whichever way the arrow goes. An arrow with waypoints goes its own way.
  const groups = new Map<string, Routed[]>();
  for (const arrow of drawn) {
    if (!isAttached(arrow.from) || !isAttached(arrow.to) || arrow.from.port || arrow.to.port || arrow.from.shapeId === arrow.to.shapeId) continue;
    if (waypointsOf(arrow).length) continue;
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
    for (const which of ["from", "to"] as const) {
      const end = arrow[which];
      if (!isAttached(end) || !end.port) continue;
      const shape = shapeOf(end)!;
      const facing = portDirection(shape, end.port);
      const toward = minus(nextTo(arrow, which), portPoint(shape, end.port));
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
    const waypoints = waypointsOf(arrow);
    const spread = ranks.get(arrow.id);
    const fromShape = shapeOf(arrow.from);
    const toShape = shapeOf(arrow.to);
    const automatic = (end: Endpoint) => isAttached(end) && !end.port;
    /** The direction a port end leaves its shape in, if it is on a port. */
    const facing = (end: Endpoint): Point | null => (isAttached(end) && end.port ? portDirection(shapeOf(end)!, end.port) : null);

    if (arrow.route === "elbow") {
      paths.set(arrow.id, elbowPath(
        { at: from, shape: fromShape, facing: facing(arrow.from) },
        { at: to, shape: toShape, facing: facing(arrow.to) },
        waypoints,
        spread ? spread.rank * GAP : 0,
      ));
      continue;
    }

    /** The ends of a route through waypoints: an automatic end leaves its shape toward the waypoint next to it. */
    const ends = (): [Point, Point] => [
      automatic(arrow.from) ? outlinePoint(fromShape!, nextTo(arrow, "from")) : from,
      automatic(arrow.to) ? outlinePoint(toShape!, nextTo(arrow, "to")) : to,
    ];

    if (arrow.route === "curved" && waypoints.length) {
      // A smooth curve through the waypoints.
      const [start, end] = ends();
      paths.set(arrow.id, curveThrough([start, ...waypoints, end], facing(arrow.from), facing(arrow.to)));
      continue;
    }

    if (arrow.route === "curved") {
      const length = distance(from, to);
      const normal = spread?.normal ?? normalOf(from, to);
      const bend = spread ? spread.rank * SPREAD * length : BEND * length;
      /** A control point: out of its port in the direction it faces, or a third of the way along the bent chord. */
      const control = (end: Endpoint, at: Point, other: Point): Point => {
        const out = facing(end);
        return out ? plus(at, out, Math.max(REACH, length / 3)) : plus(plus(at, minus(other, at), 1 / 3), normal, bend);
      };
      const controls: [Point, Point] = [control(arrow.from, from, to), control(arrow.to, to, from)];
      // An automatic end leaves its shape toward its control point, the way the curve goes, so it never enters it.
      const start = automatic(arrow.from) ? outlinePoint(fromShape!, controls[0]) : from;
      const end = automatic(arrow.to) ? outlinePoint(toShape!, controls[1]) : to;
      paths.set(arrow.id, { points: [start, end], controls: [controls] });
      continue;
    }

    if (waypoints.length) {
      const [start, end] = ends();
      paths.set(arrow.id, { points: [start, ...waypoints, end], controls: null });
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
      points: [automatic(arrow.from) ? clip(fromShape!, to) : from, automatic(arrow.to) ? clip(toShape!, from) : to],
      controls: null,
    });
  }
  return paths;
}

/**
 * A smooth curve through points, as Catmull-Rom splines turned into Bézier pieces: at each point, the curve runs parallel
 * to the line between its neighbors. An end on a port leaves it in the direction the port faces.
 */
function curveThrough(points: Point[], startFacing: Point | null, endFacing: Point | null): Path {
  const last = points.length - 1;
  /** The tangent at a point, as a third of what the curve covers there. */
  const tangent = (index: number): Point => {
    if (index === 0) return startFacing ? scaled(startFacing, Math.max(REACH, distance(points[0], points[1]) / 3)) : scaled(minus(points[1], points[0]), 1 / 3);
    if (index === last) return endFacing ? scaled(endFacing, -Math.max(REACH, distance(points[last], points[last - 1]) / 3)) : scaled(minus(points[last], points[last - 1]), 1 / 3);
    return scaled(minus(points[index + 1], points[index - 1]), 1 / 6);
  };
  const controls = points.slice(1).map((to, index): [Point, Point] => [plus(points[index], tangent(index)), plus(to, tangent(index + 1), -1)]);
  return { points, controls };
}

/** An end of an elbow route: its anchor, its shape when it is attached, and the direction of its port when on one. */
interface ElbowEnd {
  at: Point;
  shape?: Outlined;
  facing: Point | null;
}
type Axis = "x" | "y";
const across = (axis: Axis): Axis => (axis === "x" ? "y" : "x");
/** The point at `along` on an axis and `side` on the other. */
const onAxis = (axis: Axis, along: number, side: number): Point => (axis === "x" ? { x: along, y: side } : { x: side, y: along });
/** The unit vector along an axis, toward the sign of `value` (forward when it is 0). */
const unit = (axis: Axis, value: number): Point => onAxis(axis, value < 0 ? -1 : 1, 0);
const axisOf = (vector: Point): Axis => (Math.abs(vector.x) >= Math.abs(vector.y) ? "x" : "y");

/** Below this, two coordinates are the same: what is left of rounding. */
const EPSILON = 1e-9;

/** How far an elbow route goes straight out of its end before it turns back. */
const STUB = 20;

/** The half sizes of the box that holds a shape, turned. */
function halfOf(shape: Outlined): Point {
  const radians = (shape.rotation * Math.PI) / 180;
  return {
    x: Math.abs((shape.w / 2) * Math.cos(radians)) + Math.abs((shape.h / 2) * Math.sin(radians)),
    y: Math.abs((shape.w / 2) * Math.sin(radians)) + Math.abs((shape.h / 2) * Math.cos(radians)),
  };
}

/** The box an elbow route keeps out of at an end: that of its shape, or its point when it is free. */
function boundsOf(end: ElbowEnd): { min: Point; max: Point } {
  if (!end.shape) return { min: end.at, max: end.at };
  const half = halfOf(end.shape);
  return { min: minus(end.shape, half), max: plus(end.shape, half) };
}

/** A line across `axis` that clears the boxes of both ends, below or to the right of them. */
const clearOf = (side: Axis, ...ends: ElbowEnd[]): number => Math.max(...ends.map((end) => boundsOf(end).max[side])) + STUB;

/**
 * The first points of an elbow route through waypoints, from an end toward the first waypoint: the point it leaves from
 * and, on a port, 20 straight ahead, then aside past its shape when the waypoint is behind it.
 */
function leaving(end: ElbowEnd, toward: Point): { points: Point[]; out: Point } {
  const { at, out } = elbowStart(end, toward, true, 0);
  if (!end.facing) return { points: [at], out };
  const axis = axisOf(out);
  const side = across(axis);
  const ahead = plus(at, out, STUB);
  if (out[axis] * (toward[axis] - ahead[axis]) >= 0) return { points: [at, ahead], out };
  const { min, max } = boundsOf(end);
  const lane = toward[side] > min[side] - STUB && toward[side] < max[side] + STUB ? clearOf(side, end) : toward[side];
  return { points: [at, ahead, onAxis(axis, ahead[axis], lane)], out };
}

/**
 * Where an elbow end leaves, and the direction it leaves in, horizontal or vertical, toward `toward`:
 * - on a port, from the port, along the side it is on; a corner port takes the side that faces `toward`;
 * - automatic, perpendicular to the side of the shape that faces `toward`: in line with `toward` when it is a waypoint
 *   that the side reaches, so that the route goes straight to it, or else from the middle of the side, moved by `shift`;
 * - free, from its point, along the axis on which `toward` is farther.
 */
function elbowStart(end: ElbowEnd, toward: Point, inLine: boolean, shift: number): { at: Point; out: Point } {
  const away = minus(toward, end.at);
  if (end.facing) {
    const { x, y } = end.facing;
    const axis: Axis = Math.abs(Math.abs(x) - Math.abs(y)) > EPSILON ? axisOf(end.facing) : x * away.x >= y * away.y ? "x" : "y";
    return { at: end.at, out: unit(axis, end.facing[axis]) };
  }
  const shape = end.shape;
  if (!shape) return { at: end.at, out: unit(axisOf(away), away[axisOf(away)]) };
  const half = halfOf(shape);
  const axis: Axis = Math.abs(away.x) / half.x >= Math.abs(away.y) / half.y ? "x" : "y";
  const side = across(axis);
  const lane = inLine && Math.abs(toward[side] - shape[side]) < half[side] ? toward[side] : shape[side] + shift;
  const out = unit(axis, away[axis]);
  const inside = contains(shape, onAxis(axis, shape[axis], lane)) ? onAxis(axis, shape[axis], lane) : { x: shape.x, y: shape.y };
  return { at: exitPoint(shape, inside, plus(inside, out)), out };
}

/**
 * The elbow route of an arrow: horizontal and vertical segments, which leave each end perpendicular to its side and pass
 * through the waypoints. Without waypoints, the route turns halfway between its ends, moved by `shift` to keep parallel
 * arrows apart; it goes around when an end faces away from the other.
 */
function elbowPath(from: ElbowEnd, to: ElbowEnd, waypoints: readonly Point[], shift: number): Path {
  if (waypoints.length) {
    const start = leaving(from, waypoints[0]);
    const end = leaving(to, waypoints[waypoints.length - 1]);
    const arrival = [...end.points].reverse();
    const points = [...start.points];
    // Each segment goes along the axis it left on, then turns into the next point.
    let axis = axisOf(start.out);
    for (const next of [...waypoints, arrival[0]]) {
      const last = points[points.length - 1];
      // The segment into the end arrives along its last segment, or along the direction the end leaves in.
      if (next === arrival[0]) axis = across(arrival.length > 1 ? axisOf(minus(arrival[1], arrival[0])) : axisOf(end.out));
      points.push(onAxis(axis, next[axis], last[across(axis)]), next);
      axis = across(axis);
    }
    return { points: simplified([...points, ...arrival.slice(1)]), controls: null };
  }
  const start = elbowStart(from, to.at, false, shift);
  const end = elbowStart(to, from.at, false, shift);
  const [a, b] = [start.at, end.at];
  const axis = axisOf(start.out);
  const side = across(axis);
  const pastStart = plus(a, start.out, STUB);
  const pastEnd = plus(b, end.out, STUB);
  let points: Point[];
  if (axisOf(end.out) === axis) {
    const ahead = start.out[axis] * (b[axis] - a[axis]) > 0 && end.out[axis] * (a[axis] - b[axis]) > 0;
    const [one, other] = [boundsOf(from), boundsOf(to)];
    // Whether the boxes of the ends are apart across the axis, with room for the route between them.
    const apart = one.max[side] + STUB <= other.min[side] || other.max[side] + STUB <= one.min[side];
    if (ahead || (start.out[axis] === end.out[axis] && apart)) {
      // Facing each other, the route turns halfway; facing the same way, past the farther end.
      const turn = ahead ? (a[axis] + b[axis]) / 2 + shift : start.out[axis] > 0 ? Math.max(pastStart[axis], pastEnd[axis]) : Math.min(pastStart[axis], pastEnd[axis]);
      points = [a, onAxis(axis, turn, a[side]), onAxis(axis, turn, b[side]), b];
    } else {
      // Otherwise the route goes around: halfway across between the boxes when they are apart, or else past both.
      const middle = (apart ? (Math.min(one.max[side], other.max[side]) + Math.max(one.min[side], other.min[side])) / 2 : clearOf(side, from, to)) + shift;
      points = [a, pastStart, onAxis(axis, pastStart[axis], middle), onAxis(axis, pastEnd[axis], middle), pastEnd, b];
    }
  } else if (start.out[axis] * (b[axis] - a[axis]) > 0 && end.out[side] * (a[side] - b[side]) > 0) points = [a, onAxis(axis, b[axis], a[side]), b];
  else points = [a, pastStart, onAxis(axis, pastStart[axis], pastEnd[side]), pastEnd, b];
  return { points: simplified(points), controls: null };
}

/**
 * Points without repeats, nor a point between its two neighbors on the same horizontal or vertical, where the route
 * does not turn. A point where the route goes back, such as a waypoint at the tip of a spike, is kept.
 */
function simplified(points: Point[]): Point[] {
  const same = (a: number, b: number) => Math.abs(a - b) < EPSILON;
  const between = (a: number, value: number, b: number) => (a - value) * (b - value) <= 0;
  const kept = points.filter((point, index) => index === 0 || !same(point.x, points[index - 1].x) || !same(point.y, points[index - 1].y));
  return kept.filter((point, index) => {
    if (index === 0 || index === kept.length - 1) return true;
    const [before, after] = [kept[index - 1], kept[index + 1]];
    if (same(before.x, point.x) && same(point.x, after.x)) return !between(before.y, point.y, after.y);
    if (same(before.y, point.y) && same(point.y, after.y)) return !between(before.x, point.x, after.x);
    return true;
  });
}

/** A piece of a path, between two of its points: a straight segment, or a Bézier curve through its two control points. */
interface Piece {
  from: Point;
  to: Point;
  controls: [Point, Point] | null;
}

const piecesOf = ({ points, controls }: Path): Piece[] => points.slice(1).map((to, index) => ({ from: points[index], to, controls: controls?.[index] ?? null }));

/** The point of a piece at `t`, from 0 at its start to 1 at its end. */
function pieceAt({ from, to, controls }: Piece, t: number): Point {
  if (!controls) return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  const u = 1 - t;
  const [a, b, c] = [u * u * u, 3 * u * u * t, 3 * u * t * t];
  const d = t * t * t;
  return {
    x: a * from.x + b * controls[0].x + c * controls[1].x + d * to.x,
    y: a * from.y + b * controls[0].y + c * controls[1].y + d * to.y,
  };
}

/** A curve is measured as this many straight pieces: less than a tenth of a unit off, on the curves of a diagram. */
const PIECES = 64;

/** The points of a path, from its start to its end: its own points, and as many as needed along a curve. */
function pointsOf(path: Path): Point[] {
  if (!path.controls) return path.points;
  return [path.points[0], ...piecesOf(path).flatMap((piece) => Array.from({ length: PIECES }, (_, index) => pieceAt(piece, (index + 1) / PIECES)))];
}

/** The point of a path a part `t` of its length along, from 0 at its start to 1 at its end: the place of its label. */
export function pointAlong(path: Path, t: number): Point {
  const points = pointsOf(path);
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  let left = lengths.reduce((sum, length) => sum + length, 0) * t;
  for (let index = 0; index < lengths.length; index++) {
    if (left <= lengths[index] || index === lengths.length - 1) {
      const part = lengths[index] === 0 ? 0 : Math.min(1, left / lengths[index]);
      return { x: points[index].x + (points[index + 1].x - points[index].x) * part, y: points[index].y + (points[index + 1].y - points[index].y) * part };
    }
    left -= lengths[index];
  }
  return points[0];
}

/** The SVG path data of a path. */
export const pathData = (path: Path): string =>
  `M${path.points[0].x},${path.points[0].y}` +
  piecesOf(path)
    .map(({ to, controls }) => (controls ? ` C${controls[0].x},${controls[0].y} ${controls[1].x},${controls[1].y} ${to.x},${to.y}` : ` L${to.x},${to.y}`))
    .join("");

/** The middle of each piece of a path, in order: where a handle adds a waypoint, or moves an elbow segment. */
export const middlesOf = (path: Path): Point[] => piecesOf(path).map((piece) => pieceAt(piece, 0.5));

/** Whether a segment of an arrow's path moves sideways when dragged: one between two corners of an elbow route. */
export const isShiftable = (route: Routed["route"], path: Path, index: number): boolean => route === "elbow" && index > 0 && index < path.points.length - 2;

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
 * shows past the tip. On a curve, the base is the point of the last piece `length` before the end, and it is cut there.
 */
export function headOf(path: Path, length: number): { line: Path; points: [Point, Point, Point] } {
  const pieces = piecesOf(path);
  const last = pieces[pieces.length - 1];
  const before = path.points.slice(0, -1);
  if (!last.controls || distance(last.from, last.to) <= length) {
    const { base, points } = arrowHead(last.from, last.to, length);
    return { line: { points: [...before, base], controls: path.controls && [...path.controls] }, points };
  }
  // The last point of the piece as far as `length` from the end, found by halving.
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (distance(pieceAt(last, middle), last.to) > length) low = middle;
    else high = middle;
  }
  const t = low;
  // The piece from 0 to t, by de Casteljau.
  const [p0, p1, p2, p3] = [last.from, last.controls[0], last.controls[1], last.to];
  const lerp = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp(p0, p1);
  const b = lerp(p1, p2);
  const c = lerp(p2, p3);
  const ab = lerp(a, b);
  const bc = lerp(b, c);
  const base = lerp(ab, bc);
  return { line: { points: [...before, base], controls: [...path.controls!.slice(0, -1), [a, ab]] }, points: arrowHead(base, last.to, length).points };
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

/**
 * Where a waypoint dragged to `point` goes: exactly in line with one of its neighbors, horizontally or vertically, when it
 * is within `reach` of that line, or else where it is. The reach is given in units of the drawing, as that of a port.
 */
export function snapWaypoint(point: Point, neighbors: readonly Point[], reach: number): Point {
  const nearest = (axis: Axis): number => {
    const near = neighbors.filter((neighbor) => Math.abs(neighbor[axis] - point[axis]) <= reach);
    return near.length ? near.reduce((a, b) => (Math.abs(b[axis] - point[axis]) < Math.abs(a[axis] - point[axis]) ? b : a))[axis] : point[axis];
  };
  return { x: nearest("x"), y: nearest("y") };
}

/**
 * The waypoints of an elbow route whose segment `index`, between two of its corners, is dragged by `delta`: the segment
 * moves sideways, and every corner of the route becomes a waypoint, so that the route keeps its shape.
 */
export function shiftSegment(path: Path, index: number, delta: Point): Point[] {
  const [a, b] = [path.points[index], path.points[index + 1]];
  // A vertical segment moves across, a level one up or down.
  const axis: Axis = Math.abs(a.x - b.x) < EPSILON ? "x" : "y";
  return path.points
    .map((point, position) => (position === index || position === index + 1 ? { ...point, [axis]: point[axis] + delta[axis] } : { ...point }))
    .slice(1, -1);
}
