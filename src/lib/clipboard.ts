// The clipboard of the Module, inside the View: the copied shapes and arrows, pasted as new ones, and the copied style,
// applied to other shapes or arrows. Pure functions of the model (diagram.ts), and of what the system clipboard holds: an
// internal copy marks it, so that the last copy wins, whether it was made in the diagram or elsewhere.

import { canBeCode } from "./code.ts";
import { type Arrow, type CodeBlock, type Diagram, newId, nextZ, type Shape } from "./diagram.ts";
import { type Endpoint, isAttached } from "./geometry.ts";
import { EMPHASES, styleWhole } from "./richtext.ts";

/** What Ctrl/Cmd+C copied: shapes, and the arrows whose two ends are within them. */
export interface Clip {
  shapes: Shape[];
  arrows: Arrow[];
}

/** The type under which an internal copy marks the system clipboard. */
export const CLIP_TYPE = "application/x-tessello-diagram";

/** The part of a DataTransfer these functions use. */
export interface ClipboardData {
  readonly types: readonly string[];
  readonly files: ArrayLike<File>;
  setData(type: string, value: string): void;
}

/**
 * Marks the system clipboard as holding an internal copy, with the texts of its shapes as plain text. Writing it replaces
 * any image copied elsewhere, and the marker tells a later paste that the copy of the diagram came last.
 */
export function markClipboard(data: Pick<ClipboardData, "setData">, clip: Clip): void {
  data.setData(CLIP_TYPE, String(clip.shapes.length + clip.arrows.length));
  data.setData("text/plain", clip.shapes.map((shape) => shape.text).filter(Boolean).join("\n"));
}

/** The image to paste from the system clipboard: none when it holds an internal copy, which came after any image. */
export function imageToPaste(data: Pick<ClipboardData, "types" | "files"> | null | undefined): File | undefined {
  if (!data || data.types.includes(CLIP_TYPE)) return undefined;
  return Array.from(data.files).find((file) => file.type.startsWith("image/"));
}

/** A copy of a part of the model, which no longer follows it: the model is plain JSON, and may be held by Svelte state. */
const copyOf = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Copies the selected shapes, and the arrows whose two ends are in the selection: an end attached to a selected shape,
 * or a free end of a selected arrow. What is copied no longer follows the diagram.
 */
export function copyItems(diagram: Diagram, ids: readonly string[]): Clip {
  const shapes = diagram.shapes.filter((shape) => ids.includes(shape.id));
  const within = (end: Endpoint, selected: boolean) => (isAttached(end) ? shapes.some((shape) => shape.id === end.shapeId) : selected);
  const arrows = diagram.arrows.filter((arrow) => {
    const selected = ids.includes(arrow.id);
    return within(arrow.from, selected) && within(arrow.to, selected);
  });
  return copyOf({ shapes, arrows });
}

/**
 * Pastes a copy as new shapes and arrows, moved by `offset` on each axis and put in front, in their order: its arrows
 * join the new shapes, and its groups are new groups, apart from the originals: a member copied without the rest of its
 * group is pasted out of any group. What is pasted is not locked, so that it can be moved from where it lands. Returns
 * the ids of what was pasted.
 */
export function pasteItems(diagram: Diagram, clip: Clip, offset: number, idOf: (prefix: string) => string = newId): string[] {
  const shapeIds = new Map(clip.shapes.map((shape) => [shape.id, idOf("shape")]));
  const groupIds = new Map<string, string>();
  const groupOf = (id: string | null) => {
    if (id === null || clip.shapes.filter((shape) => shape.groupId === id).length < 2) return null;
    if (!groupIds.has(id)) groupIds.set(id, idOf("group"));
    return groupIds.get(id)!;
  };
  const move = <P extends { x: number; y: number }>(point: P): P => ({ ...point, x: point.x + offset, y: point.y + offset });
  const endOf = (end: Endpoint): Endpoint => (isAttached(end) ? { shapeId: shapeIds.get(end.shapeId)!, port: end.port } : move(end));
  const top = nextZ(diagram);
  const items = [...clip.shapes, ...clip.arrows].sort((a, b) => a.z - b.z);
  const zOf = (item: Shape | Arrow) => top + items.indexOf(item);

  const shapes = clip.shapes.map((shape) => ({ ...copyOf(move(shape)), id: shapeIds.get(shape.id)!, groupId: groupOf(shape.groupId), locked: false, z: zOf(shape) }));
  const arrows = clip.arrows.map((arrow) => ({
    ...copyOf(arrow),
    id: idOf("arrow"),
    from: endOf(arrow.from),
    to: endOf(arrow.to),
    waypoints: arrow.waypoints.map(move),
    locked: false,
    z: zOf(arrow),
  }));
  diagram.shapes.push(...shapes);
  diagram.arrows.push(...arrows);
  return [...shapes, ...arrows].map((item) => item.id);
}

/** A copied style: of a shape, with its size when asked, or of an arrow. It applies to what is of the same kind. A shape's
 * bold, italic and underline are part of it, whatever its type. So is its code block: `code` is its language, or null for
 * a normal text; it goes only to the shapes that can be code.
 * The corner radius is that of a rectangle, and goes only to rectangles. */
export type Style =
  | { kind: "shape"; values: Partial<Pick<Shape, "color" | "opacity" | "fontSize" | "textAlign" | "textValign" | "bold" | "italic" | "underline" | "w" | "h" | "cornerRadius">> & { code: CodeBlock | null } }
  | { kind: "arrow"; values: Pick<Arrow, "heads" | "dashed" | "width" | "color" | "labelSize" | "route"> };

const isArrow = (item: Shape | Arrow): item is Arrow => "from" in item;

/** "Copy style": the style of a shape, with its width and height when `withSize`, or the style of an arrow. */
export function copyStyle(item: Shape | Arrow, withSize: boolean): Style {
  if (isArrow(item)) {
    const { heads, dashed, width, color, labelSize, route } = item;
    return { kind: "arrow", values: { heads, dashed, width, color, labelSize, route } };
  }
  const { color, opacity, fontSize, textAlign, textValign, w, h } = item;
  const text = { color, opacity, fontSize, textAlign, textValign, bold: item.bold === true, italic: item.italic === true, underline: item.underline === true };
  const style = item.type === "rect" && item.cornerRadius !== undefined ? { ...text, cornerRadius: item.cornerRadius } : text;
  const values = { ...style, code: item.code ? { language: item.code.language } : null };
  return { kind: "shape", values: withSize ? { ...values, w, h } : values };
}

/** "Paste style": applies a copied style to the shapes, or to the arrows, as it was copied from one or the other. */
export function applyStyle(style: Style, shapes: readonly Shape[], arrows: readonly Arrow[]): void {
  if (style.kind === "arrow") return void arrows.forEach((arrow) => Object.assign(arrow, style.values));
  const { cornerRadius, code, ...values } = style.values;
  for (const shape of shapes) {
    Object.assign(shape, values);
    // The style goes to the whole text: the runs no longer override it.
    for (const key of EMPHASES) if (typeof values[key] === "boolean") styleWhole(shape, key, values[key]);
    if (canBeCode(shape)) {
      if (code) shape.code = { language: code.language };
      else delete shape.code;
    }
    if (shape.type === "rect" && cornerRadius !== undefined) shape.cornerRadius = cornerRadius;
  }
}
