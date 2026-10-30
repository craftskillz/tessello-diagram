// The rich text of a shape: its plain text, cut into spans that each have a resolved style (bold, italic, underline), and
// back into the runs the model stores (diagram.ts). The editor works on spans; the model keeps only the ranges that differ
// from the style of the shape. Pure functions, with no knowledge of the DOM.

import type { TokenKind } from "./syntax.ts";

export const EMPHASES = ["bold", "italic", "underline"] as const;
export type Emphasis = (typeof EMPHASES)[number];

/**
 * A range of a shape's text that differs from the style of the shape: offsets into the text, the end excluded. A style
 * key that is absent follows the shape; one that is present, true or false, overrides it.
 */
export interface TextRun {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** The three styles of a piece of text, all resolved. */
export type SpanStyle = Record<Emphasis, boolean>;

/** A piece of text with its resolved style. */
export interface Span extends SpanStyle {
  text: string;
  /** The kind of code token the span is, in a code block; absent for plain text. */
  token?: TokenKind;
}

/** The part of a shape these functions read: its text, its runs, and its own style (absent is off). */
export interface RichText {
  text: string;
  textRuns?: TextRun[];
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** One character with its style: the form in which spans are cut and joined. */
type Char = { char: string } & SpanStyle;

/** The resolved style of a shape, or of any record with the three styles, absent being off. */
export const baseOf = (base: Partial<Record<Emphasis, boolean>>): SpanStyle => ({ bold: base.bold === true, italic: base.italic === true, underline: base.underline === true });
/** Whether two pieces of text have the same style. */
export const sameStyle = (a: SpanStyle, b: SpanStyle) => EMPHASES.every((key) => a[key] === b[key]);
const clampTo = (value: number, length: number) => Math.min(Math.max(value, 0), length);

// Offsets are UTF-16 offsets into the text, as everywhere else, so text is cut by unit.
const unitsOf = (spans: readonly Span[]): Char[] => spans.flatMap(({ text, bold, italic, underline }) => text.split("").map((char) => ({ char, bold, italic, underline })));

function spansFrom(chars: readonly Char[]): Span[] {
  const spans: Span[] = [];
  for (const { char, ...style } of chars) {
    const last = spans[spans.length - 1];
    if (last && sameStyle(last, style)) last.text += char;
    else spans.push({ text: char, ...style });
  }
  return spans;
}

/** The text of a shape cut into spans with their resolved style, adjacent equal spans merged; an empty text has none. */
export function spansOf(shape: RichText): Span[] {
  const own = baseOf(shape);
  const chars: Char[] = shape.text.split("").map((char) => ({ char, ...own }));
  for (const run of shape.textRuns ?? []) {
    for (let i = clampTo(run.start, chars.length); i < clampTo(run.end, chars.length); i++) {
      for (const key of EMPHASES) if (typeof run[key] === "boolean") chars[i][key] = run[key];
    }
  }
  return spansFrom(chars);
}

/**
 * The plain text of spans, and the minimal runs that give them their style over that of the shape (`base`): sorted,
 * without overlap, merged when adjacent and equal, with only the keys that differ. `textRuns` is absent when there are none.
 */
export function fromSpans(spans: readonly Span[], base: Partial<Record<Emphasis, boolean>>): { text: string; textRuns?: TextRun[] } {
  const own = baseOf(base);
  const runs: TextRun[] = [];
  let at = 0;
  for (const span of spans) {
    const start = at;
    at += span.text.length;
    if (span.text === "") continue;
    const run: TextRun = { start, end: at };
    for (const key of EMPHASES) if (span[key] !== own[key]) run[key] = span[key];
    if (Object.keys(run).length === 2) continue;
    const last = runs[runs.length - 1];
    if (last && last.end === start && EMPHASES.every((key) => last[key] === run[key])) last.end = at;
    else runs.push(run);
  }
  const text = spans.map((span) => span.text).join("");
  return runs.length > 0 ? { text, textRuns: runs } : { text };
}

/** Sets one style on the range [start, end) of the spans, splitting spans as needed and merging after. */
export function styleRange(spans: readonly Span[], start: number, end: number, key: Emphasis, value: boolean): Span[] {
  const chars = unitsOf(spans);
  for (let i = clampTo(start, chars.length); i < clampTo(end, chars.length); i++) chars[i][key] = value;
  return spansFrom(chars);
}

/**
 * Whether the style is on for the range [start, end): every character has it. A caret (start === end) has the style of
 * the character before it, or after it at the start of the text; an empty text has none.
 */
export function rangeStyle(spans: readonly Span[], start: number, end: number, key: Emphasis): boolean {
  const chars = unitsOf(spans);
  if (start === end) return (chars[start > 0 ? start - 1 : 0]?.[key]) === true;
  const range = chars.slice(clampTo(start, chars.length), clampTo(end, chars.length));
  return range.length > 0 && range.every((char) => char[key]);
}

/** Inserts text in a style at an offset (clamped to the text): for typing with a pending style, a line break or a plain paste. */
export function insertText(spans: readonly Span[], at: number, text: string, style: SpanStyle): Span[] {
  const chars = unitsOf(spans);
  const { bold, italic, underline } = style;
  chars.splice(clampTo(at, chars.length), 0, ...text.split("").map((char) => ({ char, bold, italic, underline })));
  return spansFrom(chars);
}

/** Deletes the range [start, end) of the spans, joining what is left. */
export function deleteRange(spans: readonly Span[], start: number, end: number): Span[] {
  const chars = unitsOf(spans);
  const from = clampTo(start, chars.length);
  chars.splice(from, Math.max(clampTo(end, chars.length) - from, 0));
  return spansFrom(chars);
}

/** Whether the whole text has the style: true if all of it does, false if none, undefined if mixed. An empty text has that of the shape. */
export function wholeStyle(shape: RichText, key: Emphasis): boolean | undefined {
  const spans = spansOf(shape);
  if (spans.length === 0) return shape[key] === true;
  if (spans.every((span) => span[key])) return true;
  return spans.every((span) => !span[key]) ? false : undefined;
}

/**
 * Gives the whole text the style, in place: the shape takes `value` for `key`, and the runs lose their override of that
 * key (runs left without a style are dropped, and `textRuns` goes when none remain). The other keys of the runs stay.
 */
export function styleWhole(shape: RichText, key: Emphasis, value: boolean): void {
  shape[key] = value;
  const stripped = (shape.textRuns ?? []).map((run) => {
    const { [key]: _removed, ...rest } = run;
    return rest;
  });
  const { textRuns } = fromSpans(spansOf({ ...shape, textRuns: stripped }), shape);
  if (textRuns) shape.textRuns = textRuns;
  else delete shape.textRuns;
}
