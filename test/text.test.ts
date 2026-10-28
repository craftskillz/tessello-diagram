import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newShape } from "../src/lib/diagram.ts";
import { layoutCell, layoutText, wrap } from "../src/lib/text.ts";

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

describe("the text of a styled shape", () => {
  // Bold characters are twice as wide: 84 holds 8 regular characters but 4 bold ones; "abc def" is 70 regular, 140 bold.
  const boldMeasure = (text: string, fontSize: number, font?: { bold?: boolean }) => text.length * fontSize * (font?.bold ? 2 : 1);
  const rect = { ...newShape("r", { x: 0, y: 0 }, 0), w: 100, h: 40, fontSize: 10, text: "abc def" };

  test("wraps in its own bold font", () => {
    assert.deepEqual(layoutText(rect, boldMeasure).lines, ["abc def"]);
    assert.deepEqual(layoutText({ ...rect, bold: true }, boldMeasure).lines, ["abc", "def"]);
  });

  test("wraps in the font it is given over its own", () => {
    assert.deepEqual(layoutText({ ...rect, bold: true }, boldMeasure, {}).lines, ["abc def"]);
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

  test("wraps and spaces its lines by its own font size", () => {
    // The cell holds 44: "ab c" is 40 at the size 10 of the table, 80 at size 20.
    const cells = [["", "ab c", "ab c"], ["", "", ""], ["", "", ""]];
    const styled = { ...table, cells, cellStyles: [[{}, { fontSize: 20 }, {}], [], []] };
    const big = layoutCell(styled, 0, 1, measure);
    assert.deepEqual(big.lines, ["ab", "c"]);
    assert.equal(big.lineHeight, 20 * 1.3);
    const plain = layoutCell(styled, 0, 2, measure);
    assert.deepEqual(plain.lines, ["ab c"]);
    assert.equal(plain.lineHeight, 10 * 1.3);
  });

  test("is measured in bold when its own font is bold", () => {
    // Bold characters are twice as wide: 44 holds 2 bold characters of 10.
    const boldMeasure = (text: string, fontSize: number, font?: { bold?: boolean }) => text.length * fontSize * (font?.bold ? 2 : 1);
    const styled = { ...table, cells: [["", "abcd", "abcd"], ["", "", ""], ["", "", ""]], cellStyles: [[{}, { bold: true }, {}], [], []] };
    assert.deepEqual(layoutCell(styled, 0, 1, boldMeasure).lines, ["abcd"]);
    const words = { ...styled, cells: [["", "ab c", "ab c"], ["", "", ""], ["", "", ""]] };
    assert.deepEqual(layoutCell(words, 0, 1, boldMeasure).lines, ["ab", "c"]);
    assert.deepEqual(layoutCell(words, 0, 2, boldMeasure).lines, ["ab c"]);
  });

  test("is placed by its own alignments, as the text of a rectangle of the cell", () => {
    const styled = { ...table, cellStyles: [[], [], [{}, {}, { textAlign: "right" as const, textValign: "bottom" as const }]] };
    const layout = layoutCell(styled, 2, 2, measure);
    assert.deepEqual([layout.anchor, layout.x, layout.y], ["end", 112, 30 + 15 - 8 - 5]);
  });
});
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
