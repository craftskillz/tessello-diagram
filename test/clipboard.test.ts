import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyStyle, copyItems, copyStyle, pasteItems } from "../src/lib/clipboard.ts";
import { type Diagram, newArrow, newDiagram, newShape } from "../src/lib/diagram.ts";

/** Two grouped shapes joined by an arrow, a third shape, an arrow toward it and a free arrow. */
function sample(): Diagram {
  const diagram = newDiagram("d1", "Checkout", 0);
  const api = { ...newShape("api", { x: 0, y: 0 }, 0), text: "API", groupId: "g1" };
  const db = { ...newShape("db", { x: 200, y: 0 }, 1, "database"), groupId: "g1" };
  const web = newShape("web", { x: 0, y: 200 }, 2);
  diagram.shapes = [api, db, web];
  diagram.arrows = [
    { ...newArrow("a1", { shapeId: "api", port: "E" }, { shapeId: "db", port: null }, 3), waypoints: [{ x: 100, y: -50 }], label: "reads" },
    newArrow("a2", { shapeId: "web", port: null }, { shapeId: "api", port: null }, 4),
    newArrow("a3", { x: 400, y: 400 }, { x: 500, y: 400 }, 5),
  ];
  return diagram;
}

let counter = 0;
const ids = (prefix: string) => `${prefix}-new${++counter}`;

describe("copying a selection", () => {
  test("takes the selected shapes and the arrows whose two ends are in it", () => {
    const clip = copyItems(sample(), ["api", "db"]);
    assert.deepEqual(clip.shapes.map((shape) => shape.id), ["api", "db"]);
    assert.deepEqual(clip.arrows.map((arrow) => arrow.id), ["a1"]);
  });

  test("takes a selected free arrow, but not a selected arrow toward a shape left out", () => {
    const clip = copyItems(sample(), ["api", "a2", "a3"]);
    assert.deepEqual(clip.arrows.map((arrow) => arrow.id), ["a3"]);
  });

  test("keeps what it copied as it was, whatever happens to the diagram after", () => {
    const diagram = sample();
    const clip = copyItems(diagram, ["api"]);
    diagram.shapes[0].text = "changed";
    assert.equal(clip.shapes[0].text, "API");
  });
});

describe("pasting", () => {
  test("adds new shapes, moved by the offset, and arrows joining the new shapes", () => {
    const diagram = sample();
    const pasted = pasteItems(diagram, copyItems(diagram, ["api", "db"]), 40, ids);
    assert.equal(diagram.shapes.length, 5);
    const [api, db] = diagram.shapes.slice(3);
    assert.deepEqual([api.text, api.x, api.y, db.type, db.x, db.y], ["API", 40, 40, "database", 240, 40]);
    const arrow = diagram.arrows[3];
    assert.deepEqual(arrow.from, { shapeId: api.id, port: "E" });
    assert.deepEqual(arrow.to, { shapeId: db.id, port: null });
    assert.deepEqual(arrow.waypoints, [{ x: 140, y: -10 }]);
    assert.equal(arrow.label, "reads");
    assert.deepEqual(pasted, [api.id, db.id, arrow.id]);
    assert.ok(![...pasted].some((id) => ["api", "db", "a1"].includes(id)));
  });

  test("a pasted group is a new group, apart from the original", () => {
    const diagram = sample();
    pasteItems(diagram, copyItems(diagram, ["api", "db"]), 40, ids);
    const [api, db] = diagram.shapes.slice(3);
    assert.equal(api.groupId, db.groupId);
    assert.notEqual(api.groupId, null);
    assert.notEqual(api.groupId, "g1");
  });

  test("each paste makes another new group", () => {
    const diagram = sample();
    const clip = copyItems(diagram, ["api", "db"]);
    pasteItems(diagram, clip, 40, ids);
    pasteItems(diagram, clip, 80, ids);
    assert.notEqual(diagram.shapes[3].groupId, diagram.shapes[5].groupId);
  });

  test("a member of a group copied alone is pasted out of any group, and a locked copy is pasted unlocked", async () => {
    const diagram = sample();
    diagram.shapes[0].locked = true;
    pasteItems(diagram, copyItems(diagram, ["api"]), 40, ids);
    assert.deepEqual([diagram.shapes[3].groupId, diagram.shapes[3].locked], [null, false]);
  });

  test("moves a free arrow by the offset, and puts what is pasted in front, in its order", () => {
    const diagram = sample();
    pasteItems(diagram, copyItems(diagram, ["a3", "web"]), 40, ids);
    const arrow = diagram.arrows[3];
    assert.deepEqual([arrow.from, arrow.to], [{ x: 440, y: 440 }, { x: 540, y: 440 }]);
    assert.deepEqual([diagram.shapes[3].z, arrow.z], [6, 7]);
    assert.equal(diagram.shapes[3].groupId, null);
  });
});

describe("copying a style", () => {
  test("a shape gives its color, opacity, text size and alignment, and its size when asked", () => {
    const source = { ...newShape("s", { x: 0, y: 0 }, 0), color: "c-blue", opacity: 0.5, fontSize: 20, textAlign: "left" as const, textValign: "top" as const, w: 300, h: 90 };
    const target = { ...newShape("t", { x: 500, y: 0 }, 1, "ellipse"), text: "kept" };
    applyStyle(copyStyle(source, false), [target], []);
    assert.deepEqual(
      [target.color, target.opacity, target.fontSize, target.textAlign, target.textValign, target.w, target.h, target.x, target.text],
      ["c-blue", 0.5, 20, "left", "top", 120, 60, 500, "kept"],
    );
    applyStyle(copyStyle(source, true), [target], []);
    assert.deepEqual([target.w, target.h, target.x], [300, 90, 500]);
  });

  test("an arrow gives its heads, line, width, color, label size and route", () => {
    const source = { ...newArrow("a", { x: 0, y: 0 }, { x: 10, y: 0 }, 0), heads: "both" as const, dashed: true, width: 4, color: "c-red", labelSize: 18, route: "elbow" as const };
    const target = { ...newArrow("b", { x: 0, y: 50 }, { x: 10, y: 50 }, 1), label: "kept", waypoints: [{ x: 5, y: 80 }] };
    applyStyle(copyStyle(source, false), [], [target]);
    assert.deepEqual(
      [target.heads, target.dashed, target.width, target.color, target.labelSize, target.route, target.label, target.waypoints],
      ["both", true, 4, "c-red", 18, "elbow", "kept", [{ x: 5, y: 80 }]],
    );
  });

  test("applies only to what is of the same kind", () => {
    const arrowStyle = copyStyle({ ...newArrow("a", { x: 0, y: 0 }, { x: 10, y: 0 }, 0), color: "c-red" }, false);
    const shape = newShape("s", { x: 0, y: 0 }, 0);
    applyStyle(arrowStyle, [shape], []);
    assert.equal(shape.color, "c-gray");
  });

  test("keeps the style it copied, whatever happens to its source after", () => {
    const source = { ...newShape("s", { x: 0, y: 0 }, 0), color: "c-blue" };
    const style = copyStyle(source, false);
    source.color = "c-red";
    const target = newShape("t", { x: 0, y: 0 }, 0);
    applyStyle(style, [target], []);
    assert.equal(target.color, "c-blue");
  });
});
