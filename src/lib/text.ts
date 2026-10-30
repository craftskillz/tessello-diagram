// Where the lines of a shape's text are drawn: its lines wrap within the width of the shape, as in the original, and
// are placed by its alignments. SVG does not wrap text, so the width of a line is measured in the font of the View.

import type { Shape } from "./diagram.ts";
import { sameStyle, type Span, spansOf } from "./richtext.ts";
import { highlight } from "./syntax.ts";
import { cellBox, cellStyleOf, tableOf } from "./table.ts";

/** The space between the text and the box of its shape. */
const PAD = 8;
export const LINE_HEIGHT = 1.3;

/** The weight and slant a text is measured in; underline does not change its width. */
export interface Font {
  bold?: boolean;
  italic?: boolean;
}

/** The width of a text in a font size, in units of the drawing; in the regular font unless a `font` says otherwise. */
export type Measure = (text: string, fontSize: number, font?: Font) => number;

/** The lines of a text whose lines wrap between words within `width`, measured in `font`; a word wider than `width` stays whole. */
export function wrap(text: string, width: number, fontSize: number, measure: Measure, font?: Font): string[] {
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(" ")) {
      const longer = line ? `${line} ${word}` : word;
      if (line && measure(longer, fontSize, font) > width) {
        lines.push(line);
        line = word;
      } else line = longer;
    }
    return [...lines, line];
  });
}

/** A word of a paragraph: its spans, and the space before it (absent for the first word). */
interface Word {
  pieces: Span[];
  gap?: Span;
}

const measureSpans = (spans: readonly Span[], fontSize: number, measure: Measure) =>
  spans.reduce((sum, { text, bold, italic }) => sum + (text ? measure(text, fontSize, { bold, italic }) : 0), 0);

/** Appends a span to a line, merging it into the last when they have the same style. */
function append(line: Span[], span: Span): void {
  const last = line[line.length - 1];
  if (last && sameStyle(last, span)) last.text += span.text;
  else line.push({ ...span });
}

/** The spans of a text cut into its paragraphs, at the "\n" between them; an empty paragraph has no spans. */
function paragraphsOf(spans: readonly Span[]): Span[][] {
  const paragraphs: Span[][] = [[]];
  for (const span of spans) {
    span.text.split("\n").forEach((part, index) => {
      if (index > 0) paragraphs.push([]);
      if (part) append(paragraphs[paragraphs.length - 1], { ...span, text: part });
    });
  }
  return paragraphs;
}

/** The words of a paragraph, split at each space as `wrap` does; a word keeps all the spans it is made of. */
function wordsOf(paragraph: readonly Span[]): Word[] {
  const words: Word[] = [{ pieces: [] }];
  for (const span of paragraph) {
    span.text.split(" ").forEach((part, index) => {
      if (index > 0) words.push({ pieces: [], gap: { ...span, text: " " } });
      if (part) words[words.length - 1].pieces.push({ ...span, text: part });
    });
  }
  return words;
}

/** The lines of styled text whose lines wrap between words within `width`, each span measured in its own font; the rules of `wrap`. */
function wrapSpans(spans: readonly Span[], width: number, fontSize: number, measure: Measure): Span[][] {
  return paragraphsOf(spans).flatMap((paragraph) => {
    const lines: Span[][] = [];
    let line: Span[] = [];
    for (const word of wordsOf(paragraph)) {
      const longer: Span[] = [];
      for (const span of [...line, ...(line.length && word.gap ? [word.gap] : []), ...word.pieces]) append(longer, span);
      if (line.length && measureSpans(longer, fontSize, measure) > width) {
        lines.push(line);
        line = [];
        for (const span of word.pieces) append(line, span);
      } else line = longer;
    }
    return [...lines, line];
  });
}

export interface TextLayout {
  /** The lines, each as its spans with their resolved style; an empty line has no spans. */
  lines: Span[][];
  /** Where the lines start, in the frame of the shape: `x` by `anchor`, `y` the middle of the first line. */
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  lineHeight: number;
}

/** The space between a picture and the text placed beside it. */
const GAP = 4;

/**
 * The lines of the text of a shape and where they go, in the frame of the shape. The text of an actor goes below its
 * silhouette, centered and without wrapping, as in the original; that of a custom shape goes where its placement says,
 * outside its picture without wrapping, or over it as in a rectangle. The lines keep the spans of the text, and wrap as
 * each span measures in its own bold and italic. A code block is the exception to all of this: its lines are those of
 * the text, unwrapped and with their spaces, at the top-left inside the box, whatever its type and alignments. Their
 * spans carry the kind of token of the language (`token`), which only colours them: it changes no measure and no position.
 */
export function layoutText(shape: Shape, measure: Measure): TextLayout {
  const lineHeight = shape.fontSize * LINE_HEIGHT;
  if (shape.code) {
    const lines = highlight(shape.text, shape.code.language).map((tokens): Span[] =>
      tokens.map(({ text, kind }) => ({ text, bold: false, italic: false, underline: false, ...(kind ? { token: kind } : {}) })),
    );
    return { lines, x: -shape.w / 2 + PAD, y: -shape.h / 2 + PAD + shape.fontSize / 2, anchor: "start", lineHeight };
  }
  const outside = shape.type === "actor" ? "below" : shape.type === "custom" && shape.labelPlacement !== "center" ? (shape.labelPlacement ?? "below") : null;
  if (outside) {
    const lines = paragraphsOf(spansOf(shape));
    const block = (lines.length - 1) * lineHeight;
    if (outside === "below") return { lines, x: 0, y: shape.h / 2 + GAP + lineHeight / 2, anchor: "middle", lineHeight };
    if (outside === "above") return { lines, x: 0, y: -shape.h / 2 - GAP - lineHeight / 2 - block, anchor: "middle", lineHeight };
    if (outside === "right") return { lines, x: shape.w / 2 + GAP * 2, y: -block / 2, anchor: "start", lineHeight };
    return { lines, x: -shape.w / 2 - GAP * 2, y: -block / 2, anchor: "end", lineHeight };
  }
  const lines = wrapSpans(spansOf(shape), shape.w - PAD * 2, shape.fontSize, measure);
  const block = (lines.length - 1) * lineHeight;
  const y =
    shape.textValign === "top" ? -shape.h / 2 + PAD + shape.fontSize / 2 : shape.textValign === "bottom" ? shape.h / 2 - PAD - shape.fontSize / 2 - block : -block / 2;
  if (shape.textAlign === "left") return { lines, x: -shape.w / 2 + PAD, y, anchor: "start", lineHeight };
  if (shape.textAlign === "right") return { lines, x: shape.w / 2 - PAD, y, anchor: "end", lineHeight };
  return { lines, x: 0, y, anchor: "middle", lineHeight };
}

/**
 * The lines of the text of a cell of a table and where they go, in the frame of the table: they wrap within the width
 * of the cell, as the text of a rectangle the size of the cell does, and are placed from its center. The cell is laid
 * out in the style it shows: its own font size and alignments over those of the table, drawn in its bold, italic and underline.
 */
export function layoutCell(shape: Shape, row: number, col: number, measure: Measure): TextLayout {
  const { x, y, w, h } = cellBox(shape, row, col);
  const { fontSize, bold, italic, underline, textAlign, textValign } = cellStyleOf(shape, row, col);
  const text = tableOf(shape).cells[row]?.[col] ?? "";
  const layout = layoutText({ ...shape, type: "rect", code: undefined, text, textRuns: undefined, w, h, fontSize, bold, italic, underline, textAlign, textValign }, measure);
  return { ...layout, x: layout.x + x, y: layout.y + y };
}

/** The space between the label of an arrow and the edge of its background. */
export const LABEL_PAD = 3;

/** The lines of the label of an arrow, and the size of the box they take, around its center. */
export interface LabelLayout {
  lines: string[];
  w: number;
  h: number;
  lineHeight: number;
}

/**
 * The lines of an arrow's label: they wrap within its width when it has one, and keep their lines otherwise, the
 * automatic width being that of the longest.
 */
export function layoutLabel(label: { label: string; labelSize: number; labelWidth: number | null }, measure: Measure): LabelLayout {
  const lineHeight = label.labelSize * LINE_HEIGHT;
  const lines = label.labelWidth ? wrap(label.label, label.labelWidth, label.labelSize, measure) : label.label.split("\n");
  const w = label.labelWidth ?? Math.max(...lines.map((line) => measure(line, label.labelSize)));
  return { lines, w, h: lines.length * lineHeight, lineHeight };
}

/** Measures in the font of the View, with a canvas; an estimate where there is none. */
export function canvasMeasure(): Measure {
  const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const family = typeof document === "undefined" ? "" : getComputedStyle(document.body).fontFamily;
  return (text, fontSize, { bold, italic } = {}) => {
    if (!context) return text.length * fontSize * 0.58 * (bold ? 1.1 : 1);
    context.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${fontSize}px ${family}`;
    return context.measureText(text).width;
  };
}
