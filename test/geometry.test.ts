import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { arrowEnds, arrowHead, degrees, outlinePoint, resizeBox, shapeAt } from "../src/lib/geometry.ts";

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

describe("where a segment from the center of a shape leaves its outline, by type", () => {
  test("an ellipse is left on its curve, not on its box", () => {
    const ellipse = { type: "ellipse" as const, x: 0, y: 0, w: 100, h: 40, rotation: 0 };
    close(outlinePoint(ellipse, { x: 300, y: 0 }), { x: 50, y: 0 });
    close(outlinePoint(ellipse, { x: 0, y: -300 }), { x: 0, y: -20 });
    // On the diagonal (1, 1): (t/50)² + (t/20)² = 1, so t = 100 / √29.
    const t = 100 / Math.sqrt(29);
    close(outlinePoint(ellipse, { x: 10, y: 10 }), { x: t, y: t });
  });

  test("a circle is left on its circumference, its radius half of its smaller side", () => {
    const circle = { type: "circle" as const, x: 0, y: 0, w: 80, h: 60, rotation: 0 };
    close(outlinePoint(circle, { x: 100, y: 0 }), { x: 30, y: 0 });
    close(outlinePoint(circle, { x: -5, y: -5 }), { x: -30 / Math.SQRT2, y: -30 / Math.SQRT2 });
  });

  describe("a database is a cylinder", () => {
    // 60 × 100: its lids are ellipses 12 high, centered 38 above and below its center.
    const database = { type: "database" as const, x: 0, y: 0, w: 60, h: 100, rotation: 0 };

    test("left by its side, between the lids", () => {
      close(outlinePoint(database, { x: 100, y: 0 }), { x: 30, y: 0 });
      close(outlinePoint(database, { x: 60, y: 60 }), { x: 30, y: 30 });
    });

    test("left by the top of its upper lid, or the bottom of its lower lid", () => {
      close(outlinePoint(database, { x: 0, y: -100 }), { x: 0, y: -50 });
      close(outlinePoint(database, { x: 0, y: 100 }), { x: 0, y: 50 });
      // A point of the upper lid, at 60° on its ellipse: (30 cos 60°, −38 − 12 sin 60°).
      const onLid = { x: 15, y: -38 - 6 * Math.sqrt(3) };
      close(outlinePoint(database, onLid), onLid);
    });
  });

  test("follows the rotation of an ellipse or a database", () => {
    close(outlinePoint({ type: "ellipse", x: 0, y: 0, w: 100, h: 40, rotation: 90 }, { x: 300, y: 0 }), { x: 20, y: 0 });
    const database = { type: "database" as const, x: 0, y: 0, w: 60, h: 100, rotation: 90 };
    // Turned by 90° clockwise, its upper lid faces right, and its sides are on top and below.
    close(outlinePoint(database, { x: 300, y: 0 }), { x: 50, y: 0 });
    close(outlinePoint(database, { x: 0, y: 300 }), { x: 0, y: 30 });
  });

  test("a post-it, a free text and an actor are left on their box", () => {
    for (const type of ["postit", "text", "actor"] as const) {
      close(outlinePoint({ type, x: 0, y: 0, w: 100, h: 40, rotation: 0 }, { x: 100, y: 100 }), { x: 20, y: 20 });
    }
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

  test("follows the outline of the shape, not its box", () => {
    const ellipse = { ...back, type: "ellipse" as const };
    assert.equal(shapeAt([ellipse], { x: 45, y: 15 }), undefined);
    assert.equal(shapeAt([ellipse], { x: 45, y: 0 })?.id, "back");
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

describe("resizing a shape by a corner", () => {
  const free = { keepRatio: false, fromCenter: false };
  const shape = { x: 0, y: 0, w: 100, h: 40, rotation: 0 };
  const sameBox = (actual: { x: number; y: number; w: number; h: number }, expected: { x: number; y: number; w: number; h: number }) => {
    close(actual, expected);
    close({ x: actual.w, y: actual.h }, { x: expected.w, y: expected.h });
  };

  test("the opposite corner stays where it is", () => {
    // Dragging the bottom-right corner by (20, 10): the top-left corner stays at (−50, −20).
    sameBox(resizeBox(shape, "se", { x: 20, y: 10 }, free), { x: 10, y: 5, w: 120, h: 50 });
    // Dragging the top-left corner by (20, 10): the bottom-right corner stays at (50, 20).
    sameBox(resizeBox(shape, "nw", { x: 20, y: 10 }, free), { x: 10, y: 5, w: 80, h: 30 });
  });

  test("in the fixed center mode, the center stays and the shape grows on both sides", () => {
    sameBox(resizeBox(shape, "ne", { x: 20, y: -10 }, { keepRatio: false, fromCenter: true }), { x: 0, y: 0, w: 140, h: 60 });
  });

  test("keeping the proportions, the larger change wins", () => {
    sameBox(resizeBox(shape, "se", { x: 50, y: 4 }, { keepRatio: true, fromCenter: false }), { x: 25, y: 10, w: 150, h: 60 });
  });

  test("a shape is never smaller than 20 on a side", () => {
    sameBox(resizeBox(shape, "se", { x: -200, y: -30 }, free), { x: -40, y: -10, w: 20, h: 20 });
    // Keeping the proportions, the smaller side stops at 20.
    sameBox(resizeBox(shape, "se", { x: -200, y: -30 }, { keepRatio: true, fromCenter: false }), { x: -25, y: -10, w: 50, h: 20 });
  });

  test("follows the rotation of the shape: the corner is dragged in the frame of the shape", () => {
    // Turned by 90° clockwise, the bottom-right corner of the shape is at the bottom-left on screen, at (−20, 50).
    // Dragging it down by 10 makes the shape 10 wider; its top-left corner, at (20, −50) on screen, stays.
    sameBox(resizeBox({ ...shape, rotation: 90 }, "se", { x: 0, y: 10 }, free), { x: 0, y: 5, w: 110, h: 40 });
  });
});

describe("an angle", () => {
  test("is in whole degrees, from 0 to 359", () => {
    assert.deepEqual([degrees(370), degrees(-10), degrees(359.6), degrees(90)], [10, 350, 0, 90]);
  });
});
