// The diagrams of the View, as Svelte state shared by its parts, kept in the Host storage (lib/storage.ts).
// A change is written at the end of each gesture, since the Host may unload the View without warning
// (CONVENTION.md §4). Diagrams that could not be read cannot be changed, so that an empty screen never overwrites them.
// Each change saved is also a step of the undo history (lib/history.ts), which starts over when a diagram is opened.
// Images are stored apart from the diagrams (lib/images.ts), read when a diagram shows them, and removed once nothing
// refers to them any more, the undo history included: when the View starts, when another diagram is opened, and after
// a change that takes an image away.
// The libraries of custom shapes (lib/library.ts) are read with the diagrams, and saved as each change is made in the
// shape editor, with the same indicator; they are not part of the undo history of a diagram.
// Following a link to another diagram keeps the diagrams it came from, which "← Back" opens again; opening a diagram
// from the list starts over.
// The creation defaults (lib/defaults.ts) are read with the diagrams and saved when they change, with the same
// indicator; they are not part of the undo history either.

import type { ConnectedModule } from "@tessello/sdk";
import type { Clip, Style } from "./clipboard.ts";
import { type Defaults, factoryDefaults } from "./defaults.ts";
import { type BuiltInType, type Diagram, type DiagramEntry, newDiagram, newId } from "./diagram.ts";
import { encodeImage } from "./encoding.ts";
import type { Point } from "./geometry.ts";
import { type History, isPresent, record, redo as redoInHistory, snapshotsOf, startHistory, undo as undoInHistory } from "./history.ts";
import { t, titleOf } from "./i18n.ts";
import { dropsImage, IMAGE_LIMIT, PLACED_BYTES, placeImage, type Size, unusedImages } from "./images.ts";
import { diagramsUsing, type ShapeLibrary } from "./library.ts";
import { type DiagramStorage, diagramStorage, reasonOf } from "./storage.ts";
import { entryBytes } from "./usage.ts";

export const diagrams = $state<{ list: DiagramEntry[]; open: Diagram | null }>({ list: [], open: null });

export const status = $state({
  /** False until the diagrams are read, and again while they cannot be read. */
  loaded: false,
  loadError: "",
  /** The number of writes not yet answered by the Host. */
  saving: 0,
  /** Set when the last write failed: what is on screen is not saved. */
  saveError: "",
  /** Why the last image could not be inserted, until the User closes the message or inserts another. */
  imageError: "",
  /** The shape whose link leads to a diagram that no longer exists, until the User closes the message or removes the link. */
  missingLink: null as string | null,
  /** The bytes the Module stores, out of `QUOTA` (lib/usage.ts); null until they are measured. */
  usage: null as number | null,
});

/** The libraries of custom shapes. */
export const shapeLibraries = $state<{ list: ShapeLibrary[] }>({ list: [] });

/** The creation defaults of new shapes and arrows. */
export const creation = $state<{ defaults: Defaults }>({ defaults: factoryDefaults() });

/** The images read so far, as data URLs, by key: null for an image that is missing from the storage. */
export const images = $state<Record<string, string | null>>({});

/** Select, draw an arrow, place a shape of a type, insert an image, or place the custom shape chosen in the palette. */
export type Tool = "select" | "arrow" | BuiltInType | "image" | "custom";

/** What the User is doing on the canvas, shared by the toolbar and the canvas. */
export const ui = $state({
  /** The canvas of the open diagram, or the shape editor: the View moves between them without the history of the browser. */
  screen: "diagram" as "diagram" | "shapes",
  tool: "select" as Tool,
  /** The definition the Custom tool places, chosen in the palette of the canvas. */
  customShape: null as { libraryId: string; shapeId: string } | null,
  /** The selected shapes and arrows, by id. */
  selection: [] as string[],
  /** Resizing keeps the center of the shape where it is, rather than its opposite corner. */
  resizeFromCenter: false,
  /** What Ctrl/Cmd+C copied, and how many times it was pasted since: each paste lands 40 units further. */
  clip: null as Clip | null,
  pastes: 0,
  /** What "Copy style" copied, and whether it copies the size of a shape too. */
  style: null as Style | null,
  styleWithSize: false,
  /** The diagrams followed links came from, by id, the last one on top: "← Back" opens it again. */
  trail: [] as string[],
});

let storage: DiagramStorage;
/** The diagram asked for by `params.id`, opened once the list is read. */
let requested: string | undefined;
/** Writes go one after the other, so that an older state never lands after a newer one. */
let writes = Promise.resolve();
/** The undo history of the open diagram. */
let history: History | null = null;
/** The images being read from the storage. */
const reading = new Set<string>();
/** The libraries as last saved, to tell whether a change takes an image away. */
let savedLibraries = "[]";

export function connectStore(host: ConnectedModule): void {
  storage = diagramStorage(host.storage);
}

/**
 * Reads the list and opens a diagram: the one asked for by the params, else the one already open, else the most
 * recently changed. A diagram whose last change could not be saved stays as it is on screen.
 */
export async function load(): Promise<void> {
  try {
    const stored = await storage.readIndex();
    const libraries = await storage.readLibraries();
    const defaults = await storage.readDefaults();
    // Libraries and defaults whose last change could not be saved stay as they are on screen, as a diagram does.
    if (!status.saveError) {
      shapeLibraries.list = libraries;
      savedLibraries = JSON.stringify(libraries);
      creation.defaults = defaults;
    }
    const unsaved = status.saveError ? diagrams.open : null;
    diagrams.list = unsaved ? [...stored.filter((entry) => entry.id !== unsaved.id), entryOf(unsaved)] : stored;
    const id = [requested, diagrams.open?.id].find((id) => id && diagrams.list.some((entry) => entry.id === id)) ?? mostRecent()?.id;
    requested = undefined;
    if (!(unsaved && id === unsaved.id)) show(id ? await storage.readDiagram(id) : null);
    status.loadError = "";
    status.loaded = true;
    void cleanImages();
  } catch (error) {
    blockOn(error);
  }
}

/** Diagrams that could not be read block editing until they are. */
function blockOn(error: unknown): void {
  status.loaded = false;
  status.loadError = t("load_error", { reason: reasonOf(error) });
}

/**
 * Opens a diagram, with nothing to undo. The open diagram read again as it was, when the View is shown again, keeps its
 * history; changed meanwhile, its history starts over, so that an undo never overwrites a change made elsewhere.
 */
function show(diagram: Diagram | null): void {
  const goesOn = diagram && history && diagram.id === diagrams.open?.id && isPresent(history, diagram);
  diagrams.open = diagram;
  if (!goesOn) history = diagram && startHistory(diagram);
}

const entryOf = ({ id, title, updatedAt }: Diagram): DiagramEntry => ({ id, title, updatedAt });

const mostRecent = () => diagrams.list.reduce<DiagramEntry | undefined>((best, entry) => (!best || entry.updatedAt > best.updatedAt ? entry : best), undefined);

/** Applies the params the View was opened with: `id` opens that diagram. */
export function applyParams(params: Record<string, string> = {}): void {
  if (!params.id) return;
  requested = params.id;
  ui.trail = [];
  if (status.loaded) void load();
}

export async function open(id: string): Promise<void> {
  if (id === diagrams.open?.id) return;
  status.missingLink = null;
  try {
    show(await storage.readDiagram(id));
  } catch (error) {
    return blockOn(error);
  }
  // The history of the diagram left is gone, and the images only it kept with it.
  return cleanImages();
}

/**
 * Writes the open diagram and the list now, and makes the change a step of the undo history. A failure is shown to
 * the User; the change stays on screen.
 */
export function save(): Promise<void> {
  const diagram = diagrams.open;
  if (!status.loaded || !diagram) return writes;
  const previous = history?.present;
  if (history) record(history, diagram);
  diagram.updatedAt = Date.now();
  const entry = entryOf(diagram);
  const at = diagrams.list.findIndex((item) => item.id === diagram.id);
  if (at === -1) diagrams.list.push(entry);
  else diagrams.list[at] = entry;
  const snapshot = $state.snapshot(diagram);
  const list = $state.snapshot(diagrams.list);
  const written = enqueue(() => storage.write(snapshot, list));
  // A change that takes an image away may leave it unused.
  if (previous && history && dropsImage(previous, history.present)) return cleanImages();
  return written;
}

/** Ctrl/Cmd+Z: brings the open diagram back to before its last change, and saves it. */
export const undo = (): Promise<void> => travel(undoInHistory);

/** Ctrl/Cmd+Shift+Z: makes again the last change undone, and saves it. */
export const redo = (): Promise<void> => travel(redoInHistory);

/** Moves the open diagram back or forth in its history, and saves it. */
function travel(move: (history: History, diagram: Diagram) => boolean): Promise<void> {
  const diagram = diagrams.open;
  if (!status.loaded || !diagram || !history || !move(history, diagram)) return writes;
  // What the step took away is no longer selected.
  const ids = new Set([...diagram.shapes, ...diagram.arrows].map((item) => item.id));
  ui.selection = ui.selection.filter((id) => ids.has(id));
  return save();
}

/** Runs a task of the storage after the others, so that each sees the writes before it. What it throws is returned. */
function queue<T>(task: () => Promise<T>): Promise<T> {
  const run = writes.then(task);
  writes = run.catch(() => {}).then(() => void (status.usage = storage.usage()));
  return run;
}

/** Queues a write after the others. A failure is shown to the User. */
function enqueue(write: () => Promise<void>): Promise<void> {
  status.saving++;
  return queue(async () => {
    try {
      await write();
      status.saveError = "";
    } catch (error) {
      status.saveError = (error as Error).message;
    } finally {
      status.saving--;
    }
  });
}

/**
 * Reads the images the open diagram shows and that are not read yet. One that cannot be read is asked again later; one
 * missing from the storage is null, and drawn as missing.
 */
export function requestImages(keys: Iterable<string>): void {
  for (const key of keys) {
    if (key in images || reading.has(key)) continue;
    reading.add(key);
    storage
      .readImage(key)
      .then((dataUrl) => (images[key] = dataUrl))
      .catch(() => {})
      .finally(() => reading.delete(key));
  }
}

/**
 * Stores a picture chosen or pasted: reduced and stored once, under the hash of its content. A picture that cannot be
 * read, is too large, or would fill the storage is refused: the message of the error thrown tells the User why.
 */
export async function storeImage(file: Blob): Promise<{ key: string; size: Size }> {
  let image;
  try {
    image = await encodeImage(file);
  } catch {
    throw new Error(t("image_unreadable"));
  }
  const bytes = entryBytes(image.key, image.dataUrl);
  if (bytes > IMAGE_LIMIT) throw new Error(t("image_too_large", { size: Math.ceil(bytes / 1024), limit: IMAGE_LIMIT / 1024 }));
  await queue(() => storage.writeImage(image!.key, image!.dataUrl, PLACED_BYTES));
  images[image.key] = image.dataUrl;
  return { key: image.key, size: image.size };
}

/**
 * Inserts a picture chosen or pasted, centered on a point, with its caption (`storeImage`). A picture refused is not
 * placed, and a message tells why.
 */
export async function insertImage(file: Blob, caption: string, at: Point): Promise<void> {
  const diagram = diagrams.open;
  if (!status.loaded || !diagram) return;
  status.imageError = "";
  try {
    const image = await storeImage(file);
    if (diagrams.open !== diagram) return;
    ui.selection = placeImage(diagram, { key: image.key, size: image.size, caption, at });
    await save();
  } catch (error) {
    status.imageError = (error as Error).message;
  }
}

/**
 * Removes the images nothing refers to: no stored diagram or custom shape, nor the open diagram, saved or not, nor a
 * step of its history, which an undo could bring back. Measures the usage of the storage again on the way. A failure
 * leaves the images for the next time.
 */
function cleanImages(): Promise<void> {
  return queue(async () => {
    const stored = await storage.readAll();
    const kept = [...(history ? snapshotsOf(history) : []), JSON.stringify($state.snapshot(diagrams.open)), JSON.stringify($state.snapshot(shapeLibraries.list))];
    const unused = unusedImages(stored, kept);
    if (unused.length) await storage.removeImages(unused);
    for (const key of unused) delete images[key];
  }).catch(() => {});
}

/** Opens a diagram chosen in the list: the way back of the links followed starts over. */
export function openFromList(id: string): Promise<void> {
  ui.trail = [];
  return open(id);
}

/** Creates "New diagram", opens it and saves it. The way back of the links followed starts over. */
export function create(): Promise<void> {
  ui.trail = [];
  status.missingLink = null;
  show(newDiagram(newId("diagram"), t("new_diagram"), Date.now()));
  return save();
}

/**
 * Creates an empty diagram with a title, without opening it, for a link to lead to; resolves with its id. A diagram
 * that cannot be written is taken out of the list, and the message of the error thrown tells the User why.
 */
export async function createLinked(title: string): Promise<string> {
  const diagram = newDiagram(newId("diagram"), titleOf(title), Date.now());
  diagrams.list.push(entryOf(diagram));
  const list = $state.snapshot(diagrams.list);
  try {
    await queue(() => storage.write(diagram, list));
  } catch (error) {
    diagrams.list = diagrams.list.filter((entry) => entry.id !== diagram.id);
    throw error;
  }
  return diagram.id;
}

/**
 * Follows the link of a shape to a diagram, which opens with the one it came from kept for "← Back". A diagram that no
 * longer exists opens nothing: the User is told, and can remove the link.
 */
export async function followLink(shapeId: string, target: string): Promise<void> {
  const from = diagrams.open;
  if (!from || target === from.id) return;
  if (!diagrams.list.some((entry) => entry.id === target)) {
    status.missingLink = shapeId;
    return;
  }
  ui.selection = [];
  await open(target);
  // "← Back" shows with the diagram reached, not before.
  if (diagrams.open?.id === target) ui.trail = [...ui.trail, from.id];
}

/** "← Back": opens again the diagram the last link followed came from. */
export async function goBack(): Promise<void> {
  const id = ui.trail.at(-1);
  if (!id) return;
  ui.selection = [];
  await open(id);
  if (diagrams.open?.id === id) ui.trail = ui.trail.slice(0, -1);
}

/** Removes the link of a shape of the open diagram, and saves it. */
export function removeLink(shapeId: string): Promise<void> {
  status.missingLink = null;
  const shape = diagrams.open?.shapes.find((shape) => shape.id === shapeId);
  if (!shape) return writes;
  shape.link = null;
  return save();
}

/** Renames the open diagram; an empty title becomes "Untitled". */
export function rename(title: string): Promise<void> {
  if (!diagrams.open) return writes;
  diagrams.open.title = titleOf(title);
  return save();
}

/** Deletes a diagram. If it was open, the first remaining one opens, or none. */
export async function remove(id: string): Promise<void> {
  if (!status.loaded) return;
  diagrams.list = diagrams.list.filter((entry) => entry.id !== id);
  ui.trail = ui.trail.filter((origin) => origin !== id);
  const list = $state.snapshot(diagrams.list);
  const removed = enqueue(() => storage.remove(id, list));
  if (diagrams.open?.id === id) {
    // The diagram that opens instead is taken from the list: the way back starts over.
    ui.trail = [];
    show(null);
    if (diagrams.list[0]) await open(diagrams.list[0].id);
  }
  await removed;
  return cleanImages();
}

/** Writes the libraries of custom shapes, as they are on screen. A change that takes an image away may leave it unused. */
export function saveLibraries(): Promise<void> {
  if (!status.loaded) return writes;
  const libraries = $state.snapshot(shapeLibraries.list);
  const next = JSON.stringify(libraries);
  const drops = dropsImage(savedLibraries, next);
  savedLibraries = next;
  const written = enqueue(() => storage.writeLibraries(libraries));
  return drops ? written.then(cleanImages) : written;
}

/** Changes the creation defaults, and writes them. */
export function saveDefaults(defaults: Defaults): Promise<void> {
  if (!status.loaded) return writes;
  creation.defaults = defaults;
  return enqueue(() => storage.writeDefaults(defaults));
}

/** How many diagrams have a shape drawn from a definition: those stored, with the open one as it is on screen. */
export async function diagramsUsingShape(libraryId: string, shapeId: string): Promise<number> {
  const stored = await queue(() => storage.readDiagrams());
  const open = diagrams.open && ($state.snapshot(diagrams.open) as Diagram);
  return diagramsUsing(open ? [...stored.filter((diagram) => diagram.id !== open.id), open] : stored, libraryId, shapeId);
}
