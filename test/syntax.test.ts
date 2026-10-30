import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { highlight, isHighlighted, tokenCss, tokenHex, type Token, type TokenKind } from "../src/lib/syntax.ts";

/** A token, written short. */
function t(kind: TokenKind | undefined, text: string): Token {
  return kind ? { text, kind } : { text };
}

/** The kinds found in a code, as "kind:text" strings (plain text left out), over all its lines. */
function found(code: string, language: string): string[] {
  return highlight(code, language)
    .flat()
    .filter((token) => token.kind)
    .map((token) => `${token.kind}:${token.text}`);
}

describe("highlight, in general", () => {
  it("gives each line as one plain token for an unknown or empty language", () => {
    assert.deepEqual(highlight("a b\n\nc", "klingon"), [[t(undefined, "a b")], [], [t(undefined, "c")]]);
    assert.deepEqual(highlight("if x", ""), [[t(undefined, "if x")]]);
  });

  it("gives back the text exactly when the tokens are joined", () => {
    const samples: [string, string][] = [
      ['{"a": [1, true, "x\\"y"], "b": null}\n', "json"],
      ['if [ -f "$1" ]; then # c\n  echo ${HOME}\nfi', "bash"],
      ["a:\n  - b: 1\n  # c\n  d: 'x", "yaml"],
      ["const a = `x\ny`; /* c\nd */ f(1)", "ts"],
      ["SELECT 'it''s' -- c\nFROM t;", "sql"],
      ['def f():\n    """doc\n    s"""\n    return f"x"', "python"],
    ];
    for (const [code, language] of samples) {
      const joined = highlight(code, language)
        .map((line) => line.map((token) => token.text).join(""))
        .join("\n");
      assert.equal(joined, code, language);
    }
  });

  it("merges adjacent characters of the same kind and keeps spaces plain", () => {
    assert.deepEqual(highlight("true  false", "json"), [[t("keyword", "true"), t(undefined, "  "), t("keyword", "false")]]);
  });

  it("has no tokens for an empty line, and one empty line for an empty code", () => {
    assert.deepEqual(highlight("", "json"), [[]]);
    assert.deepEqual(highlight("1\n\n2", "json"), [[t("number", "1")], [], [t("number", "2")]]);
  });
});

describe("isHighlighted", () => {
  it("recognises the languages and their aliases, whatever the case", () => {
    for (const tag of ["json", "bash", "sh", "shell", "zsh", "yaml", "yml", "js", "javascript", "jsx", "mjs", "ts", "typescript", "tsx", "sql", "python", "py", "JSON", " Bash "]) {
      assert.equal(isHighlighted(tag), true, tag);
    }
  });

  it("is false for an unknown or empty language", () => {
    for (const tag of ["", "  ", "html", "klingon"]) assert.equal(isHighlighted(tag), false, tag);
  });
});

describe("json", () => {
  it("tells keys, strings, numbers, keywords and punctuation apart", () => {
    assert.deepEqual(highlight('{"a": [1.5e3, -2, "b", null]}', "json"), [
      [
        t("punctuation", "{"),
        t("key", '"a"'),
        t("punctuation", ":"),
        t(undefined, " "),
        t("punctuation", "["),
        t("number", "1.5e3"),
        t("punctuation", ","),
        t(undefined, " "),
        t("number", "-2"),
        t("punctuation", ","),
        t(undefined, " "),
        t("string", '"b"'),
        t("punctuation", ","),
        t(undefined, " "),
        t("keyword", "null"),
        t("punctuation", "]}"),
      ],
    ]);
  });

  it("keeps an escaped quote inside the string", () => {
    assert.deepEqual(found('["a\\"b"]', "json"), ["punctuation:[", 'string:"a\\"b"', "punctuation:]"]);
  });

  it("ends an unclosed string at the end of its line", () => {
    const lines = highlight('["abc\n1', "json");
    assert.deepEqual(lines[0], [t("punctuation", "["), t("string", '"abc')]);
    assert.deepEqual(lines[1], [t("number", "1")]);
  });
});

describe("bash", () => {
  it("colours comments, but not a # inside a word", () => {
    assert.deepEqual(found("echo a#b # real", "bash"), ["comment:# real"]);
  });

  it("colours keywords, variables and strings", () => {
    assert.deepEqual(found('if [ -n "$X" ]; then echo $1 ${HOME} $VAR; fi', "bash"), [
      "keyword:if",
      "punctuation:[",
      'string:"$X"',
      "punctuation:];",
      "keyword:then",
      "variable:$1",
      "variable:${HOME}",
      "variable:$VAR",
      "punctuation:;",
      "keyword:fi",
    ]);
  });

  it("does not take a keyword inside a word or a flag", () => {
    assert.deepEqual(found("ls --if-exists done-ish", "bash"), []);
  });

  it("handles an escaped quote and an unclosed string", () => {
    assert.deepEqual(found('echo "a\\"b" \'c', "bash"), ['string:"a\\"b"', "string:'c"]);
  });
});

describe("yaml", () => {
  it("colours keys, also after indentation and a dash", () => {
    assert.deepEqual(found("a:\n  b: 1\n  - c: x", "yaml"), [
      "key:a",
      "punctuation::",
      "key:b",
      "punctuation::",
      "number:1",
      "punctuation:-",
      "key:c",
      "punctuation::",
    ]);
  });

  it("colours comments, strings, booleans and null", () => {
    assert.deepEqual(found("k: \"s\" # note\nl: true\nm: null\nn: 'it''s'", "yaml"), [
      "key:k",
      "punctuation::",
      'string:"s"',
      "comment:# note",
      "key:l",
      "punctuation::",
      "keyword:true",
      "key:m",
      "punctuation::",
      "keyword:null",
      "key:n",
      "punctuation::",
      "string:'it''s'",
    ]);
  });

  it("does not take the colon of a URL for a key", () => {
    assert.deepEqual(found("url: http://x.io/a", "yaml"), ["key:url", "punctuation::"]);
  });
});

describe("js and ts", () => {
  it("colours keywords, numbers, strings and line comments", () => {
    assert.deepEqual(found("const x = 0x1F + 2.5; // done", "js"), ["keyword:const", "number:0x1F", "number:2.5", "punctuation:;", "comment:// done"]);
  });

  it("carries a block comment across lines", () => {
    const lines = highlight("a /* one\ntwo */ b", "js");
    assert.deepEqual(lines[0], [t(undefined, "a "), t("comment", "/* one")]);
    assert.deepEqual(lines[1], [t("comment", "two */"), t(undefined, " b")]);
  });

  it("carries an unclosed block comment to the end", () => {
    assert.deepEqual(highlight("/* a\nb", "js"), [[t("comment", "/* a")], [t("comment", "b")]]);
  });

  it("carries a template literal across lines", () => {
    const lines = highlight("`a\nb` c", "ts");
    assert.deepEqual(lines, [[t("string", "`a")], [t("string", "b`"), t(undefined, " c")]]);
  });

  it("handles escapes and unclosed strings, ending at the end of the line", () => {
    const lines = highlight("'a\\'b' \"c\nd", "js");
    assert.deepEqual(lines[0], [t("string", "'a\\'b'"), t(undefined, " "), t("string", '"c')]);
    assert.deepEqual(lines[1], [t(undefined, "d")]);
  });

  it("knows the keywords of typescript only in ts", () => {
    assert.deepEqual(found("interface A {}", "ts"), ["keyword:interface", "punctuation:{}"]);
    assert.deepEqual(found("interface A {}", "js"), ["punctuation:{}"]);
  });

  it("does not take a member or a longer name for a keyword", () => {
    assert.deepEqual(found("a.return = iffy", "js"), ["punctuation:."]);
  });
});

describe("sql", () => {
  it("colours keywords whatever their case, and numbers", () => {
    assert.deepEqual(found("select a From t where n >= 10;", "sql"), ["keyword:select", "keyword:From", "keyword:where", "number:10", "punctuation:;"]);
  });

  it("colours line and block comments, the latter across lines", () => {
    const lines = highlight("a -- x\n/* b\nc */ d", "sql");
    assert.deepEqual(lines[0], [t(undefined, "a "), t("comment", "-- x")]);
    assert.deepEqual(lines[1], [t("comment", "/* b")]);
    assert.deepEqual(lines[2], [t("comment", "c */"), t(undefined, " d")]);
  });

  it("reads a doubled quote as part of the string, and an unclosed string to the end", () => {
    assert.deepEqual(found("'it''s' 'open", "sql"), ["string:'it''s'", "string:'open"]);
  });
});

describe("python", () => {
  it("colours keywords, numbers and # comments", () => {
    assert.deepEqual(found("def f(x): return 3 # hi", "python"), ["keyword:def", "punctuation:(", "punctuation:):", "keyword:return", "number:3", "comment:# hi"]);
  });

  it("includes the prefix of a string, and handles escapes", () => {
    assert.deepEqual(found("f\"a\\\"b\" r'c' bar", "py"), ['string:f"a\\"b"', "string:r'c'"]);
  });

  it("carries a triple-quoted string across lines", () => {
    const lines = highlight('x = """a\nb"""\ny', "python");
    assert.deepEqual(lines[0], [t(undefined, "x = "), t("string", '"""a')]);
    assert.deepEqual(lines[1], [t("string", 'b"""')]);
    assert.deepEqual(lines[2], [t(undefined, "y")]);
  });

  it("carries an unclosed triple-quoted string to the end", () => {
    assert.deepEqual(highlight("'''a\nb", "python"), [[t("string", "'''a")], [t("string", "b")]]);
  });

  it("colours a decorator as a keyword", () => {
    assert.deepEqual(found("@app.route('/')", "python"), ["keyword:@app.route", "punctuation:(", "string:'/'", "punctuation:)"]);
  });
});

describe("tokenCss", () => {
  it("mixes a hue into the text colour, and the fill into the text for dimmed kinds", () => {
    assert.match(tokenCss("keyword"), /^color-mix\(in srgb, #[0-9a-f]{6} \d+%, var\(--text\)\)$/);
    assert.match(tokenCss("comment"), /^color-mix\(in srgb, var\(--fill\) \d+%, var\(--text\)\)$/);
  });
});

describe("tokenHex", () => {
  it("is the text colour for a kind with no share, and always a #rrggbb colour", () => {
    for (const kind of ["keyword", "string", "number", "comment", "key", "punctuation", "variable"] as const) {
      assert.match(tokenHex(kind, "#0f172a", "#ffffff"), /^#[0-9a-f]{6}$/, kind);
    }
  });

  it("dims a comment toward the fill, by the share of its paint", () => {
    // 40% of the fill (white) and 60% of the text (black), rounded per channel: 0.4 * 255 = 102 = 0x66.
    assert.equal(tokenHex("comment", "#000000", "#ffffff"), "#666666");
  });

  it("mixes a hue into the text, by the share of its paint", () => {
    // 55% of #c026d3 and 45% of black: 0.55 * 192 = 105.6 -> 106, 0.55 * 38 = 20.9 -> 21, 0.55 * 211 = 116.05 -> 116.
    assert.equal(tokenHex("keyword", "#000000", "#ffffff"), "#6a1574");
  });

  it("stays a distinct colour from the text on light and dark palettes", () => {
    for (const [text, fill] of [["#1e40af", "#dbeafe"], ["#bfdbfe", "#1e3a8a"], ["#ffffff", "#000000"]] as const) {
      for (const kind of ["keyword", "string", "number", "key", "variable"] as const) {
        assert.notEqual(tokenHex(kind, text, fill), text, `${kind} on ${fill}`);
      }
    }
  });
});
