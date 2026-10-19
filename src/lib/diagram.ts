// The model of a diagram, the one source of everything the canvas draws: shapes, and arrows whose ends are attached to
// a shape or free (geometry.ts). What the Host storage holds is read defensively, since an older version, an import or
// a hand-edited file may have written it: what cannot be read is skipped, and a missing value takes its creation value.
// The model is the whole one of the spec, so that what later versions store is read back without loss.

import { arrowEnds, type Endpoint, isAttached, type Point } from "./geometry.ts";

export const SHAPE_TYPES = ["rect", "ellipse", "database", "circle", "actor", "postit", "text", "image", "custom"] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

const TEXT_ALIGNS = ["left", "center", "right"] as const;
const TEXT_VALIGNS = ["top", "middle", "bottom"] as const;
const ROUTES = ["straight", "curved", "elbow"] as const;
const HEADS = ["none", "start", "end", "both"] as const;

export interface Shape {
  id: string;
  type: ShapeType;
  /** The center of the shape. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** In degrees, clockwise. */
  rotation: number;
  text: string;
  fontSize: number;
  textAlign: (typeof TEXT_ALIGNS)[number];
  textValign: (typeof TEXT_VALIGNS)[number];
  /** A key of the palette, such as "c-blue". */
  color: string;
  /** The opacity of the fill, from 0 to 1. */
  opacity: number;
  groupId: string | null;
  locked: boolean;
  link: string | null;
  /** The drawing order: higher is in front. */
  z: number;
}

export interface Arrow {
  id: string;
  from: Endpoint;
  to: Endpoint;
  route: (typeof ROUTES)[number];
  waypoints: Point[];
  heads: (typeof HEADS)[number];
  dashed: boolean;
  width: number;
  color: string;
  label: string;
  locked: boolean;
  z: number;
}

export interface Diagram {
  id: string;
  /** Shown as "Untitled" when empty, in the language of the User. */
  title: string;
  /** When the diagram was last changed, in milliseconds since the epoch. */
  updatedAt: number;
  shapes: Shape[];
  arrows: Arrow[];
  grid: boolean;
  guides: boolean;
}

/** An entry of the list of diagrams, kept under the key `diagrams`. */
export interface DiagramEntry {
  id: string;
  title: string;
  updatedAt: number;
}

/** A new rectangle centered on a point, with the creation values. */
export function newShape(id: string, at: Point, z: number): Shape {
  return {
    id,
    type: "rect",
    x: at.x,
    y: at.y,
    w: 120,
    h: 60,
    rotation: 0,
    text: "",
    fontSize: 14,
    textAlign: "center",
    textValign: "middle",
    color: "c-gray",
    opacity: 1,
    groupId: null,
    locked: false,
    link: null,
    z,
  };
}

/** A new arrow between two ends, with the creation values. */
export function newArrow(id: string, from: Endpoint, to: Endpoint, z: number): Arrow {
  return { id, from, to, route: "straight", waypoints: [], heads: "end", dashed: false, width: 2, color: "#64748b", label: "", locked: false, z };
}

export function newDiagram(id: string, title: string, updatedAt: number): Diagram {
  return { id, title, updatedAt, shapes: [], arrows: [], grid: true, guides: true };
}

/** Removes a shape. The ends of arrows attached to it become free, where they were drawn: no arrow disappears. */
export function removeShape(diagram: Diagram, id: string): void {
  const shapes = new Map(diagram.shapes.map((shape) => [shape.id, shape]));
  for (const arrow of diagram.arrows) {
    const ends = arrowEnds(shapes, arrow);
    if (!ends) continue;
    if (isAttached(arrow.from) && arrow.from.shapeId === id) arrow.from = ends.start;
    if (isAttached(arrow.to) && arrow.to.shapeId === id) arrow.to = ends.end;
  }
  diagram.shapes = diagram.shapes.filter((shape) => shape.id !== id);
}

/** A new identifier, unique enough for the shapes, arrows and diagrams of one User. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Defensive reading ──────────────────────────────────────────────────────

/** A stored object, before it is read. */
type StoredFields = Record<string, unknown>;

const isRecord = (value: unknown): value is StoredFields => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === "string";

const numberOr = (value: unknown, fallback: number) => (isNumber(value) ? value : fallback);
const positiveOr = (value: unknown, fallback: number) => (isNumber(value) && value > 0 ? value : fallback);
const textOr = (value: unknown, fallback: string) => (isText(value) ? value : fallback);
const oneOf = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T => (choices.includes(value as T) ? (value as T) : fallback);
const listOf = <T>(value: unknown, read: (item: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.map(read).filter((item): item is T => item !== null) : [];

/** The list of diagrams; nothing stored yet is an empty list. */
export function readIndex(value: unknown): DiagramEntry[] {
  return listOf(value, (entry) =>
    isRecord(entry) && isText(entry.id) ? { id: entry.id, title: textOr(entry.title, ""), updatedAt: numberOr(entry.updatedAt, 0) } : null,
  );
}

/** The diagram stored under `diagram:<id>`; a value that is not a diagram is an empty one. The key's id prevails. */
export function readDiagram(value: unknown, id: string): Diagram {
  const stored = isRecord(value) ? value : {};
  return {
    id,
    title: textOr(stored.title, ""),
    updatedAt: numberOr(stored.updatedAt, 0),
    shapes: listOf(stored.shapes, readShape),
    arrows: listOf(stored.arrows, readArrow),
    grid: stored.grid !== false,
    guides: stored.guides !== false,
  };
}

function readShape(value: unknown): Shape | null {
  if (!isRecord(value) || !isText(value.id) || !isNumber(value.x) || !isNumber(value.y)) return null;
  const shape = newShape(value.id, { x: value.x, y: value.y }, numberOr(value.z, 0));
  return {
    ...shape,
    type: oneOf(SHAPE_TYPES, value.type, shape.type),
    w: positiveOr(value.w, shape.w),
    h: positiveOr(value.h, shape.h),
    rotation: numberOr(value.rotation, shape.rotation),
    text: textOr(value.text, shape.text),
    fontSize: positiveOr(value.fontSize, shape.fontSize),
    textAlign: oneOf(TEXT_ALIGNS, value.textAlign, shape.textAlign),
    textValign: oneOf(TEXT_VALIGNS, value.textValign, shape.textValign),
    color: textOr(value.color, shape.color),
    opacity: isNumber(value.opacity) && value.opacity >= 0 && value.opacity <= 1 ? value.opacity : shape.opacity,
    groupId: isText(value.groupId) ? value.groupId : null,
    locked: value.locked === true,
    link: isText(value.link) ? value.link : null,
  };
}

function readEndpoint(value: unknown): Endpoint | null {
  if (!isRecord(value)) return null;
  if (isText(value.shapeId)) return { shapeId: value.shapeId, port: isText(value.port) ? value.port : null };
  if (isNumber(value.x) && isNumber(value.y)) return { x: value.x, y: value.y };
  return null;
}

const readPoint = (value: unknown): Point | null => (isRecord(value) && isNumber(value.x) && isNumber(value.y) ? { x: value.x, y: value.y } : null);

function readArrow(value: unknown): Arrow | null {
  if (!isRecord(value) || !isText(value.id)) return null;
  const from = readEndpoint(value.from);
  const to = readEndpoint(value.to);
  if (!from || !to) return null;
  const arrow = newArrow(value.id, from, to, numberOr(value.z, 0));
  return {
    ...arrow,
    route: oneOf(ROUTES, value.route, arrow.route),
    waypoints: listOf(value.waypoints, readPoint),
    heads: oneOf(HEADS, value.heads, arrow.heads),
    dashed: value.dashed === true,
    width: positiveOr(value.width, arrow.width),
    color: textOr(value.color, arrow.color),
    label: textOr(value.label, arrow.label),
    locked: value.locked === true,
  };
}
