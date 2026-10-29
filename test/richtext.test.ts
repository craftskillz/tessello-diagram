import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deleteRange, fromSpans, insertText, rangeStyle, type Span, spansOf, styleRange, styleWhole, wholeStyle } from "../src/lib/richtext.ts";

const plain = { bold: false, italic: false, underline: false };
const span = (text: string, style: Partial<Omit<Span, "text">> = {}): Span => ({ text, ...plain, ...style });

describe("the spans of a shape's text", () => {
  test("an empty text has none", () => {
    assert.deepEqual(spansOf({ text: "" }), []);
  });

  test("a text without runs is one span in the style of the shape", () => {
    assert.deepEqual(spansOf({ text: "Hello" }), [span("Hello")]);
    assert.deepEqual(spansOf({ text: "Hello", bold: true }), [span("Hello", { bold: true })]);
  });

  test("a run overrides the shape on its range, and a key it lacks follows the shape", () => {
    const shape = { text: "Hello world", italic: true, textRuns: [{ start: 0, end: 5, bold: true }, { start: 6, end: 11, italic: false }] };
    assert.deepEqual(spansOf(shape), [
      span("Hello", { bold: true, italic: true }),
      span(" ", { italic: true }),
      span("world"),
    ]);
  });

  test("adjacent spans in the same style are merged", () => {
    const shape = { text: "abcd", textRuns: [{ start: 0, end: 2, bold: true }, { start: 2, end: 4, bold: true }] };
    assert.deepEqual(spansOf(shape), [span("abcd", { bold: true })]);
  });
});

describe("the runs of spans", () => {
  test("a text in the style of the shape has no runs", () => {
    assert.deepEqual(fromSpans([span("ab"), span("cd")], {}), { text: "abcd" });
    assert.deepEqual(fromSpans([span("ab", { bold: true })], { bold: true }), { text: "ab" });
  });

  test("only what differs from the shape is kept, adjacent equal runs merged", () => {
    const spans = [span("ab"), span("cd", { bold: true }), span("ef", { bold: true, italic: true }), span("gh", { bold: true, italic: true })];
    assert.deepEqual(fromSpans(spans, {}), {
      text: "abcdefgh",
      textRuns: [{ start: 2, end: 4, bold: true }, { start: 4, end: 8, bold: true, italic: true }],
    });
  });

  test("a style switched off against a shape that has it is a run", () => {
    assert.deepEqual(fromSpans([span("ab", { bold: true }), span("cd")], { bold: true }), { text: "abcd", textRuns: [{ start: 2, end: 4, bold: false }] });
  });

  test("the round trip from a shape is canonical", () => {
    const shape = { text: "abcdef", underline: true, textRuns: [{ start: 3, end: 6, bold: true, underline: true }, { start: 0, end: 3, italic: true }] };
    assert.deepEqual(fromSpans(spansOf(shape), shape), {
      text: "abcdef",
      textRuns: [{ start: 0, end: 3, italic: true }, { start: 3, end: 6, bold: true }],
    });
  });
});

describe("styling a range", () => {
  test("splits the spans at its ends and merges the neighbors in the same style", () => {
    assert.deepEqual(styleRange([span("abcdef")], 2, 4, "bold", true), [span("ab"), span("cd", { bold: true }), span("ef")]);
    assert.deepEqual(styleRange([span("ab"), span("cd", { bold: true }), span("ef")], 0, 2, "bold", true), [span("abcd", { bold: true }), span("ef")]);
  });

  test("changes one key only, and clears it too", () => {
    assert.deepEqual(styleRange([span("abc", { bold: true, italic: true })], 1, 3, "bold", false), [span("a", { bold: true, italic: true }), span("bc", { italic: true })]);
  });

  test("a range outside the text is clamped, and an empty one changes nothing", () => {
    assert.deepEqual(styleRange([span("abc")], 1, 99, "italic", true), [span("a"), span("bc", { italic: true })]);
    assert.deepEqual(styleRange([span("abc")], 2, 2, "italic", true), [span("abc")]);
  });
});

describe("the style of a range", () => {
  const spans = [span("ab", { bold: true }), span("cd")];
  test("is on when every character has it", () => {
    assert.equal(rangeStyle(spans, 0, 2, "bold"), true);
    assert.equal(rangeStyle(spans, 1, 3, "bold"), false);
    assert.equal(rangeStyle(spans, 2, 4, "bold"), false);
  });

  test("a caret takes the style of the character before it, or after it at the start", () => {
    assert.equal(rangeStyle(spans, 2, 2, "bold"), true);
    assert.equal(rangeStyle(spans, 3, 3, "bold"), false);
    assert.equal(rangeStyle(spans, 0, 0, "bold"), true);
    assert.equal(rangeStyle([], 0, 0, "bold"), false);
  });
});

describe("inserting and deleting text", () => {
  test("inserted text takes the given style, inside a span or between two", () => {
    assert.deepEqual(insertText([span("abcd")], 2, "XY", { ...plain, bold: true }), [span("ab"), span("XY", { bold: true }), span("cd")]);
    assert.deepEqual(insertText([span("ab", { bold: true })], 2, "c", { ...plain, bold: true }), [span("abc", { bold: true })]);
    assert.deepEqual(insertText([], 0, "a", plain), [span("a")]);
  });

  test("deleting a range joins what is left", () => {
    assert.deepEqual(deleteRange([span("ab"), span("cd", { bold: true }), span("ef")], 2, 4), [span("abef")]);
    assert.deepEqual(deleteRange([span("ab")], 0, 2), []);
  });
});

describe("the style of the whole text", () => {
  test("is on, off, or mixed", () => {
    assert.equal(wholeStyle({ text: "ab", bold: true }, "bold"), true);
    assert.equal(wholeStyle({ text: "ab" }, "bold"), false);
    assert.equal(wholeStyle({ text: "abcd", textRuns: [{ start: 0, end: 2, bold: true }] }, "bold"), undefined);
    assert.equal(wholeStyle({ text: "ab", textRuns: [{ start: 0, end: 2, bold: true }] }, "bold"), true);
  });

  test("an empty text has the style of the shape", () => {
    assert.equal(wholeStyle({ text: "", bold: true }, "bold"), true);
    assert.equal(wholeStyle({ text: "" }, "bold"), false);
  });

  test("setting it styles the shape and erases the overrides of that key only", () => {
    const shape = { text: "abcd", bold: false, textRuns: [{ start: 0, end: 2, bold: true, italic: true }, { start: 2, end: 3, bold: true }] };
    styleWhole(shape, "bold", true);
    assert.equal(shape.bold, true);
    assert.deepEqual(shape.textRuns, [{ start: 0, end: 2, italic: true }]);
    assert.equal(wholeStyle(shape, "bold"), true);
  });

  test("clearing it leaves no runs when none remain", () => {
    const shape: { text: string; bold?: boolean; textRuns?: { start: number; end: number; bold?: boolean }[] } = { text: "abcd", bold: true, textRuns: [{ start: 1, end: 2, bold: false }] };
    styleWhole(shape, "bold", false);
    assert.equal(shape.bold, false);
    assert.equal("textRuns" in shape, false);
    assert.equal(wholeStyle(shape, "bold"), false);
  });
});
