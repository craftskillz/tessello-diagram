// The code block of a shape: which shapes can show their text as code, the Markdown shortcut that turns a fenced text
// into a code block, and the languages suggested for it. Pure functions, with no knowledge of the DOM. The model keeps
// the block on the shape (diagram.ts); this module imports only its types.

import type { Shape } from "./diagram.ts";

/** The language tags suggested in the panel; any other tag is allowed. */
export const LANGUAGES = ["bash", "json", "yaml", "js", "ts", "sql", "python", "html", "css", "xml"] as const;

/** Whether the text of a shape can be shown as code: every type that carries text, apart from a table and an image. */
export function canBeCode(shape: Pick<Shape, "type">): boolean {
  return shape.type !== "table" && shape.type !== "image";
}

/**
 * The Markdown shortcut: a text that is a fenced block (an opening line of three backticks and an optional language, then
 * the code, then a closing line of three backticks) gives the code and its language. The indentation of the code is kept
 * as it is. Null when the text is not such a block.
 */
export function fromFence(text: string): { text: string; language: string } | null {
  const whole = text.trim();
  const match = /^```([^\n`]*)\n([\s\S]*?)\n?```$/.exec(whole);
  if (!match) return null;
  const closing = whole.slice(0, whole.length - 3);
  // The closing fence must be alone on its line (or directly after the opening line, for an empty block).
  if (match[2] !== "" && !closing.endsWith("\n")) return null;
  return { text: match[2], language: match[1].trim() };
}
