// The clipboard of the Module, inside the View: the copied shapes and arrows, pasted as new ones, and the copied style,
// applied to other shapes or arrows. Pure functions of the model (diagram.ts).

import { type Arrow, type Diagram, newId, nextZ, type Shape } from "./diagram.ts";
import { type Endpoint, isAttached } from "./geometry.ts";

/** What Ctrl/Cmd+C copied: shapes, and the arrows whose two ends are within them. */
export interface Clip {
  shapes: Shape[];
  arrows: Arrow[];
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

/** A copied style: of a shape, with its size when asked, or of an arrow. It applies to what is of the same kind. */
export type Style =
  | { kind: "shape"; values: Partial<Pick<Shape, "color" | "opacity" | "fontSize" | "textAlign" | "textValign" | "w" | "h">> }
  | { kind: "arrow"; values: Pick<Arrow, "heads" | "dashed" | "width" | "color" | "labelSize" | "route"> };

const isArrow = (item: Shape | Arrow): item is Arrow => "from" in item;

/** "Copy style": the style of a shape, with its width and height when `withSize`, or the style of an arrow. */
export function copyStyle(item: Shape | Arrow, withSize: boolean): Style {
  if (isArrow(item)) {
    const { heads, dashed, width, color, labelSize, route } = item;
    return { kind: "arrow", values: { heads, dashed, width, color, labelSize, route } };
  }
  const { color, opacity, fontSize, textAlign, textValign, w, h } = item;
  return { kind: "shape", values: withSize ? { color, opacity, fontSize, textAlign, textValign, w, h } : { color, opacity, fontSize, textAlign, textValign } };
}

/** "Paste style": applies a copied style to the shapes, or to the arrows, as it was copied from one or the other. */
export function applyStyle(style: Style, shapes: readonly Shape[], arrows: readonly Arrow[]): void {
  for (const item of style.kind === "shape" ? shapes : arrows) Object.assign(item, style.values);
}
