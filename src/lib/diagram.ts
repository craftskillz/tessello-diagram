// The model of a diagram, the one source of everything the canvas draws: shapes, and arrows whose ends are attached to
// a shape or free (geometry.ts). What the Host storage holds is read defensively, since an older version, an import or
// a hand-edited file may have written it: what cannot be read is skipped, and a missing value takes its creation value.
// The model is the whole one of the spec, so that what later versions store is read back without loss.

import { endOf, layoutArrows, startOf } from "./arrows.ts";
import { type Endpoint, isAttached, type Outlined, type Point } from "./geometry.ts";
import { baseOf, EMPHASES, fromSpans, type SpanStyle, spansOf, type TextRun } from "./richtext.ts";

export const SHAPE_TYPES = ["rect", "ellipse", "database", "circle", "actor", "postit", "text", "table", "image", "custom"] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

/** The shapes drawn by the tools of the toolbar, in its order. */
export const BUILT_IN_TYPES = ["rect", "ellipse", "database", "circle", "actor", "postit", "text", "table"] as const satisfies readonly ShapeType[];
export type BuiltInType = (typeof BUILT_IN_TYPES)[number];

/** The palette of the living-documentation editor, by key: the colors of each key are in base.css, in a light and a dark variant. */
export const COLORS = [
  "c-white", "c-black", "c-gray", "c-slate", "c-blue", "c-sky", "c-cyan", "c-teal", "c-green", "c-lime",
  "c-yellow", "c-amber", "c-orange", "c-red", "c-rose", "c-pink", "c-purple", "c-indigo",
] as const;

/**
 * The size and color of a new shape, by type. The sizes are a little larger than those of the living-documentation
 * editor (its rectangle was 100 × 40), so that a new shape holds a word or two; the defaults are set by ticket 11.
 */
const CREATION: Record<ShapeType, { w: number; h: number; color: string }> = {
  rect: { w: 120, h: 60, color: "c-gray" },
  ellipse: { w: 120, h: 60, color: "c-gray" },
  database: { w: 60, h: 80, color: "c-gray" },
  circle: { w: 60, h: 60, color: "c-gray" },
  // The actor keeps the proportions of its silhouette, 30 × 52.
  actor: { w: 36, h: 62.4, color: "c-gray" },
  postit: { w: 120, h: 100, color: "c-amber" },
  text: { w: 120, h: 30, color: "c-gray" },
  // A table of 3 × 3 cells, each about 80 × 30.
  table: { w: 240, h: 90, color: "c-gray" },
  image: { w: 160, h: 120, color: "c-gray" },
  custom: { w: 96, h: 96, color: "c-gray" },
};

/** The font sizes a shape's text can take. */
export const FONT_SIZES = { min: 6, max: 72 };

/** A font size within `FONT_SIZES`, in whole units. */
export const clampFontSize = (size: number): number => Math.min(FONT_SIZES.max, Math.max(FONT_SIZES.min, Math.round(size)));

/** The widths an arrow's line can take, by steps of 0.5. */
export const ARROW_WIDTHS = { min: 1, max: 8, step: 0.5 };

/** A line width within `ARROW_WIDTHS`, on one of its steps. */
export const clampArrowWidth = (width: number): number =>
  Math.min(ARROW_WIDTHS.max, Math.max(ARROW_WIDTHS.min, Math.round(width / ARROW_WIDTHS.step) * ARROW_WIDTHS.step));

/** Whether a shape always keeps its proportions when resized: the actor's silhouette, and the circle. */
export const keepsRatio = (type: ShapeType): boolean => type === "actor" || type === "circle";

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const TEXT_VALIGNS = ["top", "middle", "bottom"] as const;
export const ROUTES = ["straight", "curved", "elbow"] as const;
/** Where the text of a custom shape goes: outside its picture, on one side, or over it. */
export const LABEL_PLACEMENTS = ["below", "above", "right", "left", "center"] as const;
export type LabelPlacement = (typeof LABEL_PLACEMENTS)[number];

/** The definition a custom shape is drawn from, in the shape editor, and its name when it was placed, shown if the definition is deleted. */
export interface CustomShapeRef {
  libraryId: string;
  shapeId: string;
  name: string;
}
export const HEADS = ["none", "start", "end", "both"] as const;

/** Where a shape leads, followed by Shift+click: a page opened in a new tab, or another diagram, by its id. */
export type ShapeLink = { type: "url"; value: string } | { type: "diagram"; value: string };

/**
 * The URL a link opens. Without a scheme, a URL would be resolved against the document of the View, a srcdoc, and lead
 * nowhere: it gets `https://`. Only `http(s)://`, `mailto:` and `tel:` are kept as they are, so a link never runs a script.
 */
export function withScheme(url: string): string {
  if (/^https?:\/\//i.test(url) || /^(mailto|tel):/i.test(url)) return url;
  return `https://${url.replace(/^\/\//, "")}`;
}

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
  /** The rotation of the text around the center of the shape, in degrees, clockwise, added to that of the shape. */
  textRotation: number;
  /** A key of the palette, such as "c-blue". */
  color: string;
  /** The opacity of the fill, from 0 to 1. */
  opacity: number;
  groupId: string | null;
  locked: boolean;
  link: ShapeLink | null;
  /** The drawing order: higher is in front. */
  z: number;
  /** An image: the key of its picture in the storage, `image:<sha256>` (images.ts). */
  imageKey?: string;
  /** A custom shape: its definition, and where its text goes, taken from its definition and changed on the shape itself. */
  customShapeRef?: CustomShapeRef;
  labelPlacement?: LabelPlacement;
  /** A table: the text of its cells, by row then column; every row has as many cells, and there is at least one. */
  cells?: string[][];
  /** A table: the width of each column, as a part of the width of the table; one per column, they sum to 1. */
  columns?: number[];
  /** A table: the height of each row, as a part of the height of the table; one per row, they sum to 1. */
  rows?: number[];
  /** A rectangle: the radius of its corners, in units of the drawing, as asked; drawn within half its smallest side (geometry.ts). */
  cornerRadius?: number;
  /** The text style of the shape, on its whole text; absent is off. For a table, the style of the cells that have none of their own. */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /**
   * The ranges of `text` whose style differs from the shape's own (richtext.ts): sorted, without overlap, never empty;
   * absent when the whole text has the style of the shape. The text of a table cell or of an arrow label has none.
   */
  textRuns?: TextRun[];
  /** A table: the style of each cell, by row then column, as many as `cells`; `{}` is a cell that follows the table. */
  cellStyles?: CellStyle[][];
}

/** The style of a table cell's background and text; a key that is absent follows the table. The background is a key of `COLORS`, and the text color goes with it as for a shape. */
export interface CellStyle {
  color?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: (typeof TEXT_ALIGNS)[number];
  textValign?: (typeof TEXT_VALIGNS)[number];
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
  /** A key of the palette, such as "c-blue"; a CSS color written by an older version is drawn as it is. */
  color: string;
  label: string;
  labelSize: number;
  /** The width the label's lines wrap within; null for its automatic width, where its lines do not wrap. */
  labelWidth: number | null;
  /** In degrees, clockwise. */
  labelRotation: number;
  /** Where the label is along the line, as a part of its length, from 0 at its start to 1 at its end. */
  labelAt: number;
  /** How far the label is moved aside from the line, a quarter turn clockwise from the way the line goes. */
  labelOffset: number;
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

/** The radius of the corners of a rectangle, in units of the drawing: that of a new one, and of a stored one that has none. */
export const CORNER_RADIUS = 6;

/** A new shape centered on a point, with the creation values of its type. */
export function newShape(id: string, at: Point, z: number, type: ShapeType = "rect"): Shape {
  const { w, h, color } = CREATION[type];
  const table = type === "table" ? { cells: Array.from({ length: 3 }, () => ["", "", ""]), columns: [1 / 3, 1 / 3, 1 / 3], rows: [1 / 3, 1 / 3, 1 / 3], cellStyles: Array.from({ length: 3 }, () => [{}, {}, {}]) } : {};
  return {
    ...table,
    ...(type === "rect" ? { cornerRadius: CORNER_RADIUS } : {}),
    id,
    type,
    x: at.x,
    y: at.y,
    w,
    h,
    rotation: 0,
    text: "",
    fontSize: 14,
    textAlign: "center",
    textValign: "middle",
    textRotation: 0,
    color,
    opacity: 1,
    groupId: null,
    locked: false,
    link: null,
    z,
  };
}

/** A new arrow between two ends, with the creation values. */
export function newArrow(id: string, from: Endpoint, to: Endpoint, z: number): Arrow {
  return {
    id,
    from,
    to,
    route: "straight",
    waypoints: [],
    heads: "end",
    dashed: false,
    width: 2,
    color: "c-slate",
    label: "",
    labelSize: 12,
    labelWidth: null,
    labelRotation: 0,
    labelAt: 0.5,
    labelOffset: 0,
    locked: false,
    z,
  };
}

export function newDiagram(id: string, title: string, updatedAt: number): Diagram {
  return { id, title, updatedAt, shapes: [], arrows: [], grid: true, guides: true };
}

/**
 * Removes a shape. The ends of arrows attached to it become free, where they were drawn: no arrow disappears, unless
 * `withArrows` asks to remove them too, but a locked arrow stays. `outline` gives a custom shape the anchors of its
 * definition (library.ts).
 */
export function removeShape(diagram: Diagram, id: string, { withArrows = false, outline = (shape: Shape): Outlined => shape } = {}): void {
  const attached = (end: Endpoint) => isAttached(end) && end.shapeId === id;
  if (withArrows) diagram.arrows = diagram.arrows.filter((arrow) => arrow.locked || (!attached(arrow.from) && !attached(arrow.to)));
  const paths = layoutArrows(new Map(diagram.shapes.map((shape) => [shape.id, outline(shape)])), diagram.arrows);
  for (const arrow of diagram.arrows) {
    const path = paths.get(arrow.id);
    if (!path) continue;
    if (attached(arrow.from)) arrow.from = { ...startOf(path) };
    if (attached(arrow.to)) arrow.to = { ...endOf(path) };
  }
  diagram.shapes = diagram.shapes.filter((shape) => shape.id !== id);
}

/** Makes the ends of an arrow attached to a port automatic: they then aim at the next point of the arrow, wherever it is. */
export function detachEnds(arrow: Arrow): void {
  if (isAttached(arrow.from)) arrow.from = { shapeId: arrow.from.shapeId, port: null };
  if (isAttached(arrow.to)) arrow.to = { shapeId: arrow.to.shapeId, port: null };
}

/** Brings items to the front of the drawing, or sends them to the back, keeping their order among themselves. */
export function reorder(diagram: Diagram, ids: readonly string[], where: "front" | "back"): void {
  const items = [...diagram.shapes, ...diagram.arrows].sort((a, b) => a.z - b.z);
  const moved = items.filter((item) => ids.includes(item.id));
  const others = items.filter((item) => !ids.includes(item.id));
  (where === "front" ? [...others, ...moved] : [...moved, ...others]).forEach((item, z) => (item.z = z));
}

/** Gives the selected shapes one new group; fewer than two shapes are not grouped. Whether they were. */
export function groupShapes(diagram: Diagram, ids: readonly string[]): boolean {
  const members = diagram.shapes.filter((shape) => ids.includes(shape.id));
  if (members.length < 2) return false;
  const groupId = newId("group");
  for (const shape of members) shape.groupId = groupId;
  return true;
}

/** The groups that the selected shapes belong to. */
const groupsOf = (diagram: Diagram, ids: readonly string[]): Set<string> =>
  new Set(diagram.shapes.filter((shape) => ids.includes(shape.id) && shape.groupId).map((shape) => shape.groupId!));

/** Clears the groups the selection touches, from all their members. */
export function ungroupShapes(diagram: Diagram, ids: readonly string[]): void {
  const groups = groupsOf(diagram, ids);
  for (const shape of diagram.shapes) if (shape.groupId && groups.has(shape.groupId)) shape.groupId = null;
}

/** A selection with every member of the groups it touches: selecting a member selects its group. */
export function withGroups(diagram: Diagram, ids: readonly string[]): string[] {
  const groups = groupsOf(diagram, ids);
  const members = diagram.shapes.filter((shape) => shape.groupId && groups.has(shape.groupId)).map((shape) => shape.id);
  return [...new Set([...ids, ...members])];
}

/** The drawing order of an item put in front of all the others. */
export const nextZ = (diagram: Diagram): number => Math.max(-1, ...diagram.shapes.map((shape) => shape.z), ...diagram.arrows.map((arrow) => arrow.z)) + 1;

/** A new identifier, unique enough for the shapes, arrows and diagrams of one User. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Defensive reading ──────────────────────────────────────────────────────

/** A stored object, before it is read. */
export type StoredFields = Record<string, unknown>;

export const isRecord = (value: unknown): value is StoredFields => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const isText = (value: unknown): value is string => typeof value === "string";

const numberOr = (value: unknown, fallback: number) => (isNumber(value) ? value : fallback);
const positiveOr = (value: unknown, fallback: number) => (isNumber(value) && value > 0 ? value : fallback);
const textOr = (value: unknown, fallback: string) => (isText(value) ? value : fallback);
export const oneOf = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T => (choices.includes(value as T) ? (value as T) : fallback);
export const listOf = <T>(value: unknown, read: (item: unknown) => T | null): T[] =>
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
  const shape = newShape(value.id, { x: value.x, y: value.y }, numberOr(value.z, 0), oneOf(SHAPE_TYPES, value.type, "rect"));
  const text = textOr(value.text, shape.text);
  const own = baseOf(value);
  return {
    ...shape,
    w: positiveOr(value.w, shape.w),
    h: positiveOr(value.h, shape.h),
    rotation: numberOr(value.rotation, shape.rotation),
    text,
    fontSize: isNumber(value.fontSize) ? clampFontSize(value.fontSize) : shape.fontSize,
    textAlign: oneOf(TEXT_ALIGNS, value.textAlign, shape.textAlign),
    textValign: oneOf(TEXT_VALIGNS, value.textValign, shape.textValign),
    textRotation: numberOr(value.textRotation, shape.textRotation),
    color: textOr(value.color, shape.color),
    opacity: isNumber(value.opacity) && value.opacity >= 0 && value.opacity <= 1 ? value.opacity : shape.opacity,
    groupId: isText(value.groupId) ? value.groupId : null,
    locked: value.locked === true,
    link: readLink(value.link),
    ...(value.bold === true ? { bold: true } : {}),
    ...(value.italic === true ? { italic: true } : {}),
    ...(value.underline === true ? { underline: true } : {}),
    ...readTextRuns(value.textRuns, text, own),
    ...(shape.type === "rect" ? { cornerRadius: isNumber(value.cornerRadius) && value.cornerRadius >= 0 ? value.cornerRadius : CORNER_RADIUS } : {}),
    ...(shape.type === "image" && isText(value.imageKey) ? { imageKey: value.imageKey } : {}),
    ...(shape.type === "custom" ? readCustom(value) : {}),
    ...(shape.type === "table" ? readTable(value) : {}),
  };
}

/**
 * The text runs of a shape, if any: the records with an integer range and at least one boolean style, clamped into the
 * text, then normalized (sorted, overlaps resolved with the later run winning, runs that repeat the shape's own style dropped).
 */
function readTextRuns(value: unknown, text: string, own: SpanStyle): Pick<Shape, "textRuns"> {
  const runs: TextRun[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!isRecord(item) || !Number.isInteger(item.start) || !Number.isInteger(item.end)) continue;
    const start = Math.max(0, item.start as number);
    const end = Math.min(text.length, item.end as number);
    const styles = EMPHASES.filter((key) => typeof item[key] === "boolean");
    if (start >= end || styles.length === 0) continue;
    runs.push({ start, end, ...Object.fromEntries(styles.map((key) => [key, item[key]])) });
  }
  const { textRuns } = fromSpans(spansOf({ text, textRuns: runs, ...own }), own);
  return textRuns ? { textRuns } : {};
}

/**
 * The cells, column widths, row heights and cell styles of a table. Rows that are not lists are skipped, short ones are
 * padded with empty cells, and what is not text is an empty cell; a table has one cell at least. Column widths (and row
 * heights) that are not one positive number per column (or row) are replaced by equal ones, and the others are scaled to
 * sum to 1. The styles of the cells are padded or truncated to the cells, each keeping only its valid keys; anything
 * else is a cell that follows the table.
 */
function readTable(value: StoredFields): Pick<Shape, "cells" | "columns" | "rows" | "cellStyles"> {
  const lines = Array.isArray(value.cells) ? value.cells.filter(Array.isArray) : [];
  const count = Math.max(1, ...lines.map((row) => row.length));
  const cells = lines.length ? lines.map((row) => Array.from({ length: count }, (_, col) => textOr(row[col], ""))) : [[""]];
  /** The parts stored for `length` lines: scaled to sum to 1, or equal when they do not fit. */
  const partsOf = (stored: unknown, length: number): number[] => {
    const parts = Array.isArray(stored) ? stored : [];
    const total = parts.reduce((sum: number, part) => sum + (isNumber(part) ? part : 0), 0);
    const valid = parts.length === length && parts.every((part) => isNumber(part) && part > 0);
    return valid ? parts.map((part: number) => part / total) : Array.from({ length }, () => 1 / length);
  };
  const styles = Array.isArray(value.cellStyles) ? value.cellStyles : [];
  return {
    cells,
    columns: partsOf(value.columns, count),
    rows: partsOf(value.rows, cells.length),
    cellStyles: cells.map((row, r) => row.map((_, c) => readCellStyle(Array.isArray(styles[r]) ? styles[r][c] : undefined))),
  };
}

/** The valid keys of the stored style of a cell; a style that is not a record follows the table. */
function readCellStyle(value: unknown): CellStyle {
  if (!isRecord(value)) return {};
  const style: CellStyle = {};
  if (isText(value.color)) style.color = value.color;
  if (isNumber(value.fontSize)) style.fontSize = clampFontSize(value.fontSize);
  for (const key of ["bold", "italic", "underline"] as const) if (typeof value[key] === "boolean") style[key] = value[key];
  if (TEXT_ALIGNS.includes(value.textAlign as never)) style.textAlign = value.textAlign as CellStyle["textAlign"];
  if (TEXT_VALIGNS.includes(value.textValign as never)) style.textValign = value.textValign as CellStyle["textValign"];
  return style;
}

/** The definition of a custom shape and where its text goes; one without a definition is drawn as a deleted one. */
function readCustom(value: StoredFields): Pick<Shape, "customShapeRef" | "labelPlacement"> {
  const ref = isRecord(value.customShapeRef) ? value.customShapeRef : {};
  return {
    customShapeRef: { libraryId: textOr(ref.libraryId, ""), shapeId: textOr(ref.shapeId, ""), name: textOr(ref.name, "") },
    labelPlacement: oneOf(LABEL_PLACEMENTS, value.labelPlacement, "below"),
  };
}

function readLink(value: unknown): ShapeLink | null {
  if (!isRecord(value) || !isText(value.value) || !value.value.trim()) return null;
  if (value.type === "url") return { type: "url", value: withScheme(value.value.trim()) };
  if (value.type === "diagram") return { type: "diagram", value: value.value };
  return null;
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
    width: isNumber(value.width) ? clampArrowWidth(value.width) : arrow.width,
    color: textOr(value.color, arrow.color),
    label: textOr(value.label, arrow.label),
    labelSize: isNumber(value.labelSize) ? clampFontSize(value.labelSize) : arrow.labelSize,
    labelWidth: isNumber(value.labelWidth) && value.labelWidth > 0 ? value.labelWidth : null,
    labelRotation: numberOr(value.labelRotation, arrow.labelRotation),
    labelAt: isNumber(value.labelAt) ? Math.min(1, Math.max(0, value.labelAt)) : arrow.labelAt,
    labelOffset: numberOr(value.labelOffset, arrow.labelOffset),
    locked: value.locked === true,
  };
}
