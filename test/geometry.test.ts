import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { arrowEnds, arrowHead, outlinePoint, shapeAt } from "../src/lib/geometry.ts";

const box = { x: 0, y: 0, w: 100, h: 40, rotation: 0 };

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9, `${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
};

describe("where a segment from the center of a rectangle leaves its outline", () => {
  test("toward a point on the right, it leaves by the middle of the right side", () => {
    close(outlinePoint(box, { x: 300, y: 0 }), { x: 50, y: 0 });
  });

  test("toward a point above (y grows downward, as in SVG), it leaves by the top side", () => {
    close(outlinePoint(box, { x: 0, y: -500 }), { x: 0, y: -20 });
  });

  test("on a slant, it leaves by the side it crosses first", () => {
    // Toward (100, 100), the bottom side y = 20 is reached at x = 20, before the right side.
    close(outlinePoint(box, { x: 100, y: 100 }), { x: 20, y: 20 });
    // Toward (200, 40), the right side x = 50 is reached at y = 10.
    close(outlinePoint(box, { x: 200, y: 40 }), { x: 50, y: 10 });
  });

  test("works for a rectangle away from the origin", () => {
    close(outlinePoint({ x: 200, y: 100, w: 60, h: 60, rotation: 0 }, { x: 200, y: 400 }), { x: 200, y: 130 });
  });

  test("follows the rotation of the rectangle", () => {
    // Turned by 90°, the 100 × 40 rectangle is 40 wide on screen.
    close(outlinePoint({ ...box, rotation: 90 }, { x: 300, y: 0 }), { x: 20, y: 0 });
  });

  test("toward its own center, it stays at the center", () => {
    close(outlinePoint(box, { x: 0, y: 0 }), { x: 0, y: 0 });
  });
});

describe("the ends of an arrow", () => {
  const a = { id: "a", x: -200, y: 0, w: 100, h: 40, rotation: 0 };
  const b = { id: "b", x: 200, y: 0, w: 100, h: 40, rotation: 0 };
  const shapes = new Map([a, b].map((shape) => [shape.id, shape]));

  test("attached automatically at both ends, the line stops at both outlines", () => {
    assert.deepEqual(arrowEnds(shapes, { from: { shapeId: "a", port: null }, to: { shapeId: "b", port: null } }), {
      start: { x: -150, y: 0 },
      end: { x: 150, y: 0 },
    });
  });

  test("follows a shape that moved", () => {
    const moved = new Map(shapes).set("b", { ...b, y: 400 });
    const { end } = arrowEnds(moved, { from: { shapeId: "a", port: null }, to: { shapeId: "b", port: null } })!;
    // From B toward the center of A, the direction (−400, −400) reaches the top side of B first.
    close(end, { x: 180, y: 380 });
  });

  test("an automatic end aims at a free end", () => {
    assert.deepEqual(arrowEnds(shapes, { from: { shapeId: "a", port: null }, to: { x: -200, y: 300 } }), {
      start: { x: -200, y: 20 },
      end: { x: -200, y: 300 },
    });
  });

  test("an arrow attached to a shape that no longer exists is not drawn", () => {
    assert.equal(arrowEnds(shapes, { from: { shapeId: "a", port: null }, to: { shapeId: "gone", port: null } }), null);
  });
});

describe("the shape under a point", () => {
  const back = { id: "back", x: 0, y: 0, w: 100, h: 40, rotation: 0, z: 0 };
  const front = { id: "front", x: 40, y: 0, w: 40, h: 40, rotation: 0, z: 1 };

  test("is the one whose outline holds the point", () => {
    assert.equal(shapeAt([back, front], { x: -45, y: 10 })?.id, "back");
  });

  test("is the frontmost when shapes overlap, whatever their order in the list", () => {
    assert.equal(shapeAt([front, back], { x: 45, y: 0 })?.id, "front");
    assert.equal(shapeAt([back, front], { x: 45, y: 0 })?.id, "front");
  });

  test("follows the rotation of the shape", () => {
    assert.equal(shapeAt([{ ...back, rotation: 90 }], { x: 45, y: 0 }), undefined);
    assert.equal(shapeAt([{ ...back, rotation: 90 }], { x: 0, y: 45 })?.id, "back");
  });

  test("is none on the empty canvas", () => {
    assert.equal(shapeAt([back, front], { x: 0, y: 300 }), undefined);
  });
});

describe("the head of an arrow", () => {
  test("has its tip on the end, and the line stops at its base", () => {
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    assert.deepEqual(head.base, { x: 90, y: 0 });
    assert.deepEqual(head.points, [{ x: 100, y: 0 }, { x: 90, y: 5 }, { x: 90, y: -5 }]);
  });

  test("points the way the arrow goes", () => {
    const head = arrowHead({ x: 0, y: 100 }, { x: 0, y: 0 }, 10);
    close(head.base, { x: 0, y: 10 });
    close(head.points[0], { x: 0, y: 0 });
  });

  test("an arrow of no length has its head on its end", () => {
    assert.deepEqual(arrowHead({ x: 3, y: 4 }, { x: 3, y: 4 }, 10).base, { x: 3, y: 4 });
  });
});
