// The export of a diagram as a `.drawio` file, which app.diagrams.net opens: an uncompressed mxGraph model, with one cell
// per shape, group, arrow and label. draw.io places a shape by its top-left corner, where the model keeps its center.
// Its colors are those of the light variant of the palette (base.css), and its images are embedded as data URLs, as
// they are kept in the storage, so that the file shows them offline. Pure functions of the model (diagram.ts).

import { layoutArrows, type Path, pointAlong } from "./arrows.ts";
import type { Arrow, Diagram, LabelPlacement, Shape } from "./diagram.ts";
import { degrees, type Endpoint, isAttached, lidOf, type Outlined, type Point, portPoint, portsOf } from "./geometry.ts";
import { outlineOf, pictureKeyOf, type ShapeLibrary } from "./library.ts";
import { boundsOf } from "./placement.ts";

/** The colors of each key of the palette, in its light variant (base.css): fill, outline and text. */
const PALETTE: Record<string, { fill: string; stroke: string; text: string }> = {
  "c-gray": { fill: "#f5f5f4", stroke: "#a8a29e", text: "#292524" },
  "c-slate": { fill: "#f1f5f9", stroke: "#64748b", text: "#0f172a" },
  "c-blue": { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e40af" },
  "c-sky": { fill: "#e0f2fe", stroke: "#0ea5e9", text: "#0c4a6e" },
  "c-cyan": { fill: "#cffafe", stroke: "#06b6d4", text: "#164e63" },
  "c-teal": { fill: "#ccfbf1", stroke: "#14b8a6", text: "#134e4a" },
  "c-green": { fill: "#dcfce7", stroke: "#22c55e", text: "#166534" },
  "c-lime": { fill: "#ecfccb", stroke: "#84cc16", text: "#365314" },
  "c-amber": { fill: "#fef9c3", stroke: "#f59e0b", text: "#78350f" },
  "c-orange": { fill: "#ffedd5", stroke: "#f97316", text: "#7c2d12" },
  "c-red": { fill: "#fee2e2", stroke: "#ef4444", text: "#7f1d1d" },
  "c-rose": { fill: "#ffe4e6", stroke: "#f43f5e", text: "#881337" },
  "c-pink": { fill: "#fce7f3", stroke: "#ec4899", text: "#831843" },
  "c-purple": { fill: "#ede9fe", stroke: "#8b5cf6", text: "#4c1d95" },
  "c-indigo": { fill: "#e0e7ff", stroke: "#6366f1", text: "#312e81" },
};

/** The ink of the labels of arrows, and their background, which hides the line under them: those of the light theme (base.css). */
const INK = "#1d2026";
const BACKGROUND = "#ffffff";

/** The layer every cell is in, under the root cell "0". */
const LAYER = "1";

/** A number as draw.io reads it: whole when it is, else with three decimals at most. */
const num = (value: number): string => (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0");

/** A value within an attribute of the XML. */
const attribute = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");

/** A text as the HTML of a label, which draw.io shows with `html=1`: its lines are kept. */
const html = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

const styleOf = (parts: readonly string[]): string => `${parts.join(";")};`;

/** The size of the cell of a shape: that of its box, but a circle is as wide as the smaller side of its box. */
function sizeOf(shape: Shape): { w: number; h: number } {
  if (shape.type !== "circle") return { w: shape.w, h: shape.h };
  const side = Math.min(shape.w, shape.h);
  return { w: side, h: side };
}

/** The picture of an image or of a custom shape, as a data URL: null when it is missing, or its definition deleted. */
type Picture = string | null;

/**
 * A data URL as draw.io reads it within a style, which it splits at each `;`: `data:image/png;base64,…` becomes
 * `data:image/png,…`, the form draw.io decodes as base64.
 */
const imageValue = (dataUrl: string): string => dataUrl.replace(/^data:([^;,]+);base64,/i, "data:$1,");

/** Where the text of a custom shape goes, outside its picture or over it. */
const PLACEMENTS: Record<LabelPlacement, string[]> = {
  below: ["verticalLabelPosition=bottom", "verticalAlign=top", "labelPosition=center", "align=center"],
  above: ["verticalLabelPosition=top", "verticalAlign=bottom", "labelPosition=center", "align=center"],
  right: ["labelPosition=right", "align=left", "verticalLabelPosition=middle", "verticalAlign=middle"],
  left: ["labelPosition=left", "align=right", "verticalLabelPosition=middle", "verticalAlign=middle"],
  center: ["labelPosition=center", "align=center", "verticalLabelPosition=middle", "verticalAlign=middle"],
};

/** A picture missing, or a custom shape whose definition is deleted: a dashed frame, in the muted ink of the light theme. */
const MISSING = ["rounded=0", "dashed=1", "fillColor=none", "strokeColor=#6b7280"];

/**
 * The draw.io shape of a shape, whether it has a body to fill, whose colors it then takes, and whether its text is
 * over it, wrapped within its width, rather than outside.
 */
function outlineStyle(shape: Shape, picture: Picture): { parts: string[]; body: boolean; inside: boolean } {
  switch (shape.type) {
    case "image":
      return { parts: picture ? ["shape=image", "imageAspect=0", `image=${imageValue(picture)}`] : [...MISSING], body: false, inside: true };
    case "custom": {
      const placement = shape.labelPlacement ?? "below";
      const outline = picture ? ["shape=image", "imageAspect=0", `image=${imageValue(picture)}`] : [...MISSING];
      return { parts: [...outline, ...PLACEMENTS[placement]], body: false, inside: placement === "center" };
    }
    case "ellipse":
      return { parts: ["ellipse"], body: true, inside: true };
    case "circle":
      return { parts: ["ellipse", "aspect=fixed"], body: true, inside: true };
    case "database":
      return { parts: ["shape=cylinder3", "boundedLbl=1", "backgroundOutline=1", `size=${num(lidOf(shape.h))}`], body: true, inside: true };
    case "actor":
      return { parts: ["shape=umlActor", "verticalLabelPosition=bottom", "verticalAlign=top"], body: true, inside: false };
    case "postit":
      return { parts: ["shape=note", `size=${num(Math.min(shape.w, shape.h) * 0.18)}`], body: true, inside: true };
    case "text":
      return { parts: ["text", "strokeColor=none", "fillColor=none"], body: false, inside: true };
    default:
      return { parts: ["rounded=1", "absoluteArcSize=1", "arcSize=12"], body: true, inside: true };
  }
}

/** The cell a shape is in: the layer, or its group, whose top-left corner its box is placed from. */
type Parent = { id: string; x: number; y: number };
const ROOT: Parent = { id: LAYER, x: 0, y: 0 };

/** The cell of a shape: its style and its box, from its top-left corner, within its parent. */
function shapeCell(shape: Shape, parent: Parent, pictureOf: (shape: Shape) => Picture): string {
  const colors = PALETTE[shape.color] ?? PALETTE["c-gray"];
  const picture = pictureOf(shape);
  const { parts, body, inside } = outlineStyle(shape, picture);
  // A text outside its shape, such as below an actor, does not wrap within its width.
  if (inside) parts.push("whiteSpace=wrap");
  parts.push("html=1");
  if (body) parts.push(`fillColor=${colors.fill}`, `strokeColor=${colors.stroke}`);
  parts.push(`fontColor=${colors.text}`);
  // The opacity of a shape is that of its fill; that of a picture is of the whole picture.
  if (shape.opacity < 1) parts.push(`${body ? "fillOpacity" : "opacity"}=${Math.round(shape.opacity * 100)}`);
  parts.push(`fontSize=${shape.fontSize}`);
  if (inside && shape.type !== "custom") parts.push(`align=${shape.textAlign}`, `verticalAlign=${shape.textValign}`);
  if (shape.rotation) parts.push(`rotation=${num(shape.rotation)}`);
  const { w, h } = sizeOf(shape);
  const geometry = `<mxGeometry x="${num(shape.x - w / 2 - parent.x)}" y="${num(shape.y - h / 2 - parent.y)}" width="${num(w)}" height="${num(h)}" as="geometry"/>`;
  // A custom shape whose definition is deleted shows its name, unless it has a text.
  const text = shape.type === "custom" && !picture ? shape.text || (shape.customShapeRef?.name ?? "") : shape.text;
  return `<mxCell id="${attribute(shape.id)}" value="${attribute(html(text))}" style="${attribute(styleOf(parts))}" vertex="1" parent="${attribute(parent.id)}">${geometry}</mxCell>`;
}

/**
 * The cells of a group of two shapes or more: the group around them, then its members within it, which draw.io draws
 * together, where the first of them is in the drawing order.
 */
function groupCells(id: string, members: readonly Shape[], pictureOf: (shape: Shape) => Picture): string {
  const bounds = boundsOf(members)!;
  const group = { id, x: bounds.x, y: bounds.y };
  const geometry = `<mxGeometry x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.w)}" height="${num(bounds.h)}" as="geometry"/>`;
  return `<mxCell id="${attribute(id)}" value="" style="group;" vertex="1" connectable="0" parent="${LAYER}">${geometry}</mxCell>` + members.map((shape) => shapeCell(shape, group, pictureOf)).join("");
}

/** The colors of an arrow: a key of the palette is drawn in its outline color, a CSS color of an older version as it is. */
const strokeOf = (color: string): string => PALETTE[color]?.stroke ?? color;

/** The edge style of each route of an arrow. */
const EDGE_STYLES: Record<Arrow["route"], string[]> = {
  straight: ["edgeStyle=none"],
  elbow: ["edgeStyle=orthogonalEdgeStyle"],
  curved: ["edgeStyle=none", "curved=1"],
};

/**
 * Where a port is on the cell of its shape, as draw.io places an end (`exitX`/`entryX`…): as parts of its width and
 * height from its top-left corner, before its rotation, which draw.io applies.
 */
function portOn(shape: Outlined & Shape, port: string): Point {
  const at = portPoint({ ...shape, x: 0, y: 0, rotation: 0 }, port);
  const { w, h } = sizeOf(shape);
  return { x: at.x / w + 0.5, y: at.y / h + 0.5 };
}

/** What an end of an arrow adds to its style and its cell: its shape and its port, or nothing for a free end. */
function endOf(outlines: ReadonlyMap<string, Outlined & Shape>, end: Endpoint, which: "exit" | "entry"): { parts: string[]; cell: string } {
  if (!isAttached(end)) return { parts: [], cell: "" };
  const shape = outlines.get(end.shapeId)!;
  const cell = ` ${which === "exit" ? "source" : "target"}="${attribute(shape.id)}"`;
  // An automatic end, or one on a port its shape does not have, leaves from the outline, where draw.io puts it.
  if (end.port === null || !portsOf(shape).includes(end.port)) return { parts: [], cell };
  const at = portOn(shape, end.port);
  return { parts: [`${which}X=${num(at.x)}`, `${which}Y=${num(at.y)}`, `${which}Dx=0`, `${which}Dy=0`, `${which}Perimeter=0`], cell };
}

/**
 * The point that bends a curve without waypoints in draw.io, which would otherwise draw it straight. draw.io takes it as
 * the control point of one quadratic piece, whose middle is halfway between that point and the middle of the chord: it
 * is placed so that this middle is that of the curve as drawn.
 */
function bendOf(path: Path): Point {
  const middle = pointAlong(path, 0.5);
  const [start, end] = [path.points[0], path.points[path.points.length - 1]];
  return { x: 2 * middle.x - (start.x + end.x) / 2, y: 2 * middle.y - (start.y + end.y) / 2 };
}

/** The cell of an arrow, along its path. */
function arrowCell(arrow: Arrow, path: Path, outlines: ReadonlyMap<string, Outlined & Shape>): string {
  const exit = endOf(outlines, arrow.from, "exit");
  const entry = endOf(outlines, arrow.to, "entry");
  const parts = [...EDGE_STYLES[arrow.route], "rounded=0", "html=1"];
  parts.push(`startArrow=${arrow.heads === "start" || arrow.heads === "both" ? "classic" : "none"}`, "startFill=1");
  parts.push(`endArrow=${arrow.heads === "end" || arrow.heads === "both" ? "classic" : "none"}`, "endFill=1");
  if (arrow.dashed) parts.push("dashed=1");
  parts.push(`strokeWidth=${num(arrow.width)}`, `strokeColor=${strokeOf(arrow.color)}`, ...exit.parts, ...entry.parts);
  const points = arrow.route === "curved" && !arrow.waypoints.length ? [bendOf(path)] : arrow.waypoints;
  const point = (at: Point, as = "") => `<mxPoint x="${num(at.x)}" y="${num(at.y)}"${as && ` as="${as}"`}/>`;
  const inner = [
    isAttached(arrow.from) ? "" : point(arrow.from, "sourcePoint"),
    isAttached(arrow.to) ? "" : point(arrow.to, "targetPoint"),
    points.length ? `<Array as="points">${points.map((at) => point(at)).join("")}</Array>` : "",
  ].join("");
  return (
    `<mxCell id="${attribute(arrow.id)}" value="" style="${attribute(styleOf(parts))}" edge="1" parent="${LAYER}"${exit.cell}${entry.cell}>` +
    `<mxGeometry relative="1" as="geometry">${inner}</mxGeometry></mxCell>` +
    labelCell(arrow)
  );
}

/**
 * The cell of the label of an arrow, a child of its edge: draw.io places it from −1 at the start of the line to 1 at its
 * end, and aside counterclockwise from the way the line goes, where the model goes clockwise. None without a label.
 */
function labelCell(arrow: Arrow): string {
  if (!arrow.label) return "";
  const parts = ["edgeLabel", "html=1", "align=center", "verticalAlign=middle", "resizable=0", "points=[]", `fontSize=${arrow.labelSize}`, `fontColor=${INK}`, `labelBackgroundColor=${BACKGROUND}`];
  if (arrow.labelWidth) parts.push("whiteSpace=wrap");
  if (degrees(arrow.labelRotation)) parts.push(`rotation=${degrees(arrow.labelRotation)}`);
  const width = arrow.labelWidth ? ` width="${num(arrow.labelWidth)}"` : "";
  return (
    `<mxCell id="${attribute(`${arrow.id}-label`)}" value="${attribute(html(arrow.label))}" style="${attribute(styleOf(parts))}" vertex="1" connectable="0" parent="${attribute(arrow.id)}">` +
    `<mxGeometry x="${num(arrow.labelAt * 2 - 1)}" y="${num(-arrow.labelOffset)}"${width} relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`
  );
}

/**
 * The `.drawio` file of a diagram. `libraries` give custom shapes their picture and anchors, and `images` the data URLs
 * of the pictures, by key. `droppedRotations` counts what draw.io cannot show: a text turned apart from its shape.
 */
export function toDrawio(diagram: Diagram, libraries: readonly ShapeLibrary[], images: Readonly<Record<string, string | null>>): { xml: string; droppedRotations: number } {
  const pictureOf = (shape: Shape): Picture => {
    const key = pictureKeyOf(libraries, shape);
    return (key && images[key]) || null;
  };
  const outlines = new Map(diagram.shapes.map((shape) => [shape.id, outlineOf(libraries, shape)]));
  const paths = layoutArrows(outlines, diagram.arrows);
  const items = [...diagram.shapes, ...diagram.arrows].sort((a, b) => a.z - b.z);
  const members = (groupId: string) => items.filter((item): item is Shape => !("from" in item) && item.groupId === groupId);
  const placed = new Set<string>();
  const cells = items.map((item) => {
    // An arrow whose shape is not there is not drawn, nor exported.
    if ("from" in item) return paths.has(item.id) ? arrowCell(item, paths.get(item.id)!, outlines) : "";
    const group = item.groupId ? members(item.groupId) : [];
    if (group.length < 2) return shapeCell(item, ROOT, pictureOf);
    if (placed.has(item.groupId!)) return "";
    placed.add(item.groupId!);
    return groupCells(item.groupId!, group, pictureOf);
  });
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<mxfile host="Tessello" type="device"><diagram id="${attribute(diagram.id)}" name="${attribute(diagram.title)}">` +
    `<mxGraphModel grid="${diagram.grid ? 1 : 0}" gridSize="20" guides="${diagram.guides ? 1 : 0}" page="0" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="${LAYER}" parent="0"/>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
  return { xml, droppedRotations: diagram.shapes.filter((shape) => degrees(shape.textRotation) !== 0).length };
}

/** The longest name of an exported file, before its extension. */
const NAME_LENGTH = 80;

/**
 * The name of a file exported from a diagram: its title, its letters and digits kept, accents included, and each run of
 * anything else, spaces included, made one `_`. A title with nothing left is “diagram”.
 */
export function fileNameOf(title: string, extension: string): string {
  const name = title
    .replace(/[^\p{L}\p{N}.-]+/gu, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, NAME_LENGTH);
  return `${name || "diagram"}.${extension}`;
}
