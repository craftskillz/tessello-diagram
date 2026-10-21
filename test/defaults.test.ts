import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { arrowAsDefault, createArrow, createShape, outOfBounds, readDefaults, shapeAsDefault } from "../src/lib/defaults.ts";
import { newArrow, newShape } from "../src/lib/diagram.ts";

const rect = { w: 120, h: 60, fontSize: 14, color: "c-gray" };

describe("the creation defaults read from the storage", () => {
  test("nothing stored yet is the factory values", () => {
    const defaults = readDefaults(null);
    assert.deepEqual(defaults.arrows, { heads: "end", dashed: false, labelSize: 12, route: "straight", width: 2, color: "c-slate" });
    assert.deepEqual(defaults.shapes.rect, rect);
    assert.deepEqual(defaults.shapes.postit, { w: 120, h: 100, fontSize: 14, color: "c-amber" });
    assert.deepEqual(Object.keys(defaults.shapes), ["rect", "ellipse", "database", "circle", "actor", "postit", "text"]);
  });

  test("the values stored are kept", () => {
    const arrows = { heads: "both", dashed: true, labelSize: 20, route: "elbow", width: 3.5, color: "c-red" };
    const defaults = readDefaults({ arrows, shapes: { rect: { w: 200, h: 10, fontSize: 72, color: "c-blue" } } });
    assert.deepEqual(defaults.arrows, arrows);
    assert.deepEqual(defaults.shapes.rect, { w: 200, h: 10, fontSize: 72, color: "c-blue" });
    assert.deepEqual(defaults.shapes.ellipse, rect);
  });

  test("a value missing, out of bounds or of another kind takes its factory value, and the others are kept", () => {
    const defaults = readDefaults({
      arrows: { heads: "sideways", dashed: "yes", labelSize: 5, route: "straight", width: 9, color: 4 },
      shapes: { rect: { w: 801, h: 9, fontSize: 73, color: "c-teal" }, ellipse: "round", nothing: { w: 50 } },
    });
    assert.deepEqual(defaults.arrows, { heads: "end", dashed: false, labelSize: 12, route: "straight", width: 2, color: "c-slate" });
    assert.deepEqual(defaults.shapes.rect, { ...rect, color: "c-teal" });
    assert.deepEqual(defaults.shapes.ellipse, rect);
    assert.equal("nothing" in defaults.shapes, false);
  });

  test("a value that is not defaults at all is the factory values", () => {
    for (const value of ["defaults", [1, 2], { arrows: null, shapes: [] }]) assert.deepEqual(readDefaults(value), readDefaults(null));
  });

  test("the circle and the actor keep their proportions: their height follows their width", () => {
    const { circle, actor } = readDefaults({ shapes: { circle: { w: 100, h: 40 }, actor: { w: 60, h: 60 } } }).shapes;
    assert.deepEqual([circle.w, circle.h], [100, 100]);
    assert.deepEqual([actor.w, actor.h], [60, 104]);
  });

  test("an actor so wide that its height would be out of bounds takes its factory size", () => {
    const { actor } = readDefaults({ shapes: { actor: { w: 500 } } }).shapes;
    assert.deepEqual([actor.w, actor.h], [36, 62.4]);
  });
});

describe("shapes and arrows created with the defaults", () => {
  const defaults = readDefaults({
    arrows: { heads: "both", dashed: true, labelSize: 18, route: "elbow", width: 4, color: "c-red" },
    shapes: { rect: { w: 300, h: 40, fontSize: 24, color: "c-blue" } },
  });

  test("a new shape takes the size, text size and color of its type, centered where it is placed", () => {
    const shape = createShape(defaults, "s1", { x: 10, y: 20 }, 3, "rect");
    assert.deepEqual(
      { id: shape.id, type: shape.type, x: shape.x, y: shape.y, z: shape.z, w: shape.w, h: shape.h, fontSize: shape.fontSize, color: shape.color, text: shape.text },
      { id: "s1", type: "rect", x: 10, y: 20, z: 3, w: 300, h: 40, fontSize: 24, color: "c-blue", text: "" },
    );
    assert.deepEqual([createShape(defaults, "s2", { x: 0, y: 0 }, 0, "ellipse")].map(({ w, h, color }) => [w, h, color]), [[120, 60, "c-gray"]]);
  });

  test("a new arrow takes the style of the defaults, with no label and no waypoint", () => {
    const arrow = createArrow(defaults, "a1", { x: 0, y: 0 }, { shapeId: "s1", port: null }, 5);
    assert.deepEqual(
      { heads: arrow.heads, dashed: arrow.dashed, labelSize: arrow.labelSize, route: arrow.route, width: arrow.width, color: arrow.color, label: arrow.label, waypoints: arrow.waypoints, z: arrow.z },
      { heads: "both", dashed: true, labelSize: 18, route: "elbow", width: 4, color: "c-red", label: "", waypoints: [], z: 5 },
    );
    assert.deepEqual(arrow.to, { shapeId: "s1", port: null });
  });
});

describe("Save as default", () => {
  test("for this shape type: its size, text size and color become the defaults of its type alone", () => {
    const shape = { ...newShape("s", { x: 0, y: 0 }, 0, "database"), w: 90, h: 140, fontSize: 20, color: "c-green", text: "orders", opacity: 0.5 };
    const defaults = shapeAsDefault(readDefaults(null), shape);
    assert.deepEqual(defaults.shapes.database, { w: 90, h: 140, fontSize: 20, color: "c-green" });
    assert.deepEqual(defaults.shapes.rect, rect);
  });

  test("a shape larger or smaller than the bounds of the defaults gives them their nearest bound", () => {
    const shape = { ...newShape("s", { x: 0, y: 0 }, 0, "rect"), w: 1200, h: 4 };
    assert.deepEqual(shapeAsDefault(readDefaults(null), shape).shapes.rect, { ...rect, w: 800, h: 10 });
  });

  test("for arrows: its heads, line, label size, route, width and color become the defaults of the arrows", () => {
    const arrow = { ...newArrow("a", { x: 0, y: 0 }, { x: 10, y: 0 }, 0), heads: "none" as const, dashed: true, labelSize: 16, route: "curved" as const, width: 1.5, color: "c-purple", label: "calls" };
    const defaults = shapeAsDefault(arrowAsDefault(readDefaults(null), arrow), newShape("s", { x: 0, y: 0 }, 0, "text"));
    assert.deepEqual(defaults.arrows, { heads: "none", dashed: true, labelSize: 16, route: "curved", width: 1.5, color: "c-purple" });
  });
});

describe("the bounds of the Diagram defaults dialog", () => {
  test("the factory values are within their bounds", () => {
    assert.deepEqual(outOfBounds(readDefaults(null)), []);
  });

  test("sizes go from 10 to 800, text from 6 to 72, the width of a line from 1 to 8; an empty field is out of them", () => {
    const form = readDefaults(null);
    form.shapes.rect = { ...form.shapes.rect, w: 9, h: 800 };
    form.shapes.postit = { ...form.shapes.postit, h: 801, fontSize: 5 };
    form.shapes.text = { ...form.shapes.text, w: 10, fontSize: 72 };
    form.shapes.ellipse = { ...form.shapes.ellipse, w: null as unknown as number };
    form.arrows = { ...form.arrows, labelSize: 73, width: 0.5 };
    assert.deepEqual(outOfBounds(form).sort(), ["arrows.labelSize", "arrows.width", "shapes.ellipse.w", "shapes.postit.fontSize", "shapes.postit.h", "shapes.rect.w"]);
  });

  test("the width of an actor is out of bounds when the height that follows it is", () => {
    const form = readDefaults(null);
    form.shapes.actor = { ...form.shapes.actor, w: 500 };
    assert.deepEqual(outOfBounds(form), ["shapes.actor.w"]);
  });
});
