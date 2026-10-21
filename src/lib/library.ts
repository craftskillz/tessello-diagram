// The custom shapes, made in the shape editor from pictures and kept under the key `shapes`: libraries of definitions,
// each with its picture, its size, where its text goes, whether the palette of the canvas offers it, and its anchors,
// the ports of the shapes drawn from it. A shape of a diagram refers to its definition, so that a change of the
// definition shows on every shape drawn from it. Pure functions; what is stored is read defensively, as in diagram.ts.

import { type Diagram, isRecord, isText, LABEL_PLACEMENTS, type LabelPlacement, listOf, newId, newShape, nextZ, oneOf, type Shape } from "./diagram.ts";
import { type Anchor, type Outlined, type Point } from "./geometry.ts";

/** A definition of a custom shape. Its picture is an image of the storage (images.ts), which it needs to be saved. */
export interface CustomShape {
  id: string;
  name: string;
  imageKey: string;
  width: number;
  height: number;
  labelPlacement: LabelPlacement;
  showInDiagram: boolean;
  anchors: Anchor[];
}

export interface ShapeLibrary {
  id: string;
  name: string;
  shapes: CustomShape[];
}

/** The sizes a definition can take, and its size when created. */
export const SHAPE_SIZE = { min: 16, max: 1200, initial: 65 };

/** The longest name of a definition. */
export const NAME_LENGTH = 120;

/** The eight anchors of a new definition, at the corners and the middles of the sides, from north clockwise. */
export const DEFAULT_ANCHORS: readonly Anchor[] = [
  { id: "N", x: 0.5, y: 0 },
  { id: "NE", x: 1, y: 0 },
  { id: "E", x: 1, y: 0.5 },
  { id: "SE", x: 1, y: 1 },
  { id: "S", x: 0.5, y: 1 },
  { id: "SW", x: 0, y: 1 },
  { id: "W", x: 0, y: 0.5 },
  { id: "NW", x: 0, y: 0 },
];

/** A size within `SHAPE_SIZE`, in whole units; what is not a size is the creation size. */
export const clampShapeSize = (size: unknown): number =>
  typeof size === "number" && Number.isFinite(size) ? Math.min(SHAPE_SIZE.max, Math.max(SHAPE_SIZE.min, Math.round(size))) : SHAPE_SIZE.initial;

/** A part of a side, from 0 to 1; what is not a number is 0. */
export const clampPart = (part: unknown): number => (typeof part === "number" && Number.isFinite(part) ? Math.min(1, Math.max(0, part)) : 0);

/**
 * Anchors whose identifiers are unique: an identifier trimmed, or `p<position>` when there is none, and one already
 * taken by an anchor before it is followed by `-2`, `-3` and so on.
 */
export function uniqueAnchors(anchors: readonly { id?: unknown; x: number; y: number }[]): Anchor[] {
  const taken = new Set<string>();
  return anchors.map((anchor, index) => {
    const id = untaken((typeof anchor.id === "string" && anchor.id.trim()) || `p${index + 1}`, taken);
    taken.add(id);
    return { id, x: anchor.x, y: anchor.y };
  });
}

/** An identifier, or if it is taken, the first of `<id>-2`, `<id>-3` and so on that is not. */
function untaken(id: string, taken: ReadonlySet<string>): string {
  let unique = id;
  for (let suffix = 2; taken.has(unique); suffix++) unique = `${id}-${suffix}`;
  return unique;
}

/** An anchor added at a point of a definition: `p<n>`, the first such identifier it does not have yet. */
export function addAnchor(anchors: readonly Anchor[], at: Point): Anchor[] {
  let number = anchors.length + 1;
  while (anchors.some((anchor) => anchor.id === `p${number}`)) number++;
  return [...anchors, { id: `p${number}`, x: clampPart(at.x), y: clampPart(at.y) }];
}

/**
 * Renames an anchor: to an identifier another anchor has, followed by `-2`, `-3` and so on, so that the others keep
 * theirs and the arrows attached to them; to nothing, it keeps its identifier.
 */
export function renameAnchor(anchors: readonly Anchor[], index: number, id: string): Anchor[] {
  const others = new Set(anchors.filter((_, position) => position !== index).map((anchor) => anchor.id));
  const unique = untaken(id.trim() || anchors[index].id, others);
  return anchors.map((anchor, position) => (position === index ? { ...anchor, id: unique } : anchor));
}

/** A definition being made in the shape editor: it is saved once it has a picture. */
export type Draft = Omit<CustomShape, "imageKey"> & { imageKey: string | null };

/** A new definition in a library, not saved until it has a picture. */
export function newCustomShape(id: string, name: string): Draft {
  return {
    id,
    name,
    imageKey: null,
    width: SHAPE_SIZE.initial,
    height: SHAPE_SIZE.initial,
    labelPlacement: "below",
    showInDiagram: true,
    anchors: DEFAULT_ANCHORS.map((anchor) => ({ ...anchor })),
  };
}

/** The definition a shape of a diagram is drawn from, if it is still there. */
export function definitionOf(libraries: readonly ShapeLibrary[], shape: Pick<Shape, "customShapeRef">): CustomShape | undefined {
  const ref = shape.customShapeRef;
  return ref && libraries.find((library) => library.id === ref.libraryId)?.shapes.find((definition) => definition.id === ref.shapeId);
}

/** The key of the picture a shape shows: that of an image, or of the definition of a custom shape, if it is still there. */
export function pictureKeyOf(libraries: readonly ShapeLibrary[], shape: Shape): string | undefined {
  return shape.type === "custom" ? definitionOf(libraries, shape)?.imageKey : shape.imageKey;
}

/** A shape as the geometry sees it: a custom shape has the anchors of its definition, none when it is deleted. */
export function outlineOf(libraries: readonly ShapeLibrary[], shape: Shape): Outlined & Shape {
  if (shape.type !== "custom") return shape;
  return { ...shape, anchors: definitionOf(libraries, shape)?.anchors ?? [] };
}

/** The definitions the palette of the canvas offers, with their library, in order. */
export function paletteOf(libraries: readonly ShapeLibrary[]): { library: ShapeLibrary; shape: CustomShape }[] {
  return libraries.flatMap((library) => library.shapes.filter((shape) => shape.showInDiagram).map((shape) => ({ library, shape })));
}

/** Places a shape of a definition, centered on a point, in front: at the size of its definition, with its name as text. */
export function placeCustomShape(diagram: Diagram, library: ShapeLibrary, definition: CustomShape, at: Point): Shape {
  const shape: Shape = {
    ...newShape(newId("shape"), at, nextZ(diagram), "custom"),
    w: definition.width,
    h: definition.height,
    text: definition.name,
    customShapeRef: { libraryId: library.id, shapeId: definition.id, name: definition.name },
    labelPlacement: definition.labelPlacement,
  };
  diagram.shapes.push(shape);
  return shape;
}

/** How many of the diagrams have a shape drawn from a definition of a library. */
export const diagramsUsing = (diagrams: readonly Diagram[], libraryId: string, shapeId: string): number =>
  diagrams.filter((diagram) => diagram.shapes.some(({ customShapeRef: ref }) => ref?.libraryId === libraryId && ref.shapeId === shapeId)).length;

// ── Defensive reading ──────────────────────────────────────────────────────

/** The libraries stored under `shapes`; nothing stored yet is no library. A definition without a picture is skipped. */
export function readLibraries(value: unknown): ShapeLibrary[] {
  return listOf(value, (library) =>
    isRecord(library) && isText(library.id) ? { id: library.id, name: isText(library.name) ? library.name : "", shapes: listOf(library.shapes, readShape) } : null,
  );
}

/** A definition; one without an id or a picture is not one. */
function readShape(value: unknown): CustomShape | null {
  if (!isRecord(value) || !isText(value.id) || !isText(value.imageKey)) return null;
  return {
    id: value.id,
    name: isText(value.name) ? value.name.slice(0, NAME_LENGTH) : "",
    imageKey: value.imageKey,
    width: clampShapeSize(value.width),
    height: clampShapeSize(value.height),
    labelPlacement: oneOf(LABEL_PLACEMENTS, value.labelPlacement, "below"),
    showInDiagram: value.showInDiagram !== false,
    anchors: uniqueAnchors(listOf(value.anchors, (anchor) => (isRecord(anchor) ? { id: anchor.id, x: clampPart(anchor.x), y: clampPart(anchor.y) } : null))),
  };
}
