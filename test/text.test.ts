import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newShape } from "../src/lib/diagram.ts";
import { layoutCell, wrap } from "../src/lib/text.ts";

// Each character is as wide as the font size.
const measure = (text: string, fontSize: number) => text.length * fontSize;

describe("the lines of a shape's text", () => {
  test("wrap between words within the width", () => {
    // At size 10, a line holds 8 characters.
    assert.deepEqual(wrap("edge cache in front", 80, 10, measure), ["edge", "cache in", "front"]);
  });

  test("keep the line breaks typed by the User", () => {
    assert.deepEqual(wrap("API\nv2", 80, 10, measure), ["API", "v2"]);
  });

  test("keep a word wider than the width whole", () => {
    assert.deepEqual(wrap("authentication", 80, 10, measure), ["authentication"]);
  });
});

describe("the text of a table cell", () => {
  // 240 × 90 on three equal rows of 30, and columns of 60, 60 and 120; each character is as wide as the font size.
  const table = { ...newShape("t", { x: 0, y: 0 }, 0, "table"), columns: [0.25, 0.25, 0.5], fontSize: 10 };
  table.cells = [["", "edge cache", ""], ["", "", ""], ["", "", "ok"]];

  test("wraps within the width of its column and is placed from the center of the cell, in the frame of the table", () => {
    // The cell is 60 wide with 8 on each side: 44 holds 4 characters of 10; "edge" and "cache" are two lines.
    const layout = layoutCell(table, 0, 1, measure);
    assert.deepEqual(layout.lines, ["edge", "cache"]);
    assert.equal(layout.anchor, "middle");
    assert.equal(layout.x, -30);
    near(layout.y, -30 - layout.lineHeight / 2);
  });

  test("follows the alignments of the shape", () => {
    const layout = layoutCell({ ...table, textAlign: "left", textValign: "top" }, 2, 2, measure);
    assert.deepEqual([layout.anchor, layout.x, layout.y], ["start", 0 + 8, 30 - 15 + 8 + 5]);
  });
});
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
