import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newShape } from "../src/lib/diagram.ts";
import type { Span } from "../src/lib/richtext.ts";
import { layoutCell, layoutText, wrap } from "../src/lib/text.ts";

/** The lines of a layout as plain strings. */
const plain = (lines: Span[][]) => lines.map((line) => line.map((span) => span.text).join(""));
/** The lines as `text` with `*` around bold spans, `_` around italic ones. */
const marked = (lines: Span[][]) => lines.map((line) => line.map((s) => (s.bold ? `*${s.text}*` : s.italic ? `_${s.text}_` : s.text)).join(""));

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
    assert.deepEqual(plain(layoutText(rect, boldMeasure).lines), ["abc def"]);
    assert.deepEqual(plain(layoutText({ ...rect, bold: true }, boldMeasure).lines), ["abc", "def"]);
  });

  test("wraps where the real widths of its spans say", () => {
    // "abc" is bold (60) and "def" regular (30): "abc def" is 60 + 10 + 30 = 100, over 84; "de fg" fits.
    const mixed = { ...rect, text: "abc def", textRuns: [{ start: 0, end: 3, bold: true }] };
    assert.deepEqual(marked(layoutText(mixed, boldMeasure).lines), ["*abc*", "def"]);
    assert.deepEqual(marked(layoutText({ ...mixed, text: "ab def", textRuns: [{ start: 0, end: 2, bold: true }] }, boldMeasure).lines), ["*ab* def"]);
  });

  test("keeps a word made of two styles whole", () => {
    const word = { ...rect, text: "Hello big", textRuns: [{ start: 0, end: 3, bold: true }] };
    assert.deepEqual(marked(layoutText({ ...word, w: 50 }, boldMeasure).lines), ["*Hel*lo", "big"]);
  });

  test("keeps its spans through line breaks and outside placements", () => {
    const two = { ...rect, text: "ab\ncd", textRuns: [{ start: 1, end: 4, italic: true }] };
    assert.deepEqual(marked(layoutText(two, measure).lines), ["a_b_", "_c_d"]);
    assert.deepEqual(marked(layoutText({ ...two, type: "actor" }, measure).lines), ["a_b_", "_c_d"]);
    assert.deepEqual(marked(layoutText({ ...two, type: "custom", labelPlacement: "left" }, measure).lines), ["a_b_", "_c_d"]);
  });

  test("has an empty line for an empty paragraph, and a single-style span for a shape without runs", () => {
    const layout = layoutText({ ...rect, text: "a\n\nb", bold: true }, measure);
    assert.deepEqual(layout.lines, [[{ text: "a", bold: true, italic: false, underline: false }], [], [{ text: "b", bold: true, italic: false, underline: false }]]);
  });
});

describe("the text of a table cell", () => {
  // 240 × 90 on three equal rows of 30, and columns of 60, 60 and 120; each character is as wide as the font size.
  const table = { ...newShape("t", { x: 0, y: 0 }, 0, "table"), columns: [0.25, 0.25, 0.5], fontSize: 10 };
  table.cells = [["", "edge cache", ""], ["", "", ""], ["", "", "ok"]];

  test("wraps within the width of its column and is placed from the center of the cell, in the frame of the table", () => {
    // The cell is 60 wide with 8 on each side: 44 holds 4 characters of 10; "edge" and "cache" are two lines.
    const layout = layoutCell(table, 0, 1, measure);
    assert.deepEqual(plain(layout.lines), ["edge", "cache"]);
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
    assert.deepEqual(plain(big.lines), ["ab", "c"]);
    assert.equal(big.lineHeight, 20 * 1.3);
    const regular = layoutCell(styled, 0, 2, measure);
    assert.deepEqual(plain(regular.lines), ["ab c"]);
    assert.equal(regular.lineHeight, 10 * 1.3);
  });

  test("is measured in bold when its own font is bold", () => {
    // Bold characters are twice as wide: 44 holds 2 bold characters of 10.
    const boldMeasure = (text: string, fontSize: number, font?: { bold?: boolean }) => text.length * fontSize * (font?.bold ? 2 : 1);
    const styled = { ...table, cells: [["", "abcd", "abcd"], ["", "", ""], ["", "", ""]], cellStyles: [[{}, { bold: true }, {}], [], []] };
    assert.deepEqual(plain(layoutCell(styled, 0, 1, boldMeasure).lines), ["abcd"]);
    const words = { ...styled, cells: [["", "ab c", "ab c"], ["", "", ""], ["", "", ""]] };
    assert.deepEqual(plain(layoutCell(words, 0, 1, boldMeasure).lines), ["ab", "c"]);
    assert.deepEqual(plain(layoutCell(words, 0, 2, boldMeasure).lines), ["ab c"]);
  });

  test("is placed by its own alignments, as the text of a rectangle of the cell", () => {
    const styled = { ...table, cellStyles: [[], [], [{}, {}, { textAlign: "right" as const, textValign: "bottom" as const }]] };
    const layout = layoutCell(styled, 2, 2, measure);
    assert.deepEqual([layout.anchor, layout.x, layout.y], ["end", 112, 30 + 15 - 8 - 5]);
  });
});
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

describe("the text of a code block", () => {
  const code = (text: string, more: object = {}) => ({ ...newShape("c", { x: 0, y: 0 }, 0), w: 100, h: 60, fontSize: 10, text, code: { language: "bash" }, ...more });

  test("does not wrap: each line of the text is one line, however wide", () => {
    const layout = layoutText(code("a very long line that would wrap\nok"), measure);
    assert.deepEqual(plain(layout.lines), ["a very long line that would wrap", "ok"]);
  });

  test("keeps the indentation and the multiple spaces, and has no spans in an empty line", () => {
    const layout = layoutText(code("if x:\n    y  =  1\n\nend"), measure);
    assert.deepEqual(plain(layout.lines), ["if x:", "    y  =  1", "", "end"]);
    assert.deepEqual(layout.lines[2], []);
    assert.equal(layout.lines[1].map((span) => span.text).join(""), "    y  =  1");
  });

  test("sits at the top-left, whatever the alignments", () => {
    for (const [textAlign, textValign] of [["center", "middle"], ["right", "bottom"]] as const) {
      const layout = layoutText(code("x", { textAlign, textValign }), measure);
      assert.deepEqual([layout.anchor, layout.x, layout.y], ["start", -50 + 8, -30 + 8 + 5]);
    }
  });

  test("ignores the bold, italic and underline of the shape and of its runs, without changing the shape", () => {
    const shape = code("abcdef", { bold: true, italic: true, underline: true, textRuns: [{ start: 0, end: 3, bold: false }] });
    const before = structuredClone(shape);
    const layout = layoutText(shape, measure);
    assert.equal(layout.lines[0].map((span) => span.text).join(""), "abcdef");
    assert.ok(layout.lines[0].every((span) => !span.bold && !span.italic && !span.underline));
    assert.deepEqual(shape, before);
  });

  test("cuts the lines of a known language into spans with the kind of token, joining back to the line", () => {
    const layout = layoutText(code('{"a": 1}\n\n', { code: { language: "json" } }), measure);
    assert.equal(layout.lines[0].map((span) => span.text).join(""), '{"a": 1}');
    assert.deepEqual(layout.lines[1], []);
    assert.ok(layout.lines[0].some((span) => span.token === "key"));
    assert.ok(layout.lines[0].some((span) => span.token === "number"));
    assert.ok(layout.lines[0].every((span) => !span.bold && !span.italic && !span.underline));
    assert.deepEqual([layout.x, layout.y, layout.anchor], [-42, -17, "start"]);
  });

  test("keeps plain spans, without token, for an unknown or empty language", () => {
    for (const language of ["brainfuck", ""]) {
      const layout = layoutText(code("echo  hi", { code: { language } }), measure);
      assert.deepEqual(layout.lines, [[{ text: "echo  hi", bold: false, italic: false, underline: false }]]);
    }
  });

  test("sits inside the box for an actor or a custom shape with an outside label", () => {
    for (const shape of [code("x", { type: "actor" }), code("x", { type: "custom", labelPlacement: "below" })]) {
      const layout = layoutText(shape, measure);
      assert.deepEqual([layout.anchor, layout.x, layout.y], ["start", -42, -17]);
    }
  });

  test("leaves a shape without code as it was", () => {
    const layout = layoutText(code("a b", { code: undefined }), measure);
    assert.deepEqual([layout.anchor, layout.x, layout.y], ["middle", 0, -0]);
  });

  test("never leaks into the cell of a table", () => {
    const table = { ...newShape("t", { x: 0, y: 0 }, 0, "table"), code: { language: "bash" } };
    const layout = layoutCell(table, 0, 0, measure);
    assert.equal(layout.anchor === "start" && layout.x === -table.w / 2 + 8 && layout.y === -table.h / 2 + 8 + table.fontSize / 2, false);
  });
});
