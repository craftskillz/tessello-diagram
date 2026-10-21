// Where the lines of a shape's text are drawn: its lines wrap within the width of the shape, as in the original, and
// are placed by its alignments. SVG does not wrap text, so the width of a line is measured in the font of the View.

import type { Shape } from "./diagram.ts";

/** The space between the text and the box of its shape. */
const PAD = 8;
export const LINE_HEIGHT = 1.3;

/** The width of a text in a font size, in units of the drawing. */
export type Measure = (text: string, fontSize: number) => number;

/** The lines of a text whose lines wrap between words within `width`; a word wider than `width` stays whole. */
export function wrap(text: string, width: number, fontSize: number, measure: Measure): string[] {
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(" ")) {
      const longer = line ? `${line} ${word}` : word;
      if (line && measure(longer, fontSize) > width) {
        lines.push(line);
        line = word;
      } else line = longer;
    }
    return [...lines, line];
  });
}

export interface TextLayout {
  lines: string[];
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
 * outside its picture without wrapping, or over it as in a rectangle.
 */
export function layoutText(shape: Shape, measure: Measure): TextLayout {
  const lineHeight = shape.fontSize * LINE_HEIGHT;
  const outside = shape.type === "actor" ? "below" : shape.type === "custom" && shape.labelPlacement !== "center" ? (shape.labelPlacement ?? "below") : null;
  if (outside) {
    const lines = shape.text.split("\n");
    const block = (lines.length - 1) * lineHeight;
    if (outside === "below") return { lines, x: 0, y: shape.h / 2 + GAP + lineHeight / 2, anchor: "middle", lineHeight };
    if (outside === "above") return { lines, x: 0, y: -shape.h / 2 - GAP - lineHeight / 2 - block, anchor: "middle", lineHeight };
    if (outside === "right") return { lines, x: shape.w / 2 + GAP * 2, y: -block / 2, anchor: "start", lineHeight };
    return { lines, x: -shape.w / 2 - GAP * 2, y: -block / 2, anchor: "end", lineHeight };
  }
  const lines = wrap(shape.text, shape.w - PAD * 2, shape.fontSize, measure);
  const block = (lines.length - 1) * lineHeight;
  const y =
    shape.textValign === "top" ? -shape.h / 2 + PAD + shape.fontSize / 2 : shape.textValign === "bottom" ? shape.h / 2 - PAD - shape.fontSize / 2 - block : -block / 2;
  if (shape.textAlign === "left") return { lines, x: -shape.w / 2 + PAD, y, anchor: "start", lineHeight };
  if (shape.textAlign === "right") return { lines, x: shape.w / 2 - PAD, y, anchor: "end", lineHeight };
  return { lines, x: 0, y, anchor: "middle", lineHeight };
}

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
  return (text, fontSize) => {
    if (!context) return text.length * fontSize * 0.58;
    context.font = `${fontSize}px ${family}`;
    return context.measureText(text).width;
  };
}
