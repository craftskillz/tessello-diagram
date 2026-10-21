import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alignment, boundsOf, fitView, scaleBoxes, snapToGrid } from "../src/lib/placement.ts";

describe("snapping to the grid", () => {
  test("a point goes to the nearest crossing of the grid, every 20 units", () => {
    assert.deepEqual(snapToGrid({ x: 29, y: -31 }), { x: 20, y: -40 });
    assert.deepEqual(snapToGrid({ x: 30.5, y: 9 }), { x: 40, y: 0 });
  });
});

describe("the bounds of shapes", () => {
  test("hold every shape, turned as it is", () => {
    assert.deepEqual(boundsOf([
      { x: 0, y: 0, w: 100, h: 40, rotation: 0 },
      { x: 200, y: 100, w: 100, h: 40, rotation: 90 },
    ]), { x: -50, y: -20, w: 270, h: 170 });
  });

  test("nothing has no bounds", () => {
    assert.equal(boundsOf([]), null);
  });
});

describe("alignment guides", () => {
  const other = { x: 0, y: 0, w: 100, h: 50 };

  test("a left edge near the left edge of another shape lines up with it", () => {
    const { dx, dy, guides } = alignment({ x: 4, y: 200, w: 60, h: 30 }, [other], 6);
    assert.equal(dx, -4);
    assert.equal(dy, null);
    assert.deepEqual(guides, [{ axis: "x", at: 0, from: 0, to: 230 }]);
  });

  test("a center lines up with a center, and a bottom with a top", () => {
    // The center of the moving box is at x = 52, the center of the other at 50; its bottom is at y = −3, the other's top at 0.
    const { dx, dy } = alignment({ x: 22, y: -33, w: 60, h: 30 }, [other], 6);
    assert.equal(dx, -2);
    assert.equal(dy, 3);
  });

  test("the nearest line wins", () => {
    const { dx } = alignment({ x: 103, y: 200, w: 60, h: 30 }, [other, { x: 105, y: 400, w: 10, h: 10 }], 6);
    assert.equal(dx, 2);
  });

  test("nothing within reach gives no guide", () => {
    assert.deepEqual(alignment({ x: 300, y: 300, w: 60, h: 30 }, [other], 6), { dx: null, dy: null, guides: [] });
  });
});

describe("fitting the view", () => {
  test("the content fills the canvas within its margin, centered", () => {
    const { zoom, pan } = fitView({ x: 0, y: 0, w: 1000, h: 200 }, { w: 540, h: 400 }, 20);
    assert.equal(zoom, 0.5);
    assert.deepEqual(pan, { x: 20, y: 150 });
  });

  test("small content is shown at its real size, centered", () => {
    const { zoom, pan } = fitView({ x: 100, y: 100, w: 100, h: 50 }, { w: 800, h: 600 }, 20);
    assert.equal(zoom, 1);
    assert.deepEqual(pan, { x: 250, y: 175 });
  });
});

describe("resizing a group", () => {
  test("its shapes keep their places and sizes within its bounds", () => {
    // Two 100 × 40 shapes side by side, from x = −50 to 250: the group doubles its width from its left edge.
    const boxes = [
      { x: 0, y: 0, w: 100, h: 40, rotation: 0 },
      { x: 200, y: 0, w: 100, h: 40, rotation: 0 },
    ];
    const scaled = scaleBoxes(boxes, { x: -50, y: -20, w: 300, h: 40 }, { x: -50, y: -20, w: 600, h: 80 });
    assert.deepEqual(scaled, [
      { x: 50, y: 20, w: 200, h: 80, rotation: 0 },
      { x: 450, y: 20, w: 200, h: 80, rotation: 0 },
    ]);
  });
});
