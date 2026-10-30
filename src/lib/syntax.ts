// The syntax colouring of a shape in code mode: the text of a code cut into tokens (keyword, string, number, comment, key,
// punctuation, variable) by the grammar of its language, and the paint of each kind of token. The analyser is small and
// in-house: one list of patterns per language family, tried in order at each position. It is not a parser, so it
// colours what looks right in a diagram, not every corner of a language. Pure functions, with no knowledge of the DOM.
// The colours are computed at render, never stored: a kind of token is a mix of a hue into the text colour of the shape
// (which already contrasts with its fill), so the result stays legible on every palette colour, light or dark.

export type TokenKind = "keyword" | "string" | "number" | "comment" | "key" | "punctuation" | "variable";

/** A piece of a line of code, with its kind; plain text has none. */
export interface Token {
  text: string;
  kind?: TokenKind;
}

/** A pattern of a grammar. It is sticky, so that it is tried at one position only. */
type Rule = [TokenKind, RegExp];

function rule(kind: TokenKind, source: string, flags = ""): Rule {
  return [kind, new RegExp(source, `${flags}y`)];
}

/** A whole word among a list of words, not part of a longer name, a flag or a member. */
function words(kind: TokenKind, list: string, flags = ""): Rule {
  return rule(kind, `(?<![\\w$.-])(?:${list})(?![\\w$-])`, flags);
}

const DOUBLE_QUOTED = String.raw`"(?:[^"\\\n]|\\.)*"?`;
const SINGLE_QUOTED = String.raw`'(?:[^'\\\n]|\\.)*'?`;
const BLOCK_COMMENT = String.raw`/\*[\s\S]*?(?:\*/|$)`;
const NUMBER = String.raw`(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.])`;

const JSON_RULES: Rule[] = [
  rule("key", String.raw`"(?:[^"\\\n]|\\.)*"(?=\s*:)`),
  rule("string", DOUBLE_QUOTED),
  rule("number", NUMBER),
  words("keyword", "true|false|null"),
  rule("punctuation", String.raw`[{}\[\],:]`),
];

const BASH_RULES: Rule[] = [
  rule("comment", String.raw`(?<![^\s;|&(])#[^\n]*`),
  rule("variable", String.raw`\$(?:[A-Za-z_]\w*|\d|[@#?$!*-]|\{[^}\n]*\})`),
  rule("string", String.raw`"(?:[^"\\]|\\[\s\S])*"?`),
  rule("string", String.raw`'[^']*'?`),
  words("keyword", "if|then|else|elif|fi|for|while|until|do|done|case|esac|in|select|function|export|local|readonly|declare|unset|return|exit|break|continue"),
  rule("punctuation", String.raw`[|&;<>(){}\[\]]`),
];

const YAML_RULES: Rule[] = [
  rule("comment", String.raw`(?<![^\s])#[^\n]*`),
  // A key: at the start of a line, after the indentation and any "- ", and followed by a colon and a space.
  rule("key", String.raw`(?<=^[ \t]*(?:-[ \t]+)*)(?:"[^"\n]*"|'[^'\n]*'|[^\s#:'"\-\[\]{},][^:#\n]*?)(?=[ \t]*:(?:\s|$))`, "m"),
  rule("string", DOUBLE_QUOTED),
  rule("string", String.raw`'(?:[^'\n]|'')*'?`),
  rule("number", NUMBER),
  words("keyword", "true|false|null", "i"),
  rule("keyword", String.raw`(?<![\w.-])~(?![\w.-])`),
  rule("punctuation", String.raw`:(?=\s|$)|-(?=\s)|[\[\]{},]`, "m"),
];

const JS_COMMON = String.raw`break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await|static|get|set|true|false|null|undefined|NaN`;
const TS_ONLY = String.raw`|interface|type|enum|implements|public|private|protected|readonly|abstract|declare|namespace|as|keyof|is|satisfies|infer|never|unknown|any|string|number|boolean`;

function jsRules(keywords: string): Rule[] {
  return [
    rule("comment", String.raw`//[^\n]*`),
    rule("comment", BLOCK_COMMENT),
    rule("string", DOUBLE_QUOTED),
    rule("string", SINGLE_QUOTED),
    rule("string", String.raw`\`(?:[^\`\\]|\\[\s\S])*\`?`),
    rule("number", String.raw`(?<![\w$.])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?(?![\w$])`),
    words("keyword", keywords),
    rule("punctuation", String.raw`=>|[{}()\[\];,.:]`),
  ];
}

const SQL_RULES: Rule[] = [
  rule("comment", String.raw`--[^\n]*`),
  rule("comment", BLOCK_COMMENT),
  rule("string", String.raw`'(?:[^']|'')*'?`),
  rule("number", String.raw`(?<![\w.])\d+(?:\.\d+)?(?![\w.])`),
  words(
    "keyword",
    "select|from|where|and|or|not|insert|into|values|update|set|delete|create|table|alter|drop|add|index|view|join|inner|left|right|outer|full|cross|on|as|group|by|order|having|limit|offset|union|all|distinct|null|is|in|like|between|exists|case|when|then|else|end|primary|key|foreign|references|default|unique|check|constraint|begin|commit|rollback|with|asc|desc|true|false|int|integer|varchar|text|boolean|date|timestamp",
    "i",
  ),
  rule("punctuation", String.raw`[(),;.]`),
];

const PYTHON_RULES: Rule[] = [
  rule("comment", String.raw`#[^\n]*`),
  rule("string", String.raw`(?<!\w)(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))`),
  rule("string", String.raw`(?<!\w)(?:[rRbBuUfF]{1,2})?(?:${DOUBLE_QUOTED}|${SINGLE_QUOTED})`),
  rule("keyword", String.raw`(?<=^[ \t]*)@[\w.]+`, "m"),
  rule("number", String.raw`(?<![\w.])(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?)(?![\w.])`),
  words(
    "keyword",
    "False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield",
  ),
  rule("punctuation", String.raw`[{}()\[\],:.]`),
];

const GRAMMARS: Record<string, Rule[]> = {
  json: JSON_RULES,
  bash: BASH_RULES,
  yaml: YAML_RULES,
  js: jsRules(JS_COMMON),
  ts: jsRules(JS_COMMON + TS_ONLY),
  sql: SQL_RULES,
  python: PYTHON_RULES,
};

const ALIASES: Record<string, string> = {
  json: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  js: "js",
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  ts: "ts",
  typescript: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  sql: "sql",
  python: "python",
  py: "python",
  python3: "python",
  py3: "python",
};

function grammarOf(language: string): Rule[] | undefined {
  const name = ALIASES[language.trim().toLowerCase()];
  return name ? GRAMMARS[name] : undefined;
}

/** Whether a language tag (or alias) is coloured. */
export function isHighlighted(language: string): boolean {
  return grammarOf(language) !== undefined;
}

/** Adds a piece of text to a line, joined to the last token when they have the same kind. */
function append(line: Token[], text: string, kind?: TokenKind): void {
  if (text === "") return;
  const last = line[line.length - 1];
  if (last && last.kind === kind) last.text += text;
  else line.push(kind ? { text, kind } : { text });
}

/**
 * The lines of a code, each as its tokens, by the grammar of its language; an unknown language gives each line as one plain
 * token. An empty line has no tokens. Joining the tokens of each line, and the lines by "\n", gives back the text exactly.
 * The whole text is read at once, so that a block comment or a triple-quoted string carries across lines.
 */
export function highlight(code: string, language: string): Token[][] {
  const rules = grammarOf(language) ?? [];
  const lines: Token[][] = [[]];
  const add = (text: string, kind?: TokenKind) => {
    const pieces = text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push([]);
      append(lines[lines.length - 1], piece, kind);
    });
  };
  let position = 0;
  while (position < code.length) {
    let matched = false;
    for (const [kind, pattern] of rules) {
      pattern.lastIndex = position;
      const match = pattern.exec(code);
      if (match && match[0] !== "") {
        add(match[0], kind);
        position += match[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      add(code[position]);
      position += 1;
    }
  }
  return lines;
}

/** How a kind is painted: a hue (or the fill, to dim) and its share in the mix, the rest being the text colour. */
const PAINTS: Record<TokenKind, { hue: string; share: number }> = {
  keyword: { hue: "#c026d3", share: 0.55 },
  string: { hue: "#16a34a", share: 0.55 },
  number: { hue: "#ea580c", share: 0.55 },
  key: { hue: "#0891b2", share: 0.55 },
  variable: { hue: "#ca8a04", share: 0.55 },
  comment: { hue: "fill", share: 0.4 },
  punctuation: { hue: "fill", share: 0.25 },
};

/** The CSS paint of a token kind, as a `color-mix(in srgb, …)` of the CSS variables `--text` and `--fill` of the shape's palette class. */
export function tokenCss(kind: TokenKind): string {
  const { hue, share } = PAINTS[kind];
  return `color-mix(in srgb, ${hue === "fill" ? "var(--fill)" : hue} ${Math.round(share * 100)}%, var(--text))`;
}

function rgbOf(hex: string): [number, number, number] {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16)) as [number, number, number];
}

/**
 * The same paint as a hex colour `#rrggbb`, for a text colour and a fill colour given in hex (for the draw.io export, which
 * uses the light palette). Same linear sRGB interpolation as color-mix, rounded per channel.
 */
export function tokenHex(kind: TokenKind, text: string, fill: string): string {
  const { hue, share } = PAINTS[kind];
  const from = rgbOf(hue === "fill" ? fill : hue);
  const to = rgbOf(text);
  const mixed = from.map((channel, index) => Math.round(channel * share + to[index] * (1 - share)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
