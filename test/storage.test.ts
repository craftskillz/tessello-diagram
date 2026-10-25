import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { newDiagram } from "../src/lib/diagram.ts";
import { diagramStorage } from "../src/lib/storage.ts";

const IMAGE = `image:${"a".repeat(64)}`;

/** The storage of the View, connected to a Test Host, which answers as the Host does, refusals included. */
async function connected() {
  const host = createTestHost({ module: { id: "@craftskillz/diagram", version: "0.0.0" } });
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  return { host, storage: diagramStorage(module.storage) };
}

describe("writing a diagram", () => {
  test("writes the diagram, then the list, so that the list never names a diagram not written", async () => {
    const { host, storage } = await connected();
    const diagram = newDiagram("d1", "Plan", 1);
    host.refuseWrites({ key: "diagrams" });
    await assert.rejects(storage.write(diagram, [{ id: "d1", title: "Plan", updatedAt: 1 }]));
    assert.equal(((await host.storage.get("diagram:d1")) as { title: string }).title, "Plan");
    assert.equal(await host.storage.get("diagrams"), null);
  });

  test("a full storage tells the User the change is kept on screen only", async () => {
    const { host, storage } = await connected();
    host.refuseWrites({ key: "diagram:d1" });
    await assert.rejects(storage.write(newDiagram("d1", "Plan", 1), []), {
      message: "Your last change could not be saved: the storage of the Diagram Module is full. It is still on screen, but will be lost when you leave.",
    });
    assert.equal(await host.storage.get("diagrams"), null);
  });

  test("another refusal tells the User its reason", async () => {
    const { host, storage } = await connected();
    host.refuseWrites({ code: "internal_error", message: "The disk failed." });
    await assert.rejects(storage.write(newDiagram("d1", "Plan", 1), []), {
      message: "Your last change could not be saved (The disk failed.). It is still on screen, but will be lost when you leave.",
    });
  });
});

describe("writing an image", () => {
  test("an image already stored is not written again", async () => {
    const { host, storage } = await connected();
    await storage.writeImage(IMAGE, "data:image/webp;base64,AAAA", 0);
    assert.equal(await host.storage.get(IMAGE), "data:image/webp;base64,AAAA");
    // A second write would be refused: there is none.
    host.refuseWrites({ key: IMAGE });
    await storage.writeImage(IMAGE, "data:image/webp;base64,AAAA", 0);
  });
});
