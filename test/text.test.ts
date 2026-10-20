import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { wrap } from "../src/lib/text.ts";

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
