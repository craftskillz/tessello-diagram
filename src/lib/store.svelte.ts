// The diagrams of the View, as Svelte state shared by its parts, kept in the Host storage (lib/storage.ts).
// A change is written at the end of each gesture, since the Host may unload the View without warning
// (CONVENTION.md §4). Diagrams that could not be read cannot be changed, so that an empty screen never overwrites them.

import type { ConnectedModule } from "@tessello/sdk";
import { type BuiltInType, type Diagram, type DiagramEntry, newDiagram, newId } from "./diagram.ts";
import { t, titleOf } from "./i18n.ts";
import { type DiagramStorage, diagramStorage, reasonOf } from "./storage.ts";

export const diagrams = $state<{ list: DiagramEntry[]; open: Diagram | null }>({ list: [], open: null });

export const status = $state({
  /** False until the diagrams are read, and again while they cannot be read. */
  loaded: false,
  loadError: "",
  /** The number of writes not yet answered by the Host. */
  saving: 0,
  /** Set when the last write failed: what is on screen is not saved. */
  saveError: "",
});

/** Select, draw an arrow, or place a shape of a type. */
export type Tool = "select" | "arrow" | BuiltInType;

/** What the User is doing on the canvas, shared by the toolbar and the canvas. */
export const ui = $state({
  tool: "select" as Tool,
  /** The selected shapes and arrows, by id. */
  selection: [] as string[],
  /** Resizing keeps the center of the shape where it is, rather than its opposite corner. */
  resizeFromCenter: false,
});

let storage: DiagramStorage;
/** The diagram asked for by `params.id`, opened once the list is read. */
let requested: string | undefined;
/** Writes go one after the other, so that an older state never lands after a newer one. */
let writes = Promise.resolve();

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
    const unsaved = status.saveError ? diagrams.open : null;
    diagrams.list = unsaved ? [...stored.filter((entry) => entry.id !== unsaved.id), entryOf(unsaved)] : stored;
    const id = [requested, diagrams.open?.id].find((id) => id && diagrams.list.some((entry) => entry.id === id)) ?? mostRecent()?.id;
    requested = undefined;
    if (!(unsaved && id === unsaved.id)) diagrams.open = id ? await storage.readDiagram(id) : null;
    status.loadError = "";
    status.loaded = true;
  } catch (error) {
    blockOn(error);
  }
}

/** Diagrams that could not be read block editing until they are. */
function blockOn(error: unknown): void {
  status.loaded = false;
  status.loadError = t("load_error", { reason: reasonOf(error) });
}

const entryOf = ({ id, title, updatedAt }: Diagram): DiagramEntry => ({ id, title, updatedAt });

const mostRecent = () => diagrams.list.reduce<DiagramEntry | undefined>((best, entry) => (!best || entry.updatedAt > best.updatedAt ? entry : best), undefined);

/** Applies the params the View was opened with: `id` opens that diagram. */
export function applyParams(params: Record<string, string> = {}): void {
  if (!params.id) return;
  requested = params.id;
  if (status.loaded) void load();
}

export async function open(id: string): Promise<void> {
  if (id === diagrams.open?.id) return;
  try {
    diagrams.open = await storage.readDiagram(id);
  } catch (error) {
    blockOn(error);
  }
}

/** Writes the open diagram and the list now. A failure is shown to the User; the change stays on screen. */
export function save(): Promise<void> {
  const diagram = diagrams.open;
  if (!status.loaded || !diagram) return writes;
  diagram.updatedAt = Date.now();
  const entry = entryOf(diagram);
  const at = diagrams.list.findIndex((item) => item.id === diagram.id);
  if (at === -1) diagrams.list.push(entry);
  else diagrams.list[at] = entry;
  const snapshot = $state.snapshot(diagram);
  const list = $state.snapshot(diagrams.list);
  return enqueue(() => storage.write(snapshot, list));
}

/** Queues a write after the others. A failure is shown to the User. */
function enqueue(write: () => Promise<void>): Promise<void> {
  status.saving++;
  writes = writes.then(async () => {
    try {
      await write();
      status.saveError = "";
    } catch (error) {
      status.saveError = (error as Error).message;
    } finally {
      status.saving--;
    }
  });
  return writes;
}

/** Creates "New diagram", opens it and saves it. */
export function create(): Promise<void> {
  diagrams.open = newDiagram(newId("diagram"), t("new_diagram"), Date.now());
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
  const list = $state.snapshot(diagrams.list);
  const removed = enqueue(() => storage.remove(id, list));
  if (diagrams.open?.id === id) {
    diagrams.open = null;
    if (diagrams.list[0]) await open(diagrams.list[0].id);
  }
  return removed;
}
