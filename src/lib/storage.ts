// The diagrams in the Host storage (CONVENTION.md §6.1): the list under `diagrams`, and each diagram under
// `diagram:<id>`, so that a change writes only the diagram it touches. What is stored is read defensively
// (diagram.ts), and a failed write comes back as a message for the User.

import type { Json, Storage } from "@tessello/sdk";
import { type Diagram, type DiagramEntry, readDiagram, readIndex } from "./diagram.ts";
import { t } from "./i18n.ts";

/** What `storage.set` takes: any JSON value but null. */
type Value = Exclude<Json, null>;

const INDEX = "diagrams";
const keyOf = (id: string) => `diagram:${id}`;

export interface DiagramStorage {
  /** The list of diagrams. Throws when the Host cannot read it. */
  readIndex(): Promise<DiagramEntry[]>;
  /** A diagram; one never written is empty. Throws when the Host cannot read it. */
  readDiagram(id: string): Promise<Diagram>;
  /** Writes a diagram, then the list. Throws an `Error` whose message tells the User what happened. */
  write(diagram: Diagram, index: DiagramEntry[]): Promise<void>;
  /** Writes the list, then removes a diagram. Throws as `write` does. */
  remove(id: string, index: DiagramEntry[]): Promise<void>;
}

export function diagramStorage(storage: Storage): DiagramStorage {
  const withSaveMessage = async (change: () => Promise<void>) => {
    try {
      await change();
    } catch (error) {
      throw new Error(saveErrorMessage(error), { cause: error });
    }
  };
  return {
    readIndex: async () => readIndex(await storage.get(INDEX)),
    readDiagram: async (id) => readDiagram(await storage.get(keyOf(id)), id),
    write: (diagram, index) =>
      withSaveMessage(async () => {
        await storage.set(keyOf(diagram.id), diagram as unknown as Value);
        await storage.set(INDEX, index as unknown as Value);
      }),
    remove: (id, index) =>
      withSaveMessage(async () => {
        await storage.set(INDEX, index as unknown as Value);
        await storage.delete(keyOf(id));
      }),
  };
}

/** What a failed request says, for a message: its own message, or the value thrown. */
export const reasonOf = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error));

function saveErrorMessage(error: unknown): string {
  if ((error as { code?: unknown }).code === "quota_exceeded") return t("save_error_quota");
  return t("save_error", { reason: reasonOf(error) });
}
