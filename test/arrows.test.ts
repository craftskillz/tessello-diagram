import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contains } from "../src/lib/geometry.ts";
import { arrowAt, constrainAngle, distanceTo, endAt, endOf, headOf, isDrawable, layoutArrows, type Path, pathWithin, pointAlong, shiftSegment, snapWaypoint, startOf } from "../src/lib/arrows.ts";

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
  const arrow = (id: string, from: object, to: object, route: "straight" | "curved" | "elbow" = "straight", waypoints: object[] = []) =>
    ({ id, from, to, route, waypoints }) as Parameters<typeof layoutArrows>[1][number];
  /** A straight path from `start` to `end`, within a millionth. */
  const straight = (path: Path | undefined, start: { x: number; y: number }, end: { x: number; y: number }) => {
    assert.equal(path?.controls, null);
    assert.equal(path!.points.length, 2);
    close(startOf(path!), start, 1e-6);
    close(endOf(path!), end, 1e-6);
  };

  test("a single straight arrow goes from outline to outline, between the centers", () => {
    const path = layoutArrows(shapes, [arrow("1", auto("a"), auto("b"))]).get("1")!;
    assert.deepEqual(path, { points: [{ x: -140, y: 0 }, { x: 140, y: 0 }], controls: null });
  });

  test("an automatic end aims at the port the other end is attached to", () => {
    const path = layoutArrows(shapes, [arrow("1", auto("a"), { shapeId: "b", port: "N" })]).get("1")!;
    close(endOf(path), { x: 200, y: -30 });
    // From the center of A toward (200, −30), the right side of A is reached at y = −30 × 60 / 400.
    close(startOf(path), { x: -140, y: -4.5 });
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
    close(startOf(path), { x: -200, y: -30 });
    close(endOf(path), { x: 200, y: -30 });
    assert.equal(path.controls![0][0].x, -200);
    assert.ok(path.controls![0][0].y < -30);
    assert.equal(path.controls![0][1].x, 200);
    assert.ok(path.controls![0][1].y < -30);
  });

  test("arrows that share a port fan out from it, without crossing", () => {
    const paths = layoutArrows(shapes, [arrow("down", { shapeId: "a", port: "E" }, { x: 100, y: 50 }), arrow("up", { shapeId: "a", port: "E" }, { x: 100, y: -50 })]);
    close(startOf(paths.get("up")!), { x: -140, y: -4 });
    close(startOf(paths.get("down")!), { x: -140, y: 4 });
  });

  test("arrows that share a corner port fan out along the outline, never inside the shape", () => {
    const paths = layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "NE" }, { x: 0, y: -200 }), arrow("2", { shapeId: "a", port: "NE" }, { x: 100, y: 0 })]);
    const starts = ["1", "2"].map((id) => startOf(paths.get(id)!));
    // The top-right corner of A is at (−140, −30): each start is on its top side or on its right side.
    for (const start of starts) assert.ok(Math.abs(start.y + 30) < 1e-9 || Math.abs(start.x + 140) < 1e-9, JSON.stringify(start));
    assert.ok(Math.hypot(starts[0].x - starts[1].x, starts[0].y - starts[1].y) > 4, JSON.stringify(starts));
  });

  test("an arrow alone on its port starts on it", () => {
    close(startOf(layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "SE" }, { x: 0, y: 200 })]).get("1")!), { x: -140, y: 30 });
  });

  test("follows a shape that moved", () => {
    const moved = new Map(shapes).set("b", { ...b, y: 400 });
    // From B toward the center of A, the direction (−400, −400) reaches the top side of B first.
    close(endOf(layoutArrows(moved, [arrow("1", auto("a"), auto("b"))]).get("1")!), { x: 170, y: 370 });
  });

  test("an automatic end aims at a free end", () => {
    straight(layoutArrows(shapes, [arrow("1", auto("a"), { x: -200, y: 300 })]).get("1"), { x: -200, y: 30 }, { x: -200, y: 300 });
  });

  test("a straight arrow is a broken line through its waypoints, each automatic end aiming at the waypoint next to it", () => {
    const path = layoutArrows(shapes, [arrow("1", auto("a"), auto("b"), "straight", [{ x: -200, y: -200 }, { x: 200, y: -200 }])]).get("1")!;
    // Toward a waypoint straight above, each end leaves its shape by the top side, not toward the other shape.
    assert.deepEqual(path, { points: [{ x: -200, y: -30 }, { x: -200, y: -200 }, { x: 200, y: -200 }, { x: 200, y: -30 }], controls: null });
  });

  test("a curved arrow is a smooth curve through its waypoints", () => {
    const path = layoutArrows(shapes, [arrow("1", auto("a"), auto("b"), "curved", [{ x: 0, y: -200 }])]).get("1")!;
    close(path.points[1], { x: 0, y: -200 });
    assert.equal(path.controls!.length, 2);
    // At the waypoint, the curve runs parallel to the line between its neighbors: level, as they are at the same height.
    close(path.controls![0][1], { x: -path.controls![1][0].x, y: -200 }, 1e-6);
    assert.equal(path.controls![1][0].y, -200);
    assert.ok(distanceTo(path, { x: 0, y: -200 }) < 1e-9);
    // Each end leaves its shape toward the waypoint, by the top side.
    assert.ok(Math.abs(startOf(path).y + 30) < 1e-9 && Math.abs(endOf(path).y + 30) < 1e-9, JSON.stringify(path.points));
  });

  test("an elbow arrow between two shapes side by side goes straight from side to side", () => {
    straight(layoutArrows(shapes, [arrow("1", auto("a"), auto("b"), "elbow")]).get("1"), { x: -140, y: 0 }, { x: 140, y: 0 });
  });

  test("an elbow arrow leaves each shape perpendicular to its side, and turns halfway", () => {
    const lower = new Map(shapes).set("b", { ...b, y: 200 });
    const path = layoutArrows(lower, [arrow("1", auto("a"), auto("b"), "elbow")]).get("1")!;
    assert.deepEqual(path.points, [{ x: -140, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 }, { x: 140, y: 200 }]);
  });

  test("an elbow arrow leaves a port along the side it is on, and arrives on a port the same way", () => {
    const path = layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "N" }, { shapeId: "b", port: "S" }, "elbow")]).get("1")!;
    // Out of the top of A and into the bottom of B: up 20, across halfway, down below B, across, and up into it.
    assert.deepEqual(path.points, [{ x: -200, y: -30 }, { x: -200, y: -50 }, { x: 0, y: -50 }, { x: 0, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 30 }]);
  });

  test("an elbow arrow from a corner port leaves along the side that faces where it goes", () => {
    const path = layoutArrows(shapes, [arrow("1", { shapeId: "a", port: "NE" }, { x: -140, y: -200 }, "elbow")]).get("1")!;
    assert.deepEqual(path.points, [{ x: -140, y: -30 }, { x: -140, y: -200 }]);
  });

  test("an elbow arrow passes through its waypoints, with only horizontal and vertical segments", () => {
    // A segment moved down: its two corners are the waypoints.
    const path = layoutArrows(shapes, [arrow("1", auto("a"), auto("b"), "elbow", [{ x: -200, y: 100 }, { x: 200, y: 100 }])]).get("1")!;
    assert.deepEqual(path.points, [{ x: -200, y: 30 }, { x: -200, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 30 }]);
    const turned = layoutArrows(shapes, [arrow("1", { x: -300, y: 300 }, { x: 300, y: 300 }, "elbow", [{ x: 0, y: 200 }])]).get("1")!;
    assert.deepEqual(turned.points, [{ x: -300, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 200 }, { x: 0, y: 300 }, { x: 300, y: 300 }]);
  });

  /** Whether a path goes through the inside of a shape, anywhere but at its two ends. */
  const enters = (path: Path, shape: Parameters<typeof contains>[0]) =>
    path.points.slice(1).some((to, index) => {
      const from = path.points[index];
      return Array.from({ length: 99 }, (_, step) => (step + 1) / 100).some((t) => contains(shape, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }));
    });

  test("an elbow arrow from a port facing away from where it goes goes around its shape, never through it", () => {
    const routes = [
      arrow("west", { shapeId: "a", port: "W" }, auto("b"), "elbow"),
      arrow("east", { shapeId: "a", port: "E" }, { shapeId: "b", port: "E" }, "elbow"),
      // Routing around other shapes is beyond the spec: this one ends on a free point, on the side of its waypoint.
      arrow("back", { shapeId: "a", port: "E" }, { x: -400, y: 200 }, "elbow", [{ x: -400, y: 0 }]),
    ];
    const paths = layoutArrows(shapes, routes);
    for (const { id } of routes) {
      const path = paths.get(id)!;
      assert.ok(!enters(path, a) && !enters(path, b), `${id}: ${JSON.stringify(path.points)}`);
      assert.ok(path.points.slice(1).every((point, index) => point.x === path.points[index].x || point.y === path.points[index].y), `${id}: ${JSON.stringify(path.points)}`);
    }
    // Out of the west port of A, 20 to the west, then below it.
    assert.deepEqual(paths.get("west")!.points.slice(0, 3), [{ x: -260, y: 0 }, { x: -280, y: 0 }, { x: -280, y: 50 }]);
  });

  test("parallel elbow arrows between the same shapes are kept apart", () => {
    const lower = new Map(shapes).set("b", { ...b, y: 200 });
    const paths = layoutArrows(lower, [arrow("1", auto("a"), auto("b"), "elbow"), arrow("2", auto("a"), auto("b"), "elbow")]);
    assert.deepEqual(paths.get("1")!.points, [{ x: -140, y: -12 }, { x: -12, y: -12 }, { x: -12, y: 188 }, { x: 140, y: 188 }]);
    assert.deepEqual(paths.get("2")!.points, [{ x: -140, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 212 }, { x: 140, y: 212 }]);
  });

  test("keeps its waypoints where they are when a shape moves: only the segments at its ends follow", () => {
    const waypoints = [{ x: -200, y: -200 }, { x: 200, y: -200 }];
    const moved = new Map(shapes).set("b", { ...b, x: 300, y: 100 });
    const path = layoutArrows(moved, [arrow("1", auto("a"), auto("b"), "straight", waypoints)]).get("1")!;
    assert.deepEqual(path.points.slice(1, -1), waypoints);
    close(endOf(path), { x: 290, y: 70 });
  });

  test("an arrow attached to a shape that no longer exists has no path", () => {
    assert.equal(layoutArrows(shapes, [arrow("1", auto("a"), auto("gone"))]).has("1"), false);
  });
});

describe("a waypoint being dragged", () => {
  const neighbors = [{ x: 0, y: 0 }, { x: 200, y: 100 }];

  test("aligns exactly with a neighbor it is near, horizontally or vertically", () => {
    assert.deepEqual(snapWaypoint({ x: 4, y: 60 }, neighbors, 6), { x: 0, y: 60 });
    assert.deepEqual(snapWaypoint({ x: 120, y: 97 }, neighbors, 6), { x: 120, y: 100 });
    // Near both, it takes the corner where they meet.
    assert.deepEqual(snapWaypoint({ x: 3, y: 104 }, neighbors, 6), { x: 0, y: 100 });
  });

  test("stays where it is away from its neighbors, the reach being given so that it stays the same on screen", () => {
    assert.deepEqual(snapWaypoint({ x: 10, y: 60 }, neighbors, 6), { x: 10, y: 60 });
    assert.deepEqual(snapWaypoint({ x: 10, y: 60 }, neighbors, 12), { x: 0, y: 60 });
  });
});

describe("a segment of an elbow route being dragged", () => {
  const route: Path = { points: [{ x: -140, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 }, { x: 140, y: 200 }], controls: null };

  test("moves sideways, its corners becoming the waypoints of the arrow", () => {
    assert.deepEqual(shiftSegment(route, 1, { x: 50, y: 30 }), [{ x: 50, y: 0 }, { x: 50, y: 200 }]);
  });

  test("a level segment moves up or down", () => {
    const level: Path = { points: [{ x: 0, y: -30 }, { x: 0, y: -50 }, { x: 200, y: -50 }, { x: 200, y: -30 }], controls: null };
    assert.deepEqual(shiftSegment(level, 1, { x: 15, y: -40 }), [{ x: 0, y: -90 }, { x: 200, y: -90 }]);
  });
});

describe("the distance from a point to the path of an arrow", () => {
  const line: Path = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: null };
  // A symmetric curve: its middle is at (50, −60), where it runs level.
  const curve: Path = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: [[{ x: 0, y: -80 }, { x: 100, y: -80 }]] };

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
    ["low", { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: null }],
    ["high", { points: [{ x: 0, y: -8 }, { x: 100, y: -8 }], controls: null }],
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
    const { line, points } = headOf({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: null }, 10);
    assert.deepEqual(line, { points: [{ x: 0, y: 0 }, { x: 90, y: 0 }], controls: null });
    assert.deepEqual(points, [{ x: 100, y: 0 }, { x: 90, y: 5 }, { x: 90, y: -5 }]);
  });

  test("on a curve, the curve stops at its base, as long before the end, and the head points along the curve", () => {
    // The curve arrives straight down on its end.
    const { line, points } = headOf({ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], controls: [[{ x: 100, y: 0 }, { x: 100, y: 0 }]] }, 10);
    close(points[0], { x: 100, y: 100 });
    close(endOf(line), { x: 100, y: 90 }, 0.05);
    close(points[1], { x: 95, y: 90 }, 0.05);
    close(points[2], { x: 105, y: 90 }, 0.05);
    close(startOf(line), { x: 0, y: 0 });
  });
});

describe("a path within a rectangle", () => {
  const rectangle = { x: -10, y: -100, w: 120, h: 110 };

  test("is within when all of it is, curve included", () => {
    assert.equal(pathWithin({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: null }, rectangle), true);
    assert.equal(pathWithin({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: [[{ x: 0, y: -80 }, { x: 100, y: -80 }]] }, rectangle), true);
  });

  test("is not when a part of it is out, even if its ends are in", () => {
    assert.equal(pathWithin({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], controls: [[{ x: 0, y: -200 }, { x: 100, y: -200 }]] }, rectangle), false);
    assert.equal(pathWithin({ points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], controls: null }, rectangle), false);
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
