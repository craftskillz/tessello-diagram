import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { arrowAt, constrainAngle, distanceTo, endAt, headOf, isDrawable, layoutArrows, type Path, pathWithin, pointAlong } from "../src/lib/arrows.ts";

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }, within = 1e-9) => {
  assert.ok(Math.abs(actual.x - expected.x) < within && Math.abs(actual.y - expected.y) < within, `${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
};

const rect = (id: string, x: number, y: number, more: object = {}) => ({ id, type: "rect" as const, x, y, w: 120, h: 60, rotation: 0, z: 0, locked: false, ...more });

describe("the end of an arrow released at a point", () => {
  const a = rect("a", 0, 0);

  test("is attached to a port when released on it, or within its reach", () => {
    // The north-east port of A is its top-right corner, at (60, −30).
    assert.deepEqual(endAt([a], { x: 60, y: -30 }, 8).end, { shapeId: "a", port: "NE" });
    assert.deepEqual(endAt([a], { x: 65, y: -34 }, 8).end, { shapeId: "a", port: "NE" });
  });

  test("is automatic when released elsewhere on the shape", () => {
    assert.deepEqual(endAt([a], { x: 10, y: 5 }, 8).end, { shapeId: "a", port: null });
  });

  test("is free when released on the empty canvas", () => {
    assert.deepEqual(endAt([a], { x: 300, y: 5 }, 8).end, { x: 300, y: 5 });
  });

  test("gives the shape and the port it aims at, to highlight them", () => {
    const target = endAt([a], { x: 60, y: -30 }, 8);
    assert.equal(target.shape?.id, "a");
    assert.equal(target.port, "NE");
    assert.equal(endAt([a], { x: 10, y: 5 }, 8).port, null);
  });

  test("the reach of a port is the one given, so that it stays the same on screen at any zoom", () => {
    assert.deepEqual(endAt([a], { x: 70, y: -30 }, 8).end, { x: 70, y: -30 });
    assert.deepEqual(endAt([a], { x: 70, y: -30 }, 12).end, { shapeId: "a", port: "NE" });
  });

  test("follows the ports of a turned shape", () => {
    // Turned by 90° clockwise, the north-east port of A is at (30, 60).
    assert.deepEqual(endAt([{ ...a, rotation: 90 }], { x: 30, y: 60 }, 8).end, { shapeId: "a", port: "NE" });
  });

  test("on overlapping shapes, attaches to the frontmost", () => {
    const front = rect("front", 40, 0, { z: 1 });
    assert.deepEqual(endAt([front, a], { x: 30, y: 10 }, 8).end, { shapeId: "front", port: null });
    assert.deepEqual(endAt([a, front], { x: 30, y: 10 }, 8).end, { shapeId: "front", port: null });
  });

  test("is free on a locked shape, which still says which shape it is on", () => {
    const locked = { ...a, locked: true };
    assert.deepEqual(endAt([locked], { x: 10, y: 5 }, 8).end, { x: 10, y: 5 });
    assert.deepEqual(endAt([locked], { x: 60, y: -30 }, 8).end, { x: 60, y: -30 });
    assert.equal(endAt([locked], { x: 10, y: 5 }, 8).shape?.id, "a");
  });
});

describe("the path of an arrow", () => {
  const a = rect("a", -200, 0);
  const b = rect("b", 200, 0);
  const shapes = new Map([a, b].map((shape) => [shape.id, shape]));
  const auto = (shapeId: string) => ({ shapeId, port: null });
  const arrow = (id: string, from: object, to: object, route: "straight" | "curved" = "straight") => ({ id, from, to, route }) as Parameters<typeof layoutArrows>[1][number];
  /** A straight path from `start` to `end`, within a millionth. */
  const straight = (path: Path | undefined, start: { x: number; y: number }, end: { x: number; y: number }) => {
    assert.equal(path?.controls, null);
    close(path!.start, start, 1e-6);
    close(path!.end, end, 1e-6);
  };

  test("a single straight arrow goes from outline to outline, between the centers", () => {
    const path = layoutArrows(shapes, [arrow("1", auto("a"), auto("b"))]).get("1")!;
    assert.deepEqual(path, { start: { x: -140, y: 0 }, end: { x: 140, y: 0 }, controls: null });
  });

  test("an automatic end aims at the port the other end is attached to", () => {
    const path = layoutArrows(shapes, [arrow("1", auto("a"), { shapeId: "b", port: "N" })]).get("1")!;
    close(path.end, { x: 200, y: -30 });
    // From the center of A toward (200, −30), the right side of A is reached at y = −30 × 60 / 400.
    close(path.start, { x: -140, y: -4.5 });
  });

  test("two straight arrows between the same shapes are drawn side by side", () => {
    const paths = layoutArrows(shapes, [arrow("1", auto("a"), auto("b")), arrow("2", auto("a"), auto("b"))]);
    straight(paths.get("1"), { x: -140, y: -12 }, { x: 140, y: -12 });
    straight(paths.get("2"), { x: -140, y: 12 }, { x: 140, y: 12 });
  });

  test("three straight arrows A→B, A→B and B→A are three distinct parallel lines", () => {
    const paths = layoutArrows(shapes, [arrow("1", auto("a"), auto("b")), arrow("2", auto("a"), auto("b")), arrow("3", auto("b"), auto("a"))]);
    straight(paths.get("1"), { x: -140, y: -24 }, { x: 140, y: -24 });
    straight(paths.get("2"), { x: -140, y: 0 }, { x: 140, y: 0 });
    straight(paths.get("3"), { x: 140, y: 24 }, { x: -140, y: 24 });
  });

  test("two curved arrows between the same shapes bend to opposite sides", () => {
    const paths = layoutArrows(shapes, [arrow("1", auto("a"), auto("b"), "curved"), arrow("2", auto("b"), auto("a"), "curved")]);
    const middles = ["1", "2"].map((id) => pointAlong(paths.get(id)!, 0.5));
    assert.ok(middles[0].y < -20 && middles[1].y > 20, JSON.stringify(middles));
  });

  test("a curved arrow leaves a port in the direction the port faces", () => {
    const path = layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "N" }, { shapeId: "b", port: "N" }, "curved")]).get("1")!;
    close(path.start, { x: -200, y: -30 });
    close(path.end, { x: 200, y: -30 });
    assert.equal(path.controls![0].x, -200);
    assert.ok(path.controls![0].y < -30);
    assert.equal(path.controls![1].x, 200);
    assert.ok(path.controls![1].y < -30);
  });

  test("arrows that share a port fan out from it, without crossing", () => {
    const paths = layoutArrows(shapes, [arrow("down", { shapeId: "a", port: "E" }, { x: 100, y: 50 }), arrow("up", { shapeId: "a", port: "E" }, { x: 100, y: -50 })]);
    close(paths.get("up")!.start, { x: -140, y: -4 });
    close(paths.get("down")!.start, { x: -140, y: 4 });
  });

  test("arrows that share a corner port fan out along the outline, never inside the shape", () => {
    const paths = layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "NE" }, { x: 0, y: -200 }), arrow("2", { shapeId: "a", port: "NE" }, { x: 100, y: 0 })]);
    const starts = ["1", "2"].map((id) => paths.get(id)!.start);
    // The top-right corner of A is at (−140, −30): each start is on its top side or on its right side.
    for (const start of starts) assert.ok(Math.abs(start.y + 30) < 1e-9 || Math.abs(start.x + 140) < 1e-9, JSON.stringify(start));
    assert.ok(Math.hypot(starts[0].x - starts[1].x, starts[0].y - starts[1].y) > 4, JSON.stringify(starts));
  });

  test("an arrow alone on its port starts on it", () => {
    close(layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "SE" }, { x: 0, y: 200 })]).get("1")!.start, { x: -140, y: 30 });
  });

  test("follows a shape that moved", () => {
    const moved = new Map(shapes).set("b", { ...b, y: 400 });
    // From B toward the center of A, the direction (−400, −400) reaches the top side of B first.
    close(layoutArrows(moved, [arrow("1", auto("a"), auto("b"))]).get("1")!.end, { x: 170, y: 370 });
  });

  test("an automatic end aims at a free end", () => {
    straight(layoutArrows(shapes, [arrow("1", auto("a"), { x: -200, y: 300 })]).get("1"), { x: -200, y: 30 }, { x: -200, y: 300 });
  });

  test("an arrow attached to a shape that no longer exists has no path", () => {
    assert.equal(layoutArrows(shapes, [arrow("1", auto("a"), auto("gone"))]).has("1"), false);
  });
});

describe("the distance from a point to the path of an arrow", () => {
  const line: Path = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: null };
  // A symmetric curve: its middle is at (50, −60), where it runs level.
  const curve: Path = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: [{ x: 0, y: -80 }, { x: 100, y: -80 }] };

  test("on a straight path, is the distance to the segment, not to its line", () => {
    assert.equal(distanceTo(line, { x: 50, y: 10 }), 10);
    assert.equal(distanceTo(line, { x: -30, y: 40 }), 50);
  });

  test("on a curve, is the distance to the curve as drawn, near its start, its middle and its end", () => {
    assert.ok(distanceTo(curve, { x: 1, y: -10 }) < 1);
    assert.ok(Math.abs(distanceTo(curve, { x: 50, y: -80 }) - 20) < 0.5);
    assert.ok(distanceTo(curve, { x: 50, y: -60 }) < 0.5);
    // At t = 0.9: (100 × 0.243 + 100 × 0.729, −80 × 0.027 − 80 × 0.243).
    assert.ok(distanceTo(curve, { x: 97.2, y: -21.6 }) < 0.5);
    // The chord between the ends is not the curve.
    assert.ok(distanceTo(curve, { x: 50, y: 0 }) > 30);
  });
});

describe("the arrow under a point", () => {
  const paths = new Map<string, Path>([
    ["low", { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: null }],
    ["high", { start: { x: 0, y: -8 }, end: { x: 100, y: -8 }, controls: null }],
  ]);
  const arrows = [
    { id: "low", z: 0 },
    { id: "high", z: 1 },
  ];

  test("is the nearest one within the reach", () => {
    assert.equal(arrowAt(arrows, paths, { x: 50, y: 2 }, 5)?.id, "low");
    assert.equal(arrowAt(arrows, paths, { x: 50, y: -7 }, 5)?.id, "high");
  });

  test("is none beyond the reach, which is given so that it stays the same on screen at any zoom", () => {
    assert.equal(arrowAt(arrows, paths, { x: 50, y: 12 }, 5), undefined);
    assert.equal(arrowAt(arrows, paths, { x: 50, y: 12 }, 15)?.id, "low");
  });

  test("at equal distance, is the frontmost", () => {
    assert.equal(arrowAt(arrows, paths, { x: 50, y: -4 }, 5)?.id, "high");
  });
});

describe("the head of an arrow", () => {
  test("on a straight path, its tip is on the end and the line stops at its base", () => {
    const { line, points } = headOf({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: null }, 10);
    assert.deepEqual(line, { start: { x: 0, y: 0 }, end: { x: 90, y: 0 }, controls: null });
    assert.deepEqual(points, [{ x: 100, y: 0 }, { x: 90, y: 5 }, { x: 90, y: -5 }]);
  });

  test("on a curve, the curve stops at its base, as long before the end, and the head points along the curve", () => {
    // The curve arrives straight down on its end.
    const { line, points } = headOf({ start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, controls: [{ x: 100, y: 0 }, { x: 100, y: 0 }] }, 10);
    close(points[0], { x: 100, y: 100 });
    close(line.end, { x: 100, y: 90 }, 0.05);
    close(points[1], { x: 95, y: 90 }, 0.05);
    close(points[2], { x: 105, y: 90 }, 0.05);
    close(line.start, { x: 0, y: 0 });
  });
});

describe("a path within a rectangle", () => {
  const rectangle = { x: -10, y: -100, w: 120, h: 110 };

  test("is within when all of it is, curve included", () => {
    assert.equal(pathWithin({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: null }, rectangle), true);
    assert.equal(pathWithin({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: [{ x: 0, y: -80 }, { x: 100, y: -80 }] }, rectangle), true);
  });

  test("is not when a part of it is out, even if its ends are in", () => {
    assert.equal(pathWithin({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, controls: [{ x: 0, y: -200 }, { x: 100, y: -200 }] }, rectangle), false);
    assert.equal(pathWithin({ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, controls: null }, rectangle), false);
  });
});

describe("an arrow being drawn", () => {
  test("with Shift, turns by steps of 45° around its start, keeping its length", () => {
    close(constrainAngle({ x: 0, y: 0 }, { x: 100, y: 10 }), { x: Math.hypot(100, 10), y: 0 });
    const length = Math.hypot(90, 100);
    close(constrainAngle({ x: 10, y: 10 }, { x: 100, y: 110 }), { x: 10 + length / Math.SQRT2, y: 10 + length / Math.SQRT2 });
    close(constrainAngle({ x: 0, y: 0 }, { x: -5, y: -100 }), { x: 0, y: -Math.hypot(5, 100) });
  });

  test("is drawable between two shapes, two ports of one shape, or anything free", () => {
    assert.equal(isDrawable({ shapeId: "a", port: null }, { shapeId: "b", port: null }), true);
    assert.equal(isDrawable({ shapeId: "a", port: "N" }, { shapeId: "a", port: "E" }), true);
    assert.equal(isDrawable({ x: 0, y: 0 }, { shapeId: "a", port: null }), true);
  });

  test("is not drawable from a shape to itself automatically, nor from a port to itself", () => {
    assert.equal(isDrawable({ shapeId: "a", port: null }, { shapeId: "a", port: null }), false);
    assert.equal(isDrawable({ shapeId: "a", port: "N" }, { shapeId: "a", port: null }), false);
    assert.equal(isDrawable({ shapeId: "a", port: "N" }, { shapeId: "a", port: "N" }), false);
  });
});
