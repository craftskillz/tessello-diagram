import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addAnchor, readLibraries, renameAnchor } from "../src/lib/library.ts";

const image = `image:${"a".repeat(64)}`;

describe("the libraries of custom shapes read from the storage", () => {
  test("nothing stored yet, or a value that is not a list of libraries, is no library", () => {
    assert.deepEqual(readLibraries(null), []);
    assert.deepEqual(readLibraries({ libraries: "none" }), []);
    assert.deepEqual(readLibraries("libraries"), []);
  });

  test("a library keeps its shapes, with all they were saved with", () => {
    const shape = {
      id: "gateway",
      name: "Gateway",
      imageKey: image,
      width: 96,
      height: 64,
      labelPlacement: "right",
      showInDiagram: false,
      anchors: [{ id: "in", x: 0, y: 0.5 }],
    };
    assert.deepEqual(readLibraries([{ id: "lib", name: "Platform icons", shapes: [shape] }]), [{ id: "lib", name: "Platform icons", shapes: [shape] }]);
  });

  test("a missing value takes its creation value: 65 × 65, text below, shown in the palette, no anchor", () => {
    const [library] = readLibraries([{ id: "lib", shapes: [{ id: "s", imageKey: image }] }]);
    assert.equal(library.name, "");
    assert.deepEqual(library.shapes, [{ id: "s", name: "", imageKey: image, width: 65, height: 65, labelPlacement: "below", showInDiagram: true, anchors: [] }]);
  });

  test("sizes are whole and kept within 16 to 1200, names within 120 characters", () => {
    const [{ shapes }] = readLibraries([
      { id: "lib", shapes: [{ id: "s", name: "x".repeat(200), imageKey: image, width: 3, height: 5000.4, labelPlacement: "diagonal" }, { id: "t", imageKey: image, width: 99.6, height: -1 }] },
    ]);
    assert.equal(shapes[0].name.length, 120);
    assert.deepEqual([shapes[0].width, shapes[0].height, shapes[0].labelPlacement], [16, 1200, "below"]);
    assert.deepEqual([shapes[1].width, shapes[1].height], [100, 16]);
  });

  test("anchors stay within the shape", () => {
    const [{ shapes }] = readLibraries([{ id: "lib", shapes: [{ id: "s", imageKey: image, anchors: [{ id: "a", x: -0.5, y: 2 }, { id: "b", x: "left", y: 0.3 }] }] }]);
    assert.deepEqual(shapes[0].anchors, [{ id: "a", x: 0, y: 1 }, { id: "b", x: 0, y: 0.3 }]);
  });

  test("anchors with the same identifier, or none, are given unique ones", () => {
    const [{ shapes }] = readLibraries([
      { id: "lib", shapes: [{ id: "s", imageKey: image, anchors: [{ id: "p1", x: 0, y: 0 }, { id: " p1 ", x: 1, y: 0 }, { x: 1, y: 1 }, { id: "p1-2", x: 0, y: 1 }] }] },
    ]);
    assert.deepEqual(
      shapes[0].anchors.map((anchor) => anchor.id),
      ["p1", "p1-2", "p3", "p1-2-2"],
    );
  });

  test("a shape without an image, or without an id, and a library without an id are skipped", () => {
    const libraries = readLibraries([{ id: "lib", shapes: [{ id: "no-image" }, { imageKey: image }, "shape"] }, { name: "no id" }]);
    assert.deepEqual(libraries, [{ id: "lib", name: "", shapes: [] }]);
  });
});

describe("the anchors of a definition, in the shape editor", () => {
  const anchors = [{ id: "in", x: 0, y: 0.5 }, { id: "out", x: 1, y: 0.5 }, { id: "p3", x: 0.5, y: 0 }];

  test("an anchor added takes the first identifier p<n> not taken, and stays within the shape", () => {
    assert.deepEqual(addAnchor(anchors, { x: 0.2, y: 1.4 }).at(-1), { id: "p4", x: 0.2, y: 1 });
    assert.deepEqual(addAnchor([{ id: "p2", x: 0, y: 0 }], { x: 0, y: 0 }).at(-1)!.id, "p3");
  });

  test("an anchor renamed to the identifier of another is made unique, and the others keep theirs", () => {
    assert.deepEqual(renameAnchor(anchors, 2, " out ").map((anchor) => anchor.id), ["in", "out", "out-2"]);
    assert.deepEqual(renameAnchor(anchors, 0, "top").map((anchor) => anchor.id), ["top", "out", "p3"]);
  });

  test("an anchor renamed to nothing keeps its identifier", () => {
    assert.deepEqual(renameAnchor(anchors, 1, "  ").map((anchor) => anchor.id), ["in", "out", "p3"]);
  });
});
