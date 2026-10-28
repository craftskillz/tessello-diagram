import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Shape, newShape } from "../src/lib/diagram.ts";
import { clipRange, MAX_CELLS, MIN_COLUMN, MIN_ROW, cellAt, cellBox, cellStyleOf, columnEdges, columnRange, dragSeparator, inRange, rangeBetween, resizeCorner, resizeSide, rowRange, setColumnCount, setRowCount, sharedCellStyle, styleCells, styleTable, tableAnchors, tableOf, wholeRange } from "../src/lib/table.ts";

/** A table of 240 × 90 centered on (100, 50): three columns of 60, 60 and 120, and three rows of 30. */
function table(fields: Partial<Shape> = {}): Shape {
  return { ...newShape("t", { x: 100, y: 50 }, 0, "table"), columns: [0.25, 0.25, 0.5], ...fields };
}

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

describe("where the cells of a table are", () => {
  test("the edges of the columns run from the left side of the table to its right side, in its frame", () => {
    assert.deepEqual(columnEdges(table()), [-120, -60, 0, 120]);
  });

  test("a cell is a box around its center, in the frame of the table", () => {
    assert.deepEqual(cellBox(table(), 0, 0), { x: -90, y: -30, w: 60, h: 30 });
    assert.deepEqual(cellBox(table(), 2, 2), { x: 60, y: 30, w: 120, h: 30 });
  });

  test("a point of the drawing is in one cell, or in none outside the table", () => {
    assert.deepEqual(cellAt(table(), { x: 100 - 90, y: 50 - 30 }), { row: 0, col: 0 });
    assert.deepEqual(cellAt(table(), { x: 100 + 10, y: 50 + 20 }), { row: 2, col: 2 });
    assert.equal(cellAt(table(), { x: 100 + 121, y: 50 }), undefined);
    assert.equal(cellAt(table(), { x: 100, y: 50 - 46 }), undefined);
  });

  test("a point is found in the cell it is in once the table is turned", () => {
    // Turned by 90° clockwise, the local x axis points down the screen: the last column is lowest.
    assert.deepEqual(cellAt(table({ rotation: 90 }), { x: 100, y: 50 + 100 }), { row: 1, col: 2 });
    assert.deepEqual(cellAt(table({ rotation: 90 }), { x: 100 - 30, y: 50 - 100 }), { row: 2, col: 0 });
  });
});

describe("changing the number of columns and rows", () => {
  test("a column added is as wide as the average one, and the table widens with its left side fixed", () => {
    const start = table({ cells: [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]] });
    const next = setColumnCount(start, 4);
    assert.deepEqual([next.x, next.y, next.w, next.h], [140, 50, 320, 90]);
    assert.deepEqual(next.columns, [0.1875, 0.1875, 0.375, 0.25]);
    assert.deepEqual(next.cells, [["a", "b", "c", ""], ["d", "e", "f", ""], ["g", "h", "i", ""]]);
  });

  test("the columns removed are the last ones, and the table narrows with its left side fixed", () => {
    const next = setColumnCount(table({ cells: [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]] }), 2);
    assert.deepEqual([next.x, next.w], [40, 120]);
    assert.deepEqual(next.columns, [0.5, 0.5]);
    assert.deepEqual(next.cells, [["a", "b"], ["d", "e"], ["g", "h"]]);
  });

  test("the left side stays where it is on the screen when the table is turned", () => {
    // Turned by 90°, the widening goes down the screen: the center moves by half of it.
    const next = setColumnCount(table({ rotation: 90 }), 4);
    near(next.x, 100);
    near(next.y, 50 + 40);
  });

  test("a row added is as high as the current ones, and the table grows downward with its top fixed", () => {
    const next = setRowCount(table(), 4);
    assert.deepEqual([next.x, next.y, next.w, next.h], [100, 65, 240, 120]);
    assert.equal(next.cells.length, 4);
    assert.deepEqual(next.cells[3], ["", "", ""]);
    assert.deepEqual(next.columns, [0.25, 0.25, 0.5]);
  });

  test("the rows removed are the last ones, and the table shrinks", () => {
    const next = setRowCount(table({ cells: [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]] }), 1);
    assert.deepEqual([next.y, next.h], [20, 30]);
    assert.deepEqual(next.cells, [["a", "b", "c"]]);
  });

  test("a table keeps one row and one column at least, and a limit above", () => {
    assert.equal(setColumnCount(table(), 0).columns.length, 1);
    assert.equal(setRowCount(table(), -3).cells.length, 1);
    assert.equal(setColumnCount(table(), 500).columns.length, MAX_CELLS);
    assert.equal(setRowCount(table(), 500).cells.length, MAX_CELLS);
  });
});

describe("dragging the separator between two columns", () => {
  test("changes the width of the column on its left only, and the table follows with its left side fixed", () => {
    const next = dragSeparator(table(), 0, 30);
    assert.deepEqual([next.x, next.y, next.w, next.h], [115, 50, 270, 90]);
    assert.deepEqual(next.columns.map((part) => part * next.w), [90, 60, 120]);
  });

  test("narrows the column and the table when dragged back", () => {
    const next = dragSeparator(table(), 1, -20);
    assert.deepEqual([next.x, next.w], [90, 220]);
    near(next.columns[1] * next.w, 40);
    near(next.columns[2] * next.w, 120);
  });

  test("never leaves a column narrower than the minimum", () => {
    const next = dragSeparator(table(), 0, -100);
    near(next.columns[0] * next.w, MIN_COLUMN);
    near(next.w, 240 - (60 - MIN_COLUMN));
    near(next.x, 100 - (60 - MIN_COLUMN) / 2);
  });

  test("moves the center along the local x axis of a turned table", () => {
    const next = dragSeparator(table({ rotation: 90 }), 0, 30);
    near(next.x, 100);
    near(next.y, 50 + 15);
  });

  test("the last column's right side is a separator too", () => {
    const next = dragSeparator(table(), 2, 60);
    assert.deepEqual([next.x, next.w], [130, 300]);
  });
});

describe("resizing a table by a side handle", () => {
  test("changes the width with the opposite side fixed, keeping the font size and the relative widths", () => {
    const east = resizeSide(table(), "e", { x: 40, y: 0 });
    assert.deepEqual([east.x, east.y, east.w, east.h], [120, 50, 280, 90]);
    assert.deepEqual(east.columns, [0.25, 0.25, 0.5]);
    assert.equal("fontSize" in east, false);
    const west = resizeSide(table(), "w", { x: -40, y: 0 });
    assert.deepEqual([west.x, west.w], [80, 280]);
  });

  test("changes the height with the opposite side fixed", () => {
    const south = resizeSide(table(), "s", { x: 0, y: 30 });
    assert.deepEqual([south.x, south.y, south.w, south.h], [100, 65, 240, 120]);
    const north = resizeSide(table(), "n", { x: 0, y: -30 });
    assert.deepEqual([north.y, north.h], [35, 120]);
  });

  test("keeps the center in the fixed center mode, growing on both sides", () => {
    const next = resizeSide(table(), "e", { x: 40, y: 0 }, { fromCenter: true });
    assert.deepEqual([next.x, next.w], [100, 320]);
  });

  test("ignores the part of the drag across the side", () => {
    const next = resizeSide(table(), "e", { x: 40, y: 500 });
    assert.deepEqual([next.y, next.h], [50, 90]);
  });

  test("follows the drag in the frame of a turned table", () => {
    const next = resizeSide(table({ rotation: 90 }), "e", { x: 0, y: 40 });
    near(next.w, 280);
    near(next.x, 100);
    near(next.y, 50 + 20);
  });

  test("stops where the narrowest column reaches its minimum width, or a row gets too low", () => {
    const narrow = resizeSide(table(), "e", { x: -500, y: 0 });
    near(narrow.w, MIN_COLUMN / 0.25);
    const low = resizeSide(table(), "s", { x: 0, y: -500 });
    near(low.h, 3 * MIN_ROW);
  });
});

describe("resizing a table by a corner handle", () => {
  test("keeps the ratio, scales the font size by the same factor, and keeps the opposite corner", () => {
    const next = resizeCorner({ ...table(), fontSize: 14 }, "se", { x: 60, y: 0 });
    assert.deepEqual([next.x, next.y, next.w, next.h, next.fontSize], [130, 61.25, 300, 112.5, 18]);
    assert.deepEqual(next.columns, [0.25, 0.25, 0.5]);
    const back = resizeCorner({ ...table(), fontSize: 14 }, "nw", { x: -60, y: 0 });
    assert.deepEqual([back.x, back.y, back.w, back.h], [70, 38.75, 300, 112.5]);
  });

  test("keeps the center in the fixed center mode", () => {
    const next = resizeCorner({ ...table(), fontSize: 14 }, "se", { x: 60, y: 0 }, { fromCenter: true });
    assert.deepEqual([next.x, next.y, next.w, next.h, next.fontSize], [100, 50, 360, 135, 21]);
  });

  test("scales the font size from the one at the start, within the limits of font sizes", () => {
    assert.equal(resizeCorner({ ...table(), fontSize: 70 }, "se", { x: 240, y: 90 }).fontSize, 72);
    const small = resizeCorner({ ...table(), fontSize: 14 }, "se", { x: -1000, y: -1000 });
    assert.equal(small.fontSize, 6);
    near(small.w, 96);
    near(small.h, 36);
  });
});

describe("the anchors of a table", () => {
  const cells = (rows: number, cols: number) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  const grid = (rows: number, cols: number, fields: Partial<Shape> = {}) => table({ cells: cells(rows, cols), columns: Array.from({ length: cols }, () => 1 / cols), ...fields });
  const idsOf = (shape: Shape, cell: string) => tableAnchors(shape).filter((anchor) => anchor.id.startsWith(`${cell}-`)).map((anchor) => anchor.id.slice(cell.length + 1));

  test("a corner cell has five points, an edge cell three, an inner cell none", () => {
    const nine = grid(3, 3);
    assert.deepEqual(idsOf(nine, "r0c0"), ["N", "NE", "SW", "W", "NW"].sort((a, b) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(a) - ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(b)));
    assert.deepEqual(idsOf(nine, "r0c1"), ["N", "NE", "NW"]);
    assert.deepEqual(idsOf(nine, "r1c2"), ["NE", "E", "SE"]);
    assert.deepEqual(idsOf(nine, "r1c1"), []);
    assert.equal(tableAnchors(nine).length, 4 * 5 + 4 * 3);
  });

  test("a table of a single cell has all eight, a single row has more on its middle cells", () => {
    assert.deepEqual(idsOf(grid(1, 1), "r0c0"), ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    assert.deepEqual(idsOf(grid(1, 3), "r0c1"), ["N", "NE", "S", "SW", "SE", "NW"].sort((a, b) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(a) - ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(b)));
  });

  test("two neighbouring cells have their own name for a point at the same place", () => {
    const anchors = tableAnchors(grid(3, 3));
    const a = anchors.find((anchor) => anchor.id === "r0c0-NE")!;
    const b = anchors.find((anchor) => anchor.id === "r0c1-NW")!;
    assert.deepEqual([a.x, a.y], [b.x, b.y]);
    assert.equal(new Set(anchors.map((anchor) => anchor.id)).size, anchors.length);
  });

  test("are parts of the width and height, from the columns as they are now", () => {
    // Columns of 0.25, 0.25 and 0.5 of the width; three rows.
    const anchors = tableAnchors(table());
    const at = (id: string) => anchors.find((anchor) => anchor.id === id)!;
    near(at("r0c0-NW").x, 0);
    near(at("r0c0-N").x, 0.125);
    near(at("r0c2-N").x, 0.75);
    near(at("r0c2-NE").x, 1);
    near(at("r1c0-W").y, 0.5);
    near(at("r2c1-S").x, 0.375);
    near(at("r2c1-S").y, 1);
    // Resizing a column moves the points with it.
    const wider = tableAnchors(table({ columns: [0.5, 0.25, 0.25] }));
    near(wider.find((anchor) => anchor.id === "r0c0-NE")!.x, 0.5);
  });

  test("face outward from the side they are on, and diagonally at a corner of the table", () => {
    const anchors = tableAnchors(table());
    const facing = (id: string) => anchors.find((anchor) => anchor.id === id)!.facing;
    assert.deepEqual(facing("r0c1-N"), { x: 0, y: -1 });
    assert.deepEqual(facing("r0c1-NE"), { x: 0, y: -1 });
    assert.deepEqual(facing("r1c0-W"), { x: -1, y: 0 });
    assert.deepEqual(facing("r2c2-S"), { x: 0, y: 1 });
    assert.deepEqual(facing("r1c2-E"), { x: 1, y: 0 });
    assert.deepEqual(facing("r0c0-NW"), { x: -1, y: -1 });
    assert.deepEqual(facing("r2c2-SE"), { x: 1, y: 1 });
    // A corner of a cell on the top side only is not a corner of the table.
    assert.deepEqual(facing("r0c0-NE"), { x: 0, y: -1 });
  });
});

/** A table of 2 rows × 3 columns whose cell (0, 1) has its own style. */
function styled(fields: Partial<Shape> = {}): Shape {
  const cellStyles = [[{}, { color: "c-blue", bold: true, fontSize: 20 }, {}], [{}, {}, {}]];
  return table({ cells: [["a", "b", "c"], ["d", "e", "f"]], h: 60, cellStyles, color: "c-gray", fontSize: 14, ...fields });
}

describe("the style of the cells of a table", () => {
  test("a table has a style for each of its cells, a shape without any has cells that follow it", () => {
    assert.deepEqual(tableOf(styled()).cellStyles[0][1], { color: "c-blue", bold: true, fontSize: 20 });
    const bare = { ...styled(), cellStyles: undefined };
    assert.deepEqual(tableOf(bare).cellStyles, [[{}, {}, {}], [{}, {}, {}]]);
    assert.deepEqual(tableOf({ ...styled(), cellStyles: [[{ bold: true }]] }).cellStyles, [[{ bold: true }, {}, {}], [{}, {}, {}]]);
  });

  test("the style of a cell is its own keys over those of the table", () => {
    const shape = styled({ italic: true, textAlign: "right" });
    assert.deepEqual(cellStyleOf(shape, 0, 1), {
      color: "c-blue", fontSize: 20, bold: true, italic: true, underline: false, textAlign: "right", textValign: shape.textValign,
    });
    assert.deepEqual(cellStyleOf(shape, 1, 1), {
      color: "c-gray", fontSize: 14, bold: false, italic: true, underline: false, textAlign: "right", textValign: shape.textValign,
    });
    assert.deepEqual(wholeRange(shape), { top: 0, left: 0, bottom: 1, right: 2 });
  });

  test("ranges are rectangles of cells, from any two cells, a row or a column", () => {
    assert.deepEqual(rangeBetween({ row: 2, col: 0 }, { row: 1, col: 3 }), { top: 1, left: 0, bottom: 2, right: 3 });
    assert.deepEqual(rowRange(styled(), 1), { top: 1, left: 0, bottom: 1, right: 2 });
    assert.deepEqual(columnRange(styled(), 2), { top: 0, left: 2, bottom: 1, right: 2 });
    const range = rangeBetween({ row: 0, col: 1 }, { row: 1, col: 2 });
    assert.deepEqual([inRange(range, 0, 0), inRange(range, 0, 1), inRange(range, 1, 2), inRange(range, 2, 2)], [false, true, true, false]);
  });

  test("styling a range writes the change into each of its cells, over their own, and nothing else", () => {
    const shape = styled();
    const next = styleCells(shape, rangeBetween({ row: 0, col: 0 }, { row: 0, col: 1 }), { bold: false, textAlign: "center", fontSize: 500 });
    assert.deepEqual(next[0][0], { bold: false, textAlign: "center", fontSize: 72 });
    assert.deepEqual(next[0][1], { color: "c-blue", bold: false, fontSize: 72, textAlign: "center" });
    assert.deepEqual(next[0][2], {});
    assert.deepEqual(next[1], [{}, {}, {}]);
    assert.deepEqual(shape.cellStyles![0][1], { color: "c-blue", bold: true, fontSize: 20 });
    assert.notEqual(next, shape.cellStyles);
    assert.notEqual(next[1], shape.cellStyles![1]);
  });

  test("styling a range beyond the table only reaches its cells", () => {
    const next = styleCells(styled(), { top: 1, left: 2, bottom: 9, right: 9 }, { italic: true });
    assert.deepEqual(next, [[{}, { color: "c-blue", bold: true, fontSize: 20 }, {}], [{}, {}, { italic: true }]]);
  });

  test("styling the whole table sets its own style and erases that of all its cells", () => {
    const change = styleTable(styled(), { color: "c-red", underline: true, fontSize: 0 });
    assert.deepEqual(change, { color: "c-red", underline: true, fontSize: 6, cellStyles: [[{}, {}, {}], [{}, {}, {}]] });
  });

  test("a range shares a value when its cells have the same one, own or followed", () => {
    const shape = styled();
    assert.equal(sharedCellStyle(shape, rowRange(shape, 1), "color"), "c-gray");
    assert.equal(sharedCellStyle(shape, rowRange(shape, 0), "color"), undefined);
    assert.equal(sharedCellStyle(shape, columnRange(shape, 1), "bold"), undefined);
    assert.equal(sharedCellStyle(shape, rangeBetween({ row: 0, col: 0 }, { row: 0, col: 0 }), "bold"), false);
    assert.equal(sharedCellStyle(shape, rangeBetween({ row: 0, col: 1 }, { row: 0, col: 1 }), "fontSize"), 20);
  });

  test("an added row copies the style of the last row, apart from it, and a removed row takes its style away", () => {
    const shape = styled({ cellStyles: [[{}, {}, {}], [{ bold: true }, {}, { color: "c-red" }]] });
    const added = setRowCount(shape, 4);
    assert.deepEqual(added.cellStyles, [[{}, {}, {}], [{ bold: true }, {}, { color: "c-red" }], [{ bold: true }, {}, { color: "c-red" }], [{ bold: true }, {}, { color: "c-red" }]]);
    assert.notEqual(added.cellStyles[2][0], added.cellStyles[1][0]);
    assert.notEqual(added.cellStyles[3][0], added.cellStyles[2][0]);
    assert.deepEqual(setRowCount(styled(), 1).cellStyles, [[{}, { color: "c-blue", bold: true, fontSize: 20 }, {}]]);
  });

  test("an added column copies the style of the last column in each row, and a removed column takes its style away", () => {
    const shape = styled({ cellStyles: [[{}, {}, { color: "c-red" }], [{}, {}, { italic: true }]] });
    const added = setColumnCount(shape, 5);
    assert.deepEqual(added.cellStyles, [[{}, {}, { color: "c-red" }, { color: "c-red" }, { color: "c-red" }], [{}, {}, { italic: true }, { italic: true }, { italic: true }]]);
    assert.notEqual(added.cellStyles[0][3], added.cellStyles[0][2]);
    assert.deepEqual(setColumnCount(styled(), 2).cellStyles, [[{}, { color: "c-blue", bold: true, fontSize: 20 }], [{}, {}]]);
  });

  test("dragging a separator keeps the styles, and resizing a corner scales their own font sizes only", () => {
    assert.deepEqual(dragSeparator(styled(), 0, 10).cellStyles, styled().cellStyles);
    const next = resizeCorner(styled(), "se", { x: 120, y: 30 });
    assert.deepEqual(next.cellStyles, [[{}, { color: "c-blue", bold: true, fontSize: 30 }, {}], [{}, {}, {}]]);
    assert.equal(next.fontSize, 21);
  });

  test("a range is clipped to the rows and columns left in the table, none when it is wholly outside", () => {
    assert.deepEqual(clipRange(styled(), { top: 0, left: 1, bottom: 1, right: 2 }), { top: 0, left: 1, bottom: 1, right: 2 });
    assert.deepEqual(clipRange(styled(), { top: 1, left: 1, bottom: 5, right: 9 }), { top: 1, left: 1, bottom: 1, right: 2 });
    assert.equal(clipRange(styled(), { top: 2, left: 0, bottom: 4, right: 0 }), undefined);
    assert.equal(clipRange(styled(), { top: 0, left: 3, bottom: 0, right: 3 }), undefined);
  });
});
