import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Diagram, newArrow, newDiagram, newShape } from "../src/lib/diagram.ts";
import { isPresent, record, redo, STEPS, startHistory, undo } from "../src/lib/history.ts";

/** A diagram with one shape, at x = 0. */
function sample(): Diagram {
  const diagram = newDiagram("d1", "Checkout", 0);
  diagram.shapes = [newShape("api", { x: 0, y: 0 }, 0)];
  return diagram;
}

/**
 * Two grouped shapes, one of them locked and linked, an arrow between them with waypoints, a style and a label, a free
 * arrow, and a shape of each other type.
 */
function rich(): Diagram {
  const diagram = { ...newDiagram("d2", "Payments", 1234), grid: true, guides: true };
  diagram.shapes = [
    { ...newShape("api", { x: 0, y: 0 }, 0), text: "API", groupId: "g1" },
    { ...newShape("db", { x: 200, y: 0 }, 1, "database"), color: "c-teal", opacity: 0.8, groupId: "g1", locked: true, link: { type: "url", value: "https://example.com" } },
    ...(["ellipse", "circle", "actor", "postit", "text", "image", "custom"] as const).map((type, index) => newShape(type, { x: index * 100, y: 300 }, 4 + index, type)),
  ];
  diagram.arrows = [
    {
      ...newArrow("a1", { shapeId: "api", port: "E" }, { shapeId: "db", port: null }, 2),
      route: "curved",
      waypoints: [{ x: 100, y: -50 }],
      heads: "start",
      dashed: true,
      width: 3.5,
      color: "c-indigo",
      label: "reads",
      labelSize: 16,
      labelWidth: 80,
      labelRotation: 15,
      labelAt: 0.25,
      labelOffset: -12,
    },
    newArrow("a2", { x: 400, y: 400 }, { x: 500, y: 400 }, 3),
  ];
  return diagram;
}

describe("the undo history", () => {
  test("undoes a change, then redoes it", () => {
    const diagram = sample();
    const history = startHistory(diagram);
    diagram.shapes[0].x = 100;
    record(history, diagram);

    assert.equal(undo(history, diagram), true);
    assert.equal(diagram.shapes[0].x, 0);
    assert.equal(redo(history, diagram), true);
    assert.equal(diagram.shapes[0].x, 100);
  });

  test("a change after an undo drops what was undone", () => {
    const diagram = sample();
    const history = startHistory(diagram);
    diagram.shapes[0].x = 100;
    record(history, diagram);
    undo(history, diagram);
    diagram.shapes[0].y = 50;
    record(history, diagram);

    assert.equal(redo(history, diagram), false);
    assert.deepEqual([diagram.shapes[0].x, diagram.shapes[0].y], [0, 50]);
    undo(history, diagram);
    assert.deepEqual([diagram.shapes[0].x, diagram.shapes[0].y], [0, 0]);
  });

  test("a save that changes nothing is not a step, even after an undo", () => {
    const diagram = sample();
    const history = startHistory(diagram);
    record(history, diagram);
    assert.equal(undo(history, diagram), false);

    diagram.shapes[0].x = 100;
    record(history, diagram);
    undo(history, diagram);
    record(history, diagram);
    assert.equal(redo(history, diagram), true);
    assert.equal(diagram.shapes[0].x, 100);
  });

  test("restores the whole diagram: every shape and arrow with all their values, the order, the title, the grid and the guides", () => {
    const diagram = rich();
    const history = startHistory(diagram);
    const changes: ((diagram: Diagram) => void)[] = [
      (d) => Object.assign(d.shapes[0], { x: 300, w: 200, rotation: 45, text: "Gateway", fontSize: 20, textAlign: "left", textValign: "top", textRotation: 90 }),
      (d) => Object.assign(d.shapes[1], { type: "custom", color: "c-blue", opacity: 0.5, groupId: null, locked: false, link: null }),
      (d) => Object.assign(d.arrows[0], { from: { x: 1, y: 2 }, to: { shapeId: "db", port: "S" }, route: "elbow", waypoints: [] }),
      (d) => Object.assign(d.arrows[0], { heads: "both", dashed: false, width: 6, color: "c-red" }),
      (d) => Object.assign(d.arrows[0], { label: "", labelSize: 30, labelWidth: null, labelRotation: 0, labelAt: 0.9, labelOffset: 0, locked: true }),
      (d) => d.shapes.forEach((shape, z) => (shape.z = 10 - z)),
      (d) => d.arrows.splice(1, 1),
      (d) => d.shapes.push(newShape("new", { x: 0, y: 0 }, 20, "postit")),
      (d) => Object.assign(d, { title: "Renamed", grid: false, guides: false }),
    ];
    for (const change of changes) {
      change(diagram);
      record(history, diagram);
    }

    while (undo(history, diagram));
    assert.deepEqual(diagram, rich());
  });

  test("goes on with a diagram read again as it is, but not with one changed meanwhile", () => {
    const diagram = sample();
    const history = startHistory(diagram);
    diagram.shapes[0].x = 100;
    record(history, diagram);

    const reread = sample();
    reread.shapes[0].x = 100;
    assert.equal(isPresent(history, reread), true);
    reread.shapes[0].y = 7;
    assert.equal(isPresent(history, reread), false);
  });

  test("an undo removes what the diagram holds that the earlier state did not", () => {
    const diagram = sample();
    const history = startHistory(diagram);
    Object.assign(diagram, { theme: "dark" });
    record(history, diagram);
    undo(history, diagram);
    assert.equal("theme" in diagram, false);
  });

  test("keeps the last 100 steps", () => {
    assert.equal(STEPS, 100);
    const diagram = sample();
    const history = startHistory(diagram);
    for (let x = 1; x <= 150; x++) {
      diagram.shapes[0].x = x;
      record(history, diagram);
    }

    let undone = 0;
    while (undo(history, diagram)) undone++;
    assert.equal(undone, 100);
    assert.equal(diagram.shapes[0].x, 50);
  });
});
