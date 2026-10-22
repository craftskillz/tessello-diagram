// The import of the files of the living-documentation editor (3.66.0): `.diagrams.json`, `.shape-libraries.json` and the
// pictures they refer to. Pure functions: the files are read by the View, which gives their text here and stores what
// comes back. The files are read defensively, as in diagram.ts: what cannot be read is skipped, a missing value takes
// its default, and nothing throws. The sizes and font size a node was saved without are those of the original editor,
// so that an imported drawing keeps its geometry.

import { labelPlacement, layoutArrows, pointAlong } from "./arrows.ts";
import { type Diagram, type Arrow, clampArrowWidth, isRecord, isText, LABEL_PLACEMENTS, listOf, newId, type Shape, readDiagram, type StoredFields } from "./diagram.ts";
import { type Endpoint } from "./geometry.ts";
import { DEFAULT_ANCHORS, outlineOf, readLibraries, type ShapeLibrary } from "./library.ts";

/** What a chosen file holds, once read: diagrams, libraries, or a refusal with a message key. */
export type ImportedFile =
  | { kind: "diagrams"; name: string; diagrams: unknown[] }
  | { kind: "libraries"; name: string; libraries: unknown[] }
  | { kind: "refused"; name: string; reason: "not_json" | "not_living_documentation" };

/**
 * Reads the text of a chosen JSON file. A JSON array is a `.diagrams.json`; an object with a `libraries` array is a
 * `.shape-libraries.json`; anything else, or text that is not JSON, is refused. The kind is told by the content, not by
 * the file name.
 */
export function readImportFile(name: string, text: string): ImportedFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "refused", name, reason: "not_json" };
  }
  if (Array.isArray(value)) return { kind: "diagrams", name, diagrams: value };
  if (isRecord(value) && Array.isArray(value.libraries)) return { kind: "libraries", name, libraries: value.libraries };
  return { kind: "refused", name, reason: "not_living_documentation" };
}

// ── The images ─────────────────────────────────────────────────────────────

/** The file name an `imageSrc` stands for: its last segment, e.g. "/images/foo.png" → "foo.png". A data URL or nothing has none. */
function fileNameOf(imageSrc: unknown): string | null {
  if (!isText(imageSrc) || /^data:/i.test(imageSrc.trim())) return null;
  return imageSrc.split(/[\\/]/).pop()?.trim() || null;
}

/** The objects of a list of a file; what is not an object is skipped. */
const recordsOf = (value: unknown): StoredFields[] => listOf(value, (item) => (isRecord(item) ? item : null));

/** The nodes of a diagram of a file that are images, and the definitions of a library of a file, as stored objects. */
const imageNodes = (diagram: unknown): StoredFields[] =>
  isRecord(diagram) ? recordsOf(diagram.nodes).filter((node) => node.shapeType === "image") : [];
const definitionsOf = (library: unknown): StoredFields[] => (isRecord(library) ? recordsOf(library.shapes) : []);

/**
 * The file names of the images the files refer to: the last segment of each `imageSrc` (of image nodes and of custom
 * shapes), e.g. "/images/foo.png" → "foo.png". Data URLs and empty values are not file names.
 */
export function imagesReferenced(files: readonly ImportedFile[]): Set<string> {
  const sources = files.flatMap((file) =>
    file.kind === "diagrams"
      ? file.diagrams.flatMap(imageNodes).map((node) => node.imageSrc)
      : file.kind === "libraries"
        ? file.libraries.flatMap(definitionsOf).map((definition) => definition.imageSrc)
        : [],
  );
  return new Set(sources.map(fileNameOf).filter((name): name is string => name !== null));
}

/**
 * The key of an image that was not provided. No storage holds it, so the shape is drawn with the frame of a missing
 * image, as one whose picture was lost, and the User sees what to add.
 */
const missingKey = (fileName: string): string => `image:missing:${fileName}`;

// ── The conversion ─────────────────────────────────────────────────────────

export interface ImportPlan {
  /** With new identifiers, ready to be stored. */
  diagrams: Diagram[];
  /** With new identifiers. */
  libraries: ShapeLibrary[];
  /** How many definitions of custom shapes the libraries hold. */
  shapes: number;
  /** The file names of the images that the files refer to and that were provided. */
  images: string[];
  /** The file names of the images that the files refer to and that were not provided, sorted. */
  missingImages: string[];
}

/** The size of a node saved without one, by `shapeType`, in the original editor. */
const ORIGINAL_SIZES: Record<string, { w: number; h: number }> = {
  box: { w: 100, h: 40 },
  ellipse: { w: 110, h: 50 },
  circle: { w: 55, h: 55 },
  database: { w: 50, h: 70 },
  actor: { w: 30, h: 52 },
  "post-it": { w: 120, h: 100 },
  "text-free": { w: 80, h: 30 },
  image: { w: 160, h: 120 },
};
const TYPES: Record<string, Shape["type"]> = {
  box: "rect",
  ellipse: "ellipse",
  database: "database",
  circle: "circle",
  actor: "actor",
  "post-it": "postit",
  "text-free": "text",
  image: "image",
  "custom-shape": "custom",
};
const HEADS: Record<string, Arrow["heads"]> = { to: "end", from: "start", both: "both", none: "none" };
/** The side of a custom shape whose definition is not there, as the original editor draws it. */
const SHAPE_SIDE = 65;

/** The font size of a text saved without one, in the original editor. */
const ORIGINAL_FONT_SIZE = 13;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
/** Radians, as the original editor keeps its angles, to degrees, to a hundredth. */
const degreesOf = (radians: unknown): number => (finite(radians) ? Math.round(((radians * 180) / Math.PI) * 100) / 100 : 0);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** A definition of a library of a file, found by its identifier, with the library it is in. */
type Found = { library: ShapeLibrary; definitionId: string };

/**
 * Converts the files to the model. `imageKeys` maps a file name to the key of the image stored for it (images.ts).
 * `idOf` makes the new identifiers, and `updatedAt` is the date of the imported diagrams, in milliseconds since the
 * epoch (0 unless the caller gives one, so that the conversion stays pure).
 */
export function planImport(
  files: readonly ImportedFile[],
  imageKeys: ReadonlyMap<string, string>,
  idOf: (prefix: string) => string = newId,
  updatedAt = 0,
): ImportPlan {
  const keyOf = (imageSrc: unknown): string | undefined => {
    const name = fileNameOf(imageSrc);
    return name === null ? undefined : (imageKeys.get(name) ?? missingKey(name));
  };

  // Libraries first: the custom shapes of the diagrams refer to their definitions, in any library, by identifier.
  const libraries = readLibraries(
    files.flatMap((file) => (file.kind === "libraries" ? file.libraries : [])).map((library) => (isRecord(library) ? convertLibrary(library, keyOf) : null)),
  ).map((library) => ({ ...library, id: idOf("library") }));
  const found = new Map<string, Found>();
  for (const library of libraries) for (const definition of library.shapes) if (!found.has(definition.id)) found.set(definition.id, { library, definitionId: definition.id });
  const definitions = new Map([...found].map(([id, { library }]) => [id, library.shapes.find((definition) => definition.id === id)!]));

  const stored = files.flatMap((file) => (file.kind === "diagrams" ? file.diagrams : [])).filter((diagram): diagram is StoredFields => isRecord(diagram) && isText(diagram.id));
  // Each diagram gets its own new id, even one whose id another file repeats; a link leads to the first of them.
  const ids = stored.map(() => idOf("diagram"));
  const newIds = new Map<string, string>();
  stored.forEach((diagram, index) => newIds.has(diagram.id as string) || newIds.set(diagram.id as string, ids[index]));

  const diagrams = stored.map((diagram, index) => {
    const converted = readDiagram(convertDiagram(diagram, { found, definitions, newIds, keyOf }), ids[index]);
    converted.updatedAt = updatedAt;
    placeLabels(converted, diagram, libraries);
    return converted;
  });

  const referenced = imagesReferenced(files);
  return {
    diagrams,
    libraries,
    shapes: libraries.reduce((sum, library) => sum + library.shapes.length, 0),
    images: [...referenced].filter((name) => imageKeys.has(name)).sort(),
    missingImages: [...referenced].filter((name) => !imageKeys.has(name)).sort(),
  };
}

/** A library of a file as a stored one: a definition without anchors has the default ones, as in the original editor. */
function convertLibrary(library: StoredFields, keyOf: (imageSrc: unknown) => string | undefined): StoredFields {
  return {
    id: library.id,
    name: library.name,
    shapes: listOf(library.shapes, (definition) => {
      if (!isRecord(definition)) return null;
      const anchors = Array.isArray(definition.anchors) && definition.anchors.length > 0 ? definition.anchors : DEFAULT_ANCHORS;
      return { ...definition, imageKey: keyOf(definition.imageSrc), anchors };
    }),
  };
}

interface Context {
  found: ReadonlyMap<string, Found>;
  definitions: ReadonlyMap<string, ShapeLibrary["shapes"][number]>;
  newIds: ReadonlyMap<string, string>;
  keyOf: (imageSrc: unknown) => string | undefined;
}

/** A diagram of a file as a stored one, to be read by `readDiagram`: the nodes first, in their order, then the edges. */
function convertDiagram(diagram: StoredFields, context: Context): StoredFields {
  const nodes = listOf(diagram.nodes, (node) => (isRecord(node) && isText(node.id) && finite(node.x) && finite(node.y) ? node : null));
  const byId = new Map(nodes.map((node) => [node.id as string, node]));
  const shapes = nodes.filter((node) => node.shapeType !== "anchor").map((node, z) => convertNode(node, z, context));
  const edges = recordsOf(diagram.edges);
  const arrows = edges.flatMap((edge, index) => {
    const from = endOf(byId, edge.from, edge.fromPort);
    const to = endOf(byId, edge.to, edge.toPort);
    return from && to ? [convertEdge(edge, from, to, shapes.length + index, diagram.edgesStraight === true)] : [];
  });
  return { title: diagram.title, shapes, arrows, grid: diagram.gridEnabled !== false, guides: diagram.alignGuides !== false };
}

/** The end of an edge at a node: free at an anchor node, attached to a shape otherwise, at a port or automatic. */
function endOf(nodes: ReadonlyMap<string, StoredFields>, id: unknown, port: unknown): Endpoint | null {
  const node = isText(id) ? nodes.get(id) : undefined;
  if (!node) return null;
  if (node.shapeType === "anchor") return { x: node.x as number, y: node.y as number };
  return { shapeId: node.id as string, port: isText(port) && port ? port : null };
}

function convertNode(node: StoredFields, z: number, { found, definitions, newIds, keyOf }: Context): StoredFields {
  // An unknown shape type is a box, with the size of one.
  const shapeType = isText(node.shapeType) && Object.hasOwn(TYPES, node.shapeType) ? node.shapeType : "box";
  const type = TYPES[shapeType];
  const definition = type === "custom" && isText(node.customShapeId) ? definitions.get(node.customShapeId) : undefined;
  const original = ORIGINAL_SIZES[shapeType] ?? (definition ? { w: definition.width, h: definition.height } : { w: SHAPE_SIDE, h: SHAPE_SIDE });
  const w = positive(node.nodeWidth) ? node.nodeWidth : original.w;
  const h = type === "circle" ? w : positive(node.nodeHeight) ? node.nodeHeight : original.h;
  const label = isText(node.label) ? node.label : "";
  const placement = LABEL_PLACEMENTS.includes(node.labelPlacement as never) ? node.labelPlacement : definition?.labelPlacement;
  const owner = definition && isText(node.customShapeId) ? found.get(node.customShapeId) : undefined;
  return {
    id: node.id,
    type,
    x: node.x,
    y: node.y,
    w,
    h,
    rotation: degreesOf(node.rotation),
    text: label,
    fontSize: positive(node.fontSize) ? node.fontSize : ORIGINAL_FONT_SIZE,
    textAlign: node.textAlign,
    textValign: node.textValign,
    textRotation: degreesOf(node.labelRotation),
    color: isText(node.colorKey) ? node.colorKey : undefined,
    opacity: finite(node.bgOpacity) ? clamp01(node.bgOpacity) : 1,
    groupId: node.groupId,
    locked: node.locked,
    link: convertLink(node.nodeLink, newIds),
    z,
    imageKey: type === "image" ? keyOf(node.imageSrc) : undefined,
    customShapeRef: { libraryId: owner?.library.id ?? "", shapeId: owner?.definitionId ?? "", name: definition?.name ?? label },
    labelPlacement: placement,
  };
}

/** A link to an imported diagram follows it to its new identifier; one to another diagram is kept as it is. */
function convertLink(link: unknown, newIds: ReadonlyMap<string, string>): unknown {
  if (!isRecord(link) || !isText(link.value)) return null;
  return link.type === "diagram" ? { type: "diagram", value: newIds.get(link.value) ?? link.value } : link;
}

function convertEdge(edge: StoredFields, from: Endpoint, to: Endpoint, z: number, straight: boolean): StoredFields {
  return {
    id: edge.id,
    from,
    to,
    route: straight ? "straight" : "curved",
    heads: isText(edge.arrowDir) && Object.hasOwn(HEADS, edge.arrowDir) ? HEADS[edge.arrowDir] : "end",
    dashed: edge.dashes === true,
    width: finite(edge.edgeWidth) ? clampArrowWidth(edge.edgeWidth) : undefined,
    color: isText(edge.edgeColor) && edge.edgeColor ? edge.edgeColor : undefined,
    label: edge.label,
    labelSize: edge.fontSize,
    labelWidth: edge.edgeLabelWidth,
    labelRotation: degreesOf(edge.labelRotation),
    locked: edge.edgeLocked,
    z,
  };
}

/**
 * The original draws the label of an edge at the middle of its line, moved by `(edgeLabelOffsetX, edgeLabelOffsetY)`.
 * Ours is a part of the length and a distance aside, so the arrows are laid out and the moved point is placed on them.
 */
function placeLabels(diagram: Diagram, source: StoredFields, libraries: readonly ShapeLibrary[]): void {
  const offsets = new Map<string, { x: number; y: number }>();
  for (const edge of recordsOf(source.edges)) {
    const x = finite(edge.edgeLabelOffsetX) ? edge.edgeLabelOffsetX : 0;
    const y = finite(edge.edgeLabelOffsetY) ? edge.edgeLabelOffsetY : 0;
    if (isText(edge.id) && (x !== 0 || y !== 0)) offsets.set(edge.id, { x, y });
  }
  if (offsets.size === 0) return;
  const paths = layoutArrows(new Map(diagram.shapes.map((shape) => [shape.id, outlineOf(libraries, shape)])), diagram.arrows);
  for (const arrow of diagram.arrows) {
    const path = paths.get(arrow.id);
    const offset = offsets.get(arrow.id);
    if (!path || !offset) continue;
    const middle = pointAlong(path, 0.5);
    ({ at: arrow.labelAt, offset: arrow.labelOffset } = labelPlacement(path, { x: middle.x + offset.x, y: middle.y + offset.y }));
  }
}
