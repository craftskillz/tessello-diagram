import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canBeCode, fromFence, LANGUAGES } from "../src/lib/code.ts";

describe("canBeCode", () => {
  it("is false for a table and an image, true for the other types", () => {
    assert.equal(canBeCode({ type: "table" }), false);
    assert.equal(canBeCode({ type: "image" }), false);
    for (const type of ["rect", "ellipse", "database", "circle", "actor", "postit", "text", "custom"] as const) {
      assert.equal(canBeCode({ type }), true, type);
    }
  });
});

describe("fromFence", () => {
  it("reads a fenced block with a language", () => {
    assert.deepEqual(fromFence("```bash\nls -la\n```"), { text: "ls -la", language: "bash" });
  });

  it("reads a fence without a language, keeping the indentation", () => {
    assert.deepEqual(fromFence("```\n  a\n    b\n```"), { text: "  a\n    b", language: "" });
  });

  it("reads an empty block", () => {
    assert.deepEqual(fromFence("```json\n```"), { text: "", language: "json" });
  });

  it("ignores whitespace around the whole text and around the language", () => {
    assert.deepEqual(fromFence("\n  ```ts \nlet a;\n```\n\n"), { text: "let a;", language: "ts" });
  });

  it("keeps blank lines inside", () => {
    assert.deepEqual(fromFence("```\na\n\nb\n```"), { text: "a\n\nb", language: "" });
  });

  it("gives null when it is not a complete fence", () => {
    assert.equal(fromFence("```js"), null);
    assert.equal(fromFence("```"), null);
    assert.equal(fromFence("hello"), null);
    assert.equal(fromFence(""), null);
    assert.equal(fromFence("```ts\nconst a = 1;```"), null);
    assert.equal(fromFence("```a`b\nx\n```"), null);
  });
});

describe("LANGUAGES", () => {
  it("suggests the usual tags", () => {
    assert.deepEqual([...LANGUAGES], ["bash", "json", "yaml", "js", "ts", "sql", "python", "html", "css", "xml"]);
  });
});
