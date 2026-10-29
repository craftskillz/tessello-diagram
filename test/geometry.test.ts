import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { arrowHead, boxWithin, connectionHandlePoint, connectionPort, contains, cornerRadiusOf, degrees, exitPoint, outlinePoint, portDirection, portPoint, portsOf, resizeBox, rotate, shapeAt } from "../src/lib/geometry.ts";
import { newShape } from "../src/lib/diagram.ts";
import { tableAnchors } from "../src/lib/table.ts";

const box = { x: 0, y: 0, w: 100, h: 40, rotation: 0 };

test("directional connections use the cardinal ports of every built-in shape and image", () => {
  for (const type of ["rect", "ellipse", "database", "circle", "actor", "postit", "text", "image"] as const) {
    for (const direction of ["N", "E", "S", "W"] as const) {
      assert.equal(connectionPort({ ...box, type, rotation: 90 }, direction), direction);
    }
  }
});

test("custom connections choose existing anchors by normalized distance, keeping definition order on ties", () => {
  const custom = { ...box, type: "custom" as const, w: 800, h: 20, rotation: 90, anchors: [
    { id: "inlet", x: 0.25, y: 0.1 }, { id: "outlet", x: 0.9, y: 0.4 },
    { id: "drain", x: 0.6, y: 0.9 }, { id: "west", x: 0.1, y: 0.6 },
  ] };
  assert.deepEqual((["N", "E", "S", "W"] as const).map((side) => connectionPort(custom, side)), ["inlet", "outlet", "drain", "west"]);
  const tied = { ...custom, anchors: [{ id: "first", x: 0.25, y: 0 }, { id: "second", x: 0.75, y: 0 }] };
  assert.equal(connectionPort(tied, "N"), "first");
  for (const side of ["N", "E", "S", "W"] as const) {
    assert.equal(connectionPort({ ...custom, anchors: [{ id: "only", x: 0.2, y: 0.3 }] }, side), "only");
    assert.equal(connectionPort({ ...custom, anchors: [] }, side), null);
    assert.equal(connectionPort({ ...box, type: "custom" }, side), null);
  }
  // In drawing coordinates the first is much nearer N; normalized coordinates choose the second.
  assert.equal(connectionPort({ ...custom, anchors: [{ id: "near-in-pixels", x: 0.5, y: 0.4 }, { id: "near-normalized", x: 0.7, y: 0 }] }, "N"), "near-normalized");
});

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9, `${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
};

test("connection handles follow the rotated box with a constant 14 screen pixel gap at every zoom", () => {
  for (const zoom of [0.1, 1, 4]) {
    close(connectionHandlePoint(box, "N", zoom), { x: 0, y: -20 - 14 / zoom });
    close(connectionHandlePoint({ ...box, rotation: 90 }, "E", zoom), { x: 0, y: 50 + 14 / zoom });
    close(connectionHandlePoint(box, "S", zoom), { x: 0, y: 20 + 14 / zoom });
    close(connectionHandlePoint(box, "W", zoom), { x: -50 - 14 / zoom, y: 0 });
  }
  close(portPoint({ ...box, rotation: 90 }, connectionPort(box, "N")!), { x: 20, y: 0 });
});

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

describe("the ports of a shape", () => {
  test("a built-in shape has eight, from north clockwise", () => {
    assert.deepEqual(portsOf({ type: "rect" }), ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
  });

  test("on a rectangle, they are its corners and the middles of its sides", () => {
    close(portPoint(box, "NE"), { x: 50, y: -20 });
    close(portPoint(box, "S"), { x: 0, y: 20 });
    close(portPoint(box, "W"), { x: -50, y: 0 });
    close(portPoint({ ...box, x: 200, y: 100 }, "SW"), { x: 150, y: 120 });
  });

  test("on an ellipse or a circle, the corner ports are on the curve", () => {
    close(portPoint({ ...box, type: "ellipse" }, "NE"), { x: 50 / Math.SQRT2, y: -20 / Math.SQRT2 });
    close(portPoint({ type: "circle", x: 0, y: 0, w: 60, h: 60, rotation: 0 }, "SW"), { x: -30 / Math.SQRT2, y: 30 / Math.SQRT2 });
  });

  test("on a database, the corner ports are where the sides meet the lids", () => {
    // 60 × 100: its lids are 12 high, so the sides end 38 above and below its center.
    const database = { type: "database" as const, x: 0, y: 0, w: 60, h: 100, rotation: 0 };
    close(portPoint(database, "NE"), { x: 30, y: -38 });
    close(portPoint(database, "N"), { x: 0, y: -50 });
    close(portPoint(database, "SW"), { x: -30, y: 38 });
  });

  test("follow the rotation of the shape", () => {
    // Turned by 90° clockwise, the top-right corner of the 100 × 40 rectangle is at the bottom-right on screen.
    close(portPoint({ ...box, rotation: 90 }, "NE"), { x: 20, y: 50 });
    close(portPoint({ ...box, rotation: 90 }, "N"), { x: 20, y: 0 });
  });

  test("an unknown port is the center of the shape", () => {
    close(portPoint(box, "nowhere"), { x: 0, y: 0 });
  });
});

describe("the ports of a custom shape", () => {
  // Its anchors are where its definition puts them, as parts of its width and height from its top-left corner.
  const custom = { type: "custom" as const, x: 0, y: 0, w: 100, h: 40, rotation: 0, anchors: [{ id: "in", x: 0, y: 0.5 }, { id: "top", x: 0.75, y: 0 }] };

  test("are the anchors of its definition, and none without one", () => {
    assert.deepEqual(portsOf(custom), ["in", "top"]);
    assert.deepEqual(portsOf({ type: "custom" }), []);
    // A definition deleted gives an empty list of anchors, which is no port, not the eight of a rectangle.
    assert.deepEqual(portsOf({ type: "custom", anchors: [] }), []);
  });

  test("are where its anchors are, scaled to its size", () => {
    close(portPoint(custom, "in"), { x: -50, y: 0 });
    close(portPoint({ ...custom, x: 200, y: 100, w: 200 }, "top"), { x: 250, y: 80 });
  });

  test("follow its rotation", () => {
    // Turned by 90° clockwise, the point a quarter from the right of its top side is below its center, on the right.
    close(portPoint({ ...custom, rotation: 90 }, "top"), { x: 20, y: 25 });
    close(portPoint({ ...custom, rotation: 180 }, "in"), { x: 50, y: 0 });
  });

  test("follow its rotation and its size together", () => {
    // 200 × 40 and turned by 90°: the point a quarter from the right of its top side is 50 below its center, 20 right.
    close(portPoint({ ...custom, x: 10, y: 10, w: 200, rotation: 90 }, "top"), { x: 30, y: 60 });
  });
});

describe("the ports of a table", () => {
  // 240 × 90 and three columns of 60, 60 and 120: its ports are those of its cells, given as anchors, not the eight of a rectangle.
  const table = { type: "table" as const, x: 0, y: 0, w: 240, h: 90, rotation: 0, anchors: tableAnchors({ ...newShape("t", { x: 0, y: 0 }, 0, "table"), w: 240, h: 90, columns: [0.25, 0.25, 0.5] }) };

  test("are the anchors of its cells, and not the eight of a rectangle", () => {
    assert.ok(portsOf(table).includes("r0c1-N"));
    assert.ok(!portsOf(table).includes("N"));
    assert.ok(!portsOf(table).includes("r1c1-N"));
    assert.equal(portsOf(table).length, 32);
  });

  test("are where the cells are on the border", () => {
    close(portPoint(table, "r0c2-N"), { x: 60, y: -45 });
    close(portPoint(table, "r2c0-SW"), { x: -120, y: 45 });
    close(portPoint(table, "r1c2-E"), { x: 120, y: 0 });
  });

  test("face outward from their side, and follow the rotation", () => {
    close(portDirection(table, "r0c1-N"), { x: 0, y: -1 });
    close(portDirection(table, "r1c0-W"), { x: -1, y: 0 });
    // The top-left corner of the table is diagonal, even in a table much wider than high.
    close(portDirection(table, "r0c0-NW"), { x: -Math.SQRT1_2, y: -Math.SQRT1_2 });
    // A point of the top side that is not at the middle still faces straight up, not away from the center.
    close(portDirection(table, "r0c1-NE"), { x: 0, y: -1 });
    // Turned by 90° clockwise, up is right on screen.
    close(portDirection({ ...table, rotation: 90 }, "r0c1-N"), { x: 1, y: 0 });
    close(portDirection({ ...table, rotation: 90 }, "r0c0-NW"), { x: Math.SQRT1_2, y: -Math.SQRT1_2 });
  });

  test("a connection from a side of the table starts at the nearest cell point", () => {
    assert.equal(connectionPort(table, "W"), "r1c0-W");
    assert.equal(connectionPort(table, "N"), "r0c1-NE");
  });

  test("a shape without anchors (not a table yet given its cells) keeps the eight", () => {
    assert.deepEqual(portsOf({ type: "table" }), ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
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

describe("a shape within a rectangle", () => {
  const rectangle = { x: -60, y: -60, w: 120, h: 120 };

  test("is within when its whole box is", () => {
    assert.equal(boxWithin(box, rectangle), true);
    assert.equal(boxWithin({ ...box, x: 20 }, rectangle), false);
  });

  test("follows the rotation of the shape", () => {
    // Turned by 90°, the 100 × 40 rectangle is 100 high: it no longer fits within 80 in height.
    assert.equal(boxWithin({ ...box, rotation: 90 }, { x: -60, y: -40, w: 120, h: 80 }), false);
    assert.equal(boxWithin({ ...box, rotation: 90 }, { x: -20, y: -50, w: 40, h: 100 }), true);
  });
});

test("a table has the outline of a rectangle: an arrow attaches to its sides and corners", () => {
  const table = { ...box, type: "table" as const, w: 240, h: 90 };
  assert.deepEqual(outlinePoint(table, { x: 500, y: 0 }), { x: 120, y: 0 });
  assert.deepEqual(portPoint(table, "SE"), { x: 120, y: 45 });
  assert.deepEqual(portsOf(table), portsOf({ type: "rect" }));
});

describe("a rectangle with rounded corners", () => {
  const rounded = { type: "rect" as const, x: 0, y: 0, w: 120, h: 60, rotation: 0, cornerRadius: 20 };
  // The center of the circle of the north-east corner: 20 in from each side.
  const centre = { x: 40, y: -10 };
  const fromCentre = (point: { x: number; y: number }, of = centre) => Math.hypot(point.x - of.x, point.y - of.y);

  test("a radius of 0 behaves as the square box", () => {
    const square = { ...rounded, cornerRadius: 0 };
    close(outlinePoint(square, { x: 1200, y: -600 }), { x: 60, y: -30 });
    close(portPoint(square, "NE"), { x: 60, y: -30 });
    assert.equal(contains(square, { x: 59, y: -29 }), true);
  });

  test("the automatic end toward a far point on the diagonal lands on the arc, not at the square corner", () => {
    const end = outlinePoint(rounded, { x: 1200, y: -600 });
    assert.ok(Math.abs(fromCentre(end) - 20) < 1e-9, `${JSON.stringify(end)} is not on the arc`);
    assert.ok(end.x < 60 && end.y > -30);
  });

  test("the points along the straight sides are unchanged", () => {
    close(outlinePoint(rounded, { x: 300, y: 0 }), { x: 60, y: 0 });
    close(outlinePoint(rounded, { x: 0, y: -300 }), { x: 0, y: -30 });
    // Toward (120, 10), the right side is crossed at y = 5, within its straight part (|y| ≤ 10).
    close(outlinePoint(rounded, { x: 120, y: 10 }), { x: 60, y: 5 });
  });

  test("the corner ports are on the arc, in the direction of the corner from the center", () => {
    for (const [port, sx, sy] of [["NE", 1, -1], ["SE", 1, 1], ["SW", -1, 1], ["NW", -1, -1]] as const) {
      const at = portPoint(rounded, port);
      assert.ok(Math.abs(fromCentre(at, { x: sx * 40, y: sy * 10 }) - 20) < 1e-9, `${port} is not on the arc`);
      assert.ok(Math.abs(at.x * 60 * sy - at.y * 120 * sx) < 1e-6, `${port} is not on the diagonal`);
    }
    close(portPoint(rounded, "E"), { x: 60, y: 0 });
  });

  test("the arc follows the rotation of the rectangle", () => {
    for (const rotation of [30, 90]) {
      const turned = { ...rounded, rotation, x: 200, y: 100 };
      const at = portPoint(turned, "NE");
      const turnedCentre = rotate(centre, rotation);
      assert.ok(Math.abs(fromCentre(at, { x: 200 + turnedCentre.x, y: 100 + turnedCentre.y }) - 20) < 1e-9);
      const end = outlinePoint(turned, { x: 200 + rotate({ x: 1200, y: -600 }, rotation).x, y: 100 + rotate({ x: 1200, y: -600 }, rotation).y });
      close(end, at);
    }
  });

  test("contains and the shape under a point follow the arc near the corners", () => {
    assert.equal(contains(rounded, { x: 59, y: -29 }), false);
    assert.equal(contains(rounded, { x: 52, y: -22 }), true);
    assert.equal(contains(rounded, { x: 59, y: 0 }), true);
    assert.equal(shapeAt([{ ...rounded, z: 0 }], { x: 59, y: -29 }), undefined);
  });

  test("an arrow leaving from beside the center stops at the arc", () => {
    const end = exitPoint(rounded, { x: 30, y: -5 }, { x: 1200, y: -600 });
    assert.ok(Math.abs(fromCentre(end) - 20) < 1e-6 || end.x === 60 || end.y === -30);
    assert.equal(contains(rounded, { x: end.x - 1e-3 * (end.x - 30), y: end.y - 1e-3 * (end.y + 5) }), true);
    assert.equal(contains(rounded, { x: end.x + 1e-3 * (end.x - 30), y: end.y + 1e-3 * (end.y + 5) }), false);
  });

  test("a radius beyond half the smallest side is clamped to it", () => {
    const wide = { type: "rect" as const, x: 0, y: 0, w: 100, h: 40, rotation: 0 };
    assert.equal(cornerRadiusOf({ ...wide, cornerRadius: 999 }), 20);
    for (const toward of [{ x: 1000, y: -400 }, { x: 300, y: -60 }, { x: 0, y: -50 }]) {
      close(outlinePoint({ ...wide, cornerRadius: 999 }, toward), outlinePoint({ ...wide, cornerRadius: 20 }, toward));
    }
    close(portPoint({ ...wide, cornerRadius: 999 }, "NE"), portPoint({ ...wide, cornerRadius: 20 }, "NE"));
  });

  test("only a rectangle has rounded corners", () => {
    assert.equal(cornerRadiusOf({ type: "rect", w: 120, h: 60, cornerRadius: 6 }), 6);
    assert.equal(cornerRadiusOf({ type: "table", w: 120, h: 60, cornerRadius: 6 }), 0);
    assert.equal(cornerRadiusOf({ type: "custom", w: 120, h: 60, cornerRadius: 6 }), 0);
    assert.equal(cornerRadiusOf({ w: 120, h: 60 }), 0);
    close(outlinePoint({ ...rounded, type: "table" }, { x: 1200, y: -600 }), { x: 60, y: -30 });
  });
});
