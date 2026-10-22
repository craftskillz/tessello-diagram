// The diagrams in the Host storage (CONVENTION.md §6.1): the list under `diagrams`, and each diagram under
// `diagram:<id>`, so that a change writes only the diagram it touches. What is stored is read defensively
// (diagram.ts), and a failed write comes back as a message for the User. Images are kept under `image:<sha256>`
// (images.ts), the libraries of custom shapes under `shapes` (library.ts), and the creation defaults under `defaults`
// (defaults.ts). The usage of the storage is measured when all of it is read, then follows each write and deletion.

import type { Json, Storage } from "@tessello/sdk";
import { type Defaults, readDefaults } from "./defaults.ts";
import { type Diagram, type DiagramEntry, readDiagram, readIndex } from "./diagram.ts";
import { t } from "./i18n.ts";
import { readLibraries, type ShapeLibrary } from "./library.ts";
import { storageUsage } from "./usage.ts";

/** What `storage.set` takes: any JSON value but null. */
type Value = Exclude<Json, null>;

const INDEX = "diagrams";
const LIBRARIES = "shapes";
const DEFAULTS = "defaults";
const DIAGRAM = "diagram:";
const keyOf = (id: string) => `${DIAGRAM}${id}`;

export interface DiagramStorage {
  /** The list of diagrams. Throws when the Host cannot read it. */
  readIndex(): Promise<DiagramEntry[]>;
  /** A diagram; one never written is empty. Throws when the Host cannot read it. */
  readDiagram(id: string): Promise<Diagram>;
  /** Every diagram stored, which measures the usage again. Throws when the Host cannot read them. */
  readDiagrams(): Promise<Diagram[]>;
  /** Writes a diagram, then the list. Throws an `Error` whose message tells the User what happened. */
  write(diagram: Diagram, index: DiagramEntry[]): Promise<void>;
  /** Writes the list, then removes a diagram. Throws as `write` does. */
  remove(id: string, index: DiagramEntry[]): Promise<void>;
  /** The libraries of custom shapes. Throws when the Host cannot read them. */
  readLibraries(): Promise<ShapeLibrary[]>;
  /** Writes the libraries. Throws as `write` does. */
  writeLibraries(libraries: ShapeLibrary[]): Promise<void>;
  /** The creation defaults. Throws when the Host cannot read them. */
  readDefaults(): Promise<Defaults>;
  /** Writes the creation defaults. Throws as `write` does. */
  writeDefaults(defaults: Defaults): Promise<void>;
  /** Every key and its value, which measures the usage again. Throws when the Host cannot read them. */
  readAll(): Promise<Map<string, Json>>;
  /** An image as a data URL, or null when it is missing. */
  readImage(key: string): Promise<string | null>;
  /**
   * Writes an image, unless it is stored already. Throws an `Error` whose message tells the User, without writing,
   * when the image, and the `reserve` bytes its shapes will take, would make the storage exceed its quota.
   */
  writeImage(key: string, dataUrl: string, reserve: number): Promise<void>;
  /** Removes images. Throws as `write` does. */
  removeImages(keys: readonly string[]): Promise<void>;
  /** Whether writing these entries keeps the storage within its quota; reads all of it first when it was not measured. */
  fits(entries: Iterable<readonly [string, unknown]>): Promise<boolean>;
  /** The bytes used, as last measured; null until all of it is read once. */
  usage(): number | null;
}

export function diagramStorage(storage: Storage): DiagramStorage {
  const withSaveMessage = async (change: () => Promise<void>) => {
    try {
      await change();
    } catch (error) {
      throw new Error(saveErrorMessage(error), { cause: error });
    }
  };
  const usage = storageUsage();
  let measured = false;
  const set = async (key: string, value: unknown) => {
    await storage.set(key, value as Value);
    usage.set(key, value);
  };
  const remove = async (key: string) => {
    await storage.delete(key);
    usage.delete(key);
  };
  const readAll = async () => {
    const keys = await storage.keys();
    const entries = new Map(await Promise.all(keys.map(async (key) => [key, await storage.get(key)] as const)));
    for (const [key, value] of entries) if (value === null) entries.delete(key);
    usage.reset(entries);
    measured = true;
    return entries;
  };
  return {
    readIndex: async () => readIndex(await storage.get(INDEX)),
    readDiagram: async (id) => readDiagram(await storage.get(keyOf(id)), id),
    write: (diagram, index) =>
      withSaveMessage(async () => {
        await set(keyOf(diagram.id), diagram);
        await set(INDEX, index);
      }),
    remove: (id, index) =>
      withSaveMessage(async () => {
        await set(INDEX, index);
        await remove(keyOf(id));
      }),
    readLibraries: async () => readLibraries(await storage.get(LIBRARIES)),
    writeLibraries: (libraries) => withSaveMessage(() => set(LIBRARIES, libraries)),
    readDefaults: async () => readDefaults(await storage.get(DEFAULTS)),
    writeDefaults: (defaults) => withSaveMessage(() => set(DEFAULTS, defaults)),
    readDiagrams: async () =>
      [...(await readAll())].filter(([key]) => key.startsWith(DIAGRAM)).map(([key, value]) => readDiagram(value, key.slice(DIAGRAM.length))),
    readAll,
    readImage: async (key) => {
      const value = await storage.get(key);
      return typeof value === "string" ? value : null;
    },
    writeImage: async (key, dataUrl, reserve) => {
      if (usage.has(key)) return;
      if (!usage.fits(key, dataUrl, reserve)) throw new Error(t("image_quota"));
      try {
        await set(key, dataUrl);
      } catch (error) {
        throw new Error(isQuotaError(error) ? t("image_quota") : t("image_error", { reason: reasonOf(error) }), { cause: error });
      }
    },
    removeImages: (keys) =>
      withSaveMessage(async () => {
        for (const key of keys) await remove(key);
      }),
    fits: async (entries) => {
      if (!measured) await readAll();
      return usage.fitsAll(entries);
    },
    usage: () => (measured ? usage.total() : null),
  };
}

/** What a failed request says, for a message: its own message, or the value thrown. */
export const reasonOf = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error));

/** Whether the Host refused a write because the storage would exceed its limits. */
const isQuotaError = (error: unknown) => (error as { code?: unknown }).code === "quota_exceeded";

function saveErrorMessage(error: unknown): string {
  if (isQuotaError(error)) return t("save_error_quota");
  return t("save_error", { reason: reasonOf(error) });
}
