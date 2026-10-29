import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detachEnds, groupShapes, newArrow, newDiagram, newShape, readDiagram, readIndex, removeShape, ungroupShapes, withGroups } from "../src/lib/diagram.ts";

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
          color: "c-blue",
          label: "calls",
          labelSize: 14,
          labelWidth: 80,
          labelRotation: -15,
          labelAt: 0.3,
          labelOffset: -12,
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

  test("a shape keeps its link to a URL or to another diagram, and a link that cannot be read is no link", () => {
    const links = [{ type: "url", value: "https://example.com/doc" }, { type: "diagram", value: "d2" }, { type: "url", value: "mailto:team@example.com" }];
    const read = (link: unknown) => readDiagram({ shapes: [{ id: "s1", x: 0, y: 0, link }] }, "d1").shapes[0].link;
    for (const link of links) assert.deepEqual(read(link), link);
    for (const link of [null, "https://example.com", { type: "page", value: "x" }, { type: "diagram" }, { type: "url", value: " " }]) assert.equal(read(link), null);
  });

  test("a stored URL link without http(s), mailto or tel gets https://, so that a link never runs a script", () => {
    const read = (value: string) => readDiagram({ shapes: [{ id: "s1", x: 0, y: 0, link: { type: "url", value } }] }, "d1").shapes[0].link;
    assert.deepEqual(read("example.com"), { type: "url", value: "https://example.com" });
    assert.deepEqual(read("javascript:alert(1)"), { type: "url", value: "https://javascript:alert(1)" });
    assert.deepEqual(read("tel:+33100000000"), { type: "url", value: "tel:+33100000000" });
  });

  test("a text size out of 6–72 is brought back within it", () => {
    const [big, small] = readDiagram({ shapes: [{ id: "s1", x: 0, y: 0, fontSize: 200 }, { id: "s2", x: 0, y: 0, fontSize: 2 }] }, "d1").shapes;
    assert.deepEqual([big.fontSize, small.fontSize], [72, 6]);
  });

  test("an arrow takes its creation style and a label in the middle of its line, at its automatic width, where they are missing", () => {
    const [arrow] = readDiagram({ arrows: [{ id: "a1", from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }] }, "d1").arrows;
    assert.deepEqual(
      { heads: arrow.heads, dashed: arrow.dashed, width: arrow.width, color: arrow.color, labelSize: arrow.labelSize, labelWidth: arrow.labelWidth, labelRotation: arrow.labelRotation, labelAt: arrow.labelAt, labelOffset: arrow.labelOffset },
      { heads: "end", dashed: false, width: 2, color: "c-slate", labelSize: 12, labelWidth: null, labelRotation: 0, labelAt: 0.5, labelOffset: 0 },
    );
  });

  test("brings the style of an arrow back within its bounds: width 1–8 by steps of 0.5, label size 6–72, label along its line", () => {
    const ends = { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const [thick, thin, odd] = readDiagram(
      {
        arrows: [
          { id: "a1", ...ends, width: 20, labelSize: 100, labelAt: 3, labelWidth: -4 },
          { id: "a2", ...ends, width: 0.2, labelSize: 1, labelAt: -1 },
          { id: "a3", ...ends, width: 2.3, labelWidth: "wide", labelRotation: "up" },
        ],
      },
      "d1",
    ).arrows;
    assert.deepEqual([thick.width, thin.width, odd.width], [8, 1, 2.5]);
    assert.deepEqual([thick.labelSize, thin.labelSize], [72, 6]);
    assert.deepEqual([thick.labelAt, thin.labelAt], [1, 0]);
    assert.deepEqual([thick.labelWidth, odd.labelWidth, odd.labelRotation], [null, null, 0]);
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

  test("frees the ends where they were drawn, even when the arrow was spread beside another", () => {
    const diagram = newDiagram("d1", "Checkout", 0);
    diagram.shapes.push(newShape("a", { x: -200, y: 0 }, 0), newShape("b", { x: 200, y: 0 }, 1));
    diagram.arrows.push(newArrow("1", { shapeId: "a", port: null }, { shapeId: "b", port: null }, 2));
    diagram.arrows.push(newArrow("2", { shapeId: "a", port: null }, { shapeId: "b", port: null }, 3));
    removeShape(diagram, "b");
    // Two parallel arrows are drawn 24 apart, 12 on each side of the line between the centers.
    const ends = diagram.arrows.map((arrow) => arrow.to as { x: number; y: number });
    assert.ok(Math.abs(ends[0].x - 140) < 1e-6 && Math.abs(ends[0].y + 12) < 1e-6, JSON.stringify(ends));
    assert.ok(Math.abs(ends[1].x - 140) < 1e-6 && Math.abs(ends[1].y - 12) < 1e-6, JSON.stringify(ends));
  });

  test("with its arrows, also removes every arrow attached to it, and keeps the others", () => {
    const diagram = newDiagram("d1", "Checkout", 0);
    diagram.shapes.push(newShape("a", { x: -200, y: 0 }, 0), newShape("b", { x: 200, y: 0 }, 1));
    diagram.arrows.push(newArrow("ab", { shapeId: "a", port: null }, { shapeId: "b", port: "N" }, 2));
    diagram.arrows.push(newArrow("free", { x: 0, y: 100 }, { shapeId: "a", port: null }, 3));
    removeShape(diagram, "b", { withArrows: true });
    assert.deepEqual(diagram.arrows.map((arrow) => arrow.id), ["free"]);
  });

  test("with its arrows, keeps a locked arrow, its end freed", () => {
    const diagram = newDiagram("d1", "Checkout", 0);
    diagram.shapes.push(newShape("a", { x: -200, y: 0 }, 0), newShape("b", { x: 200, y: 0 }, 1));
    diagram.arrows.push({ ...newArrow("ab", { shapeId: "a", port: null }, { shapeId: "b", port: null }, 2), locked: true });
    removeShape(diagram, "b", { withArrows: true });
    assert.deepEqual(diagram.arrows[0].to, { x: 140, y: 0 });
  });
});

describe("detaching the ends of an arrow", () => {
  test("makes the ends attached to a port automatic, and leaves the others as they are", () => {
    const arrow = newArrow("1", { shapeId: "a", port: "NE" }, { x: 10, y: 20 }, 0);
    detachEnds(arrow);
    assert.deepEqual(arrow.from, { shapeId: "a", port: null });
    assert.deepEqual(arrow.to, { x: 10, y: 20 });
  });
});

describe("groups", () => {
  const sample = () => {
    const diagram = newDiagram("d1", "Checkout", 0);
    diagram.shapes.push(newShape("a", { x: 0, y: 0 }, 0), newShape("b", { x: 200, y: 0 }, 1), newShape("c", { x: 400, y: 0 }, 2));
    diagram.arrows.push(newArrow("ab", { shapeId: "a", port: null }, { shapeId: "b", port: null }, 3));
    return diagram;
  };

  test("grouping gives the selected shapes one new group, and leaves the arrows out", () => {
    const diagram = sample();
    assert.equal(groupShapes(diagram, ["a", "b", "ab"]), true);
    const [a, b, c] = diagram.shapes;
    assert.ok(a.groupId);
    assert.equal(b.groupId, a.groupId);
    assert.equal(c.groupId, null);
  });

  test("grouping fewer than two shapes does nothing", () => {
    const diagram = sample();
    assert.equal(groupShapes(diagram, ["a", "ab"]), false);
    assert.equal(diagram.shapes[0].groupId, null);
  });

  test("a selection takes in every member of the groups it touches", () => {
    const diagram = sample();
    groupShapes(diagram, ["a", "b"]);
    assert.deepEqual(withGroups(diagram, ["b", "ab"]).sort(), ["a", "ab", "b"]);
    assert.deepEqual(withGroups(diagram, ["c"]), ["c"]);
  });

  test("ungrouping clears the groups the selection touches, with their other members", () => {
    const diagram = sample();
    groupShapes(diagram, ["a", "b"]);
    ungroupShapes(diagram, ["a"]);
    assert.deepEqual(diagram.shapes.map((shape) => shape.groupId), [null, null, null]);
  });
});

describe("the text style of a shape", () => {
  test("is read on every shape type, only when bold, italic and underline are true", () => {
    for (const type of ["rect", "text"]) {
      const shape = readDiagram({ shapes: [{ id: "s", x: 0, y: 0, type, bold: true, italic: "yes", underline: true }] }, "d1").shapes[0];
      assert.deepEqual([shape.bold, shape.italic, shape.underline], [true, undefined, true]);
    }
  });

  test("is off for a stored shape that has none", () => {
    const shape = readDiagram({ shapes: [{ id: "s", x: 0, y: 0 }] }, "d1").shapes[0];
    assert.deepEqual([shape.bold, shape.italic, shape.underline], [undefined, undefined, undefined]);
  });
});

describe("a table", () => {
  const read = (fields: object) => readDiagram({ shapes: [{ id: "t1", x: 0, y: 0, type: "table", ...fields }] }, "d1").shapes[0];

  test("is created with 3 × 3 empty cells and equal columns", () => {
    const table = newShape("t1", { x: 0, y: 0 }, 0, "table");
    assert.deepEqual([table.w, table.h, table.color], [240, 90, "c-gray"]);
    assert.deepEqual(table.cells, [["", "", ""], ["", "", ""], ["", "", ""]]);
    assert.deepEqual(table.columns, [1 / 3, 1 / 3, 1 / 3]);
    assert.deepEqual(table.rows, [1 / 3, 1 / 3, 1 / 3]);
  });

  test("is read back with its cells and column widths", () => {
    const table = newShape("t1", { x: 5, y: 5 }, 0, "table");
    table.cells = [["a", "b"], ["c", "d"]];
    table.columns = [0.25, 0.75];
    table.rows = [0.4, 0.6];
    table.cellStyles = [[{}, {}], [{}, {}]];
    assert.deepEqual(readDiagram(JSON.parse(JSON.stringify({ shapes: [table] })), "d1").shapes[0], table);
  });

  test("with ragged rows and cells that are not text is repaired", () => {
    const table = read({ cells: [["a", 4, null], ["b"], "oops"], columns: [1, 1, 2] });
    assert.deepEqual(table.cells, [["a", "", ""], ["b", "", ""]]);
    assert.deepEqual(table.columns, [0.25, 0.25, 0.5]);
  });

  test("with missing or empty cells is one empty cell, at least", () => {
    for (const cells of [undefined, [], [[]], "x"]) {
      const table = read({ cells });
      assert.deepEqual(table.cells, [[""]]);
      assert.deepEqual(table.columns, [1]);
    }
  });

  test("with column widths that do not fit its columns, or that are not positive, has equal columns", () => {
    for (const columns of [undefined, [1], [1, 1, 1], [1, 0], [1, -2], [1, "x"], "wide"]) {
      assert.deepEqual(read({ cells: [["a", "b"]], columns }).columns, [0.5, 0.5]);
    }
  });

  test("with row heights that do not fit its rows, or that are not positive, has equal rows; the others are scaled to sum to 1", () => {
    for (const rows of [undefined, [1], [1, 1, 1], [1, 0], [1, -2], [1, "x"], "high"]) {
      assert.deepEqual(read({ cells: [["a"], ["b"]], rows }).rows, [0.5, 0.5]);
    }
    assert.deepEqual(read({ cells: [["a"], ["b"], ["c"]], rows: [1, 1, 2] }).rows, [0.25, 0.25, 0.5]);
    assert.deepEqual(read({ cells: undefined }).rows, [1]);
  });

  test("is created with 3 × 3 cells that follow it, and no text style of its own", () => {
    const table = newShape("t1", { x: 0, y: 0 }, 0, "table");
    assert.deepEqual(table.cellStyles, Array.from({ length: 3 }, () => [{}, {}, {}]));
    assert.deepEqual([table.bold, table.italic, table.underline], [undefined, undefined, undefined]);
  });

  test("keeps the styles of its cells and its own text style through a save and a reload", () => {
    const table = newShape("t1", { x: 5, y: 5 }, 0, "table");
    table.cells = [["a", "b"], ["c", "d"]];
    table.columns = [0.5, 0.5];
    table.rows = [0.5, 0.5];
    table.bold = true;
    table.cellStyles = [[{ color: "c-blue", fontSize: 20, italic: true }, {}], [{}, { textAlign: "right", textValign: "bottom", underline: true, bold: false }]];
    assert.deepEqual(readDiagram(JSON.parse(JSON.stringify({ shapes: [table] })), "d1").shapes[0], table);
  });

  test("stored without cell styles has cells that all follow it", () => {
    const table = read({ cells: [["a", "b"], ["c", "d"]] });
    assert.deepEqual(table.cellStyles, [[{}, {}], [{}, {}]]);
  });

  test("with cell styles that do not fit its cells has them padded, truncated and repaired", () => {
    const table = read({
      cells: [["a", "b"], ["c", "d"]],
      cellStyles: [[{ color: 4, fontSize: 500, bold: "yes", italic: true, textAlign: "diagonal", textValign: "top", font: "x" }], "oops", [{}, {}], [{}, {}]],
    });
    assert.deepEqual(table.cellStyles, [[{ fontSize: 72, italic: true, textValign: "top" }, {}], [{}, {}]]);
    assert.deepEqual(read({ cells: [["a"]], cellStyles: "x" }).cellStyles, [[{}]]);
  });

  test("reads its own bold, italic and underline only when they are true", () => {
    const table = read({ bold: true, italic: "yes", underline: 1 });
    assert.deepEqual([table.bold, table.italic, table.underline], [true, undefined, undefined]);
  });

  test("is the only shape that carries cells", () => {
    assert.equal("cells" in readDiagram({ shapes: [{ id: "s", x: 0, y: 0, cells: [["a"]], columns: [1] }] }, "d1").shapes[0], false);
  });
});
