import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newArrow, newDiagram, newShape, readDiagram, readIndex, removeShape } from "../src/lib/diagram.ts";

describe("reading the index of diagrams", () => {
  test("nothing stored yet is an empty index", () => {
    assert.deepEqual(readIndex(null), []);
  });

  test("keeps each entry, and skips what is not one", () => {
    assert.deepEqual(
      readIndex([{ id: "d1", title: "Checkout", updatedAt: 10 }, "junk", { title: "no id" }, { id: "d2", title: 42, updatedAt: "x" }]),
      [
        { id: "d1", title: "Checkout", updatedAt: 10 },
        { id: "d2", title: "", updatedAt: 0 },
      ],
    );
  });

  test("a value that is not a list is an empty index", () => {
    assert.deepEqual(readIndex({ d1: "Checkout" }), []);
  });
});

describe("reading a stored diagram", () => {
  test("keeps a well-formed diagram as it is", () => {
    const diagram = {
      id: "d1",
      title: "Checkout",
      updatedAt: 10,
      shapes: [
        {
          id: "s1",
          type: "rect",
          x: -200,
          y: 0,
          w: 120,
          h: 60,
          rotation: 0,
          text: "API",
          fontSize: 14,
          textAlign: "center",
          textValign: "middle",
          textRotation: 15,
          color: "c-blue",
          opacity: 1,
          groupId: null,
          locked: false,
          link: null,
          z: 0,
        },
      ],
      arrows: [
        {
          id: "a1",
          from: { shapeId: "s1", port: null },
          to: { x: 100, y: 50 },
          route: "straight",
          waypoints: [],
          heads: "end",
          dashed: false,
          width: 2,
          color: "#64748b",
          label: "",
          locked: false,
          z: 1,
        },
      ],
      grid: true,
      guides: true,
    };
    assert.deepEqual(readDiagram(diagram, "d1"), diagram);
  });

  test("fills in what is missing with the creation values", () => {
    const read = readDiagram({ shapes: [{ id: "s1", x: 10, y: 20 }], arrows: [{ id: "a1", from: { shapeId: "s1" }, to: { shapeId: "s1", port: "N" } }] }, "d1");
    assert.equal(read.id, "d1");
    assert.equal(read.title, "");
    assert.deepEqual(
      { ...read.shapes[0] },
      { id: "s1", type: "rect", x: 10, y: 20, w: 120, h: 60, rotation: 0, text: "", fontSize: 14, textAlign: "center", textValign: "middle", textRotation: 0, color: "c-gray", opacity: 1, groupId: null, locked: false, link: null, z: 0 },
    );
    assert.deepEqual(read.arrows[0].from, { shapeId: "s1", port: null });
    assert.deepEqual(read.arrows[0].to, { shapeId: "s1", port: "N" });
    assert.equal(read.arrows[0].route, "straight");
    assert.equal(read.arrows[0].heads, "end");
  });

  test("a shape missing its size or its color takes those of its type", () => {
    const [database, postit] = readDiagram(
      { shapes: [{ id: "s1", type: "database", x: 0, y: 0 }, { id: "s2", type: "postit", x: 0, y: 0, w: 200 }] },
      "d1",
    ).shapes;
    assert.deepEqual([database.w, database.h, database.color], [60, 80, "c-gray"]);
    assert.deepEqual([postit.w, postit.h, postit.color], [200, 100, "c-amber"]);
  });

  test("skips shapes without an id or a position, and arrows whose ends cannot be read", () => {
    const read = readDiagram(
      {
        shapes: [{ id: "s1", x: 0, y: 0 }, { x: 5, y: 5 }, { id: "s2", x: "far" }, null],
        arrows: [
          { id: "a1", from: { shapeId: "s1" }, to: { x: 1, y: 2 } },
          { id: "a2", from: { shapeId: 3 }, to: { x: 1, y: 2 } },
          { id: "a3", from: { shapeId: "s1" } },
          { from: { shapeId: "s1" }, to: { x: 1, y: 2 } },
        ],
      },
      "d1",
    );
    assert.deepEqual(read.shapes.map((shape) => shape.id), ["s1"]);
    assert.deepEqual(read.arrows.map((arrow) => arrow.id), ["a1"]);
  });

  test("replaces values of the wrong kind", () => {
    const [shape] = readDiagram({ shapes: [{ id: "s1", x: 0, y: 0, w: -5, type: "hexagon", textAlign: "justify", opacity: 7, locked: "yes" }] }, "d1").shapes;
    assert.equal(shape.w, 120);
    assert.equal(shape.type, "rect");
    assert.equal(shape.textAlign, "center");
    assert.equal(shape.opacity, 1);
    assert.equal(shape.locked, false);
  });

  test("a text size out of 8–48 is brought back within it", () => {
    const [big, small] = readDiagram({ shapes: [{ id: "s1", x: 0, y: 0, fontSize: 200 }, { id: "s2", x: 0, y: 0, fontSize: 2 }] }, "d1").shapes;
    assert.deepEqual([big.fontSize, small.fontSize], [48, 8]);
  });

  test("a value that is not a diagram is an empty diagram", () => {
    for (const value of [null, "junk", [1, 2]]) {
      assert.deepEqual(readDiagram(value, "d1"), { id: "d1", title: "", updatedAt: 0, shapes: [], arrows: [], grid: true, guides: true });
    }
  });
});

describe("removing a shape", () => {
  test("frees the ends of the arrows attached to it, where they were drawn, and keeps the arrows", () => {
    const diagram = newDiagram("d1", "Checkout", 0);
    diagram.shapes.push(newShape("a", { x: -200, y: 0 }, 0), newShape("b", { x: 200, y: 0 }, 1));
    diagram.arrows.push(newArrow("ab", { shapeId: "a", port: null }, { shapeId: "b", port: null }, 2));
    removeShape(diagram, "b");
    assert.deepEqual(diagram.shapes.map((shape) => shape.id), ["a"]);
    // The 120 × 60 rectangle B ended the arrow at the middle of its left side.
    assert.deepEqual(diagram.arrows[0].from, { shapeId: "a", port: null });
    assert.deepEqual(diagram.arrows[0].to, { x: 140, y: 0 });
  });
});
