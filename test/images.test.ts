import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newDiagram, newShape, withGroups } from "../src/lib/diagram.ts";
import { captionOf, dropsImage, fittedSize, placeImage, unusedImages } from "../src/lib/images.ts";

const A = `image:${"a".repeat(64)}`;
const B = `image:${"b".repeat(64)}`;
const C = `image:${"c".repeat(64)}`;

describe("unused images", () => {
  test("an image is unused when no diagram, custom shape or kept text refers to it", () => {
    const diagram = newDiagram("d1", "Plan", 0);
    diagram.shapes = [{ ...newShape("s1", { x: 0, y: 0 }, 0, "image"), imageKey: A }, newShape("s2", { x: 0, y: 0 }, 1)];
    const stored = new Map<string, unknown>([
      ["diagrams", [{ id: "d1", title: "Plan", updatedAt: 0 }]],
      ["diagram:d1", diagram],
      // A library of custom shapes refers to its images by the same field, at any depth.
      ["shapes", [{ id: "lib", shapes: [{ id: "icon", imageKey: B }] }]],
      [A, "data:image/webp;base64,AAAA"],
      [B, "data:image/png;base64,BBBB"],
      [C, "data:image/png;base64,CCCC"],
      ["defaults", { note: `${C} is only text here` }],
    ]);
    assert.deepEqual(unusedImages(stored), [C]);
    // A step of the undo history, kept as JSON text, keeps its images.
    assert.deepEqual(unusedImages(stored, [JSON.stringify({ shapes: [{ imageKey: C }] })]), []);
  });

  test("a change drops an image when the diagram no longer refers to one it did", () => {
    const of = (...keys: string[]) => JSON.stringify({ shapes: keys.map((imageKey) => ({ imageKey })) });
    assert.equal(dropsImage(of(A, B), of(B)), true);
    assert.equal(dropsImage(of(A), of(A, B)), false);
    assert.equal(dropsImage(of(A, A), of(A)), false);
    assert.equal(dropsImage(of(), of()), false);
  });

  test("a storage without images has none unused", () => {
    assert.deepEqual(unusedImages(new Map([["diagrams", []]])), []);
  });
});

describe("an image inserted", () => {
  test("is reduced to fit within its longest side, keeping its proportions, but never enlarged", () => {
    assert.deepEqual(fittedSize({ w: 3200, h: 1600 }, 1600), { w: 1600, h: 800 });
    assert.deepEqual(fittedSize({ w: 1000, h: 4000 }, 1600), { w: 400, h: 1600 });
    assert.deepEqual(fittedSize({ w: 333, h: 1001 }, 1000), { w: 333, h: 1000 });
    assert.deepEqual(fittedSize({ w: 800, h: 600 }, 1600), { w: 800, h: 600 });
  });

  test("is captioned by the name of its file without the extension, or 'image' when pasted", () => {
    assert.equal(captionOf("Architecture v2.final.png"), "Architecture v2.final");
    assert.equal(captionOf("logo"), "logo");
    assert.equal(captionOf(""), "image");
    assert.equal(captionOf(".png"), "image");
  });

  test("is placed at a point with its caption below it, as one group in front", () => {
    const diagram = newDiagram("d1", "Plan", 0);
    diagram.shapes = [newShape("s1", { x: 0, y: 0 }, 4)];
    const ids = placeImage(diagram, { key: A, size: { w: 800, h: 400 }, caption: "Logo", at: { x: 100, y: 50 } });
    assert.equal(ids.length, 2);
    const [image, caption] = ids.map((id) => diagram.shapes.find((shape) => shape.id === id)!);
    // Shown at most 320 wide or high.
    assert.deepEqual([image.type, image.imageKey, image.x, image.y, image.w, image.h, image.z], ["image", A, 100, 50, 320, 160, 5]);
    assert.deepEqual([caption.type, caption.text, caption.x, caption.z], ["text", "Logo", 100, 6]);
    assert.ok(caption.y - caption.h / 2 >= image.y + image.h / 2, "the caption is below the image");
    assert.ok(image.groupId);
    assert.deepEqual(withGroups(diagram, [image.id]).sort(), [...ids].sort());
  });
});
