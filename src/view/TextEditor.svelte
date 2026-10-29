<script lang="ts">
  // The editor of the text of a shape: a contenteditable that shows the bold, italic and underline of each part of the text
  // while it is typed. The spans (richtext.ts) are the truth: the DOM is read back into spans after every input, and a
  // command (a style, a line break, a paste) changes the spans and draws them again, the selection kept by text offset.
  // Enter applies, Shift+Enter adds a line, Escape abandons, leaving the field applies. The state of its selection is
  // published for the panel, whose buttons act on it. Ctrl/Cmd+Z undoes within the editor from its own history, since
  // the browser's would not know of our redrawing; once applied, the undo of the diagram takes the whole edit as one step.
  import { onMount } from "svelte";
  import { baseOf, deleteRange, EMPHASES, type Emphasis, fromSpans, insertText, rangeStyle, type Span, type SpanStyle, spansOf, styleRange, type TextRun } from "../lib/richtext.ts";
  import { LINE_HEIGHT } from "../lib/text.ts";
  import { t } from "../lib/i18n.ts";
  import type { Shape } from "../lib/diagram.ts";

  /** What the panel needs of the selection of the editor: the styles it shows, and a command to flip one. */
  export interface TextSelection {
    styles: SpanStyle;
    toggle: (key: Emphasis) => void;
  }

  let {
    shape,
    left,
    top,
    width,
    height,
    fontSize,
    onapply,
    oncancel,
    selection = $bindable(null),
  }: {
    shape: Shape;
    left: number;
    top: number;
    width: number;
    height: number;
    fontSize: number;
    onapply: (result: { text: string; textRuns?: TextRun[] }) => void;
    oncancel: () => void;
    selection?: TextSelection | null;
  } = $props();

  let root: HTMLDivElement;
  /** The style the next typed characters take, set at a caret by a style command, until the caret moves. */
  let pending: SpanStyle | null = null;
  let pendingAt = -1;
  /** Where the selection was last, for a command that comes when it is elsewhere. */
  let last = { start: 0, end: 0 };
  let done = false;

  /** The text and selection before each change, for undo, and those undone, for redo. */
  type Snapshot = { spans: Span[]; start: number; end: number };
  const undos: Snapshot[] = [];
  let redos: Snapshot[] = [];
  /** Whether the last change was typing within a word, which the next typed character joins as one step. */
  let typing = false;

  // svelte-ignore state_referenced_locally
  const base = baseOf(shape);

  // ── DOM to spans ──
  const styleOf = (element: HTMLElement, parent: SpanStyle): SpanStyle => {
    const { fontWeight, fontStyle, textDecorationLine } = element.style;
    return {
      bold: fontWeight ? fontWeight === "bold" || Number(fontWeight) >= 600 : parent.bold,
      italic: fontStyle ? fontStyle === "italic" : parent.italic,
      underline: textDecorationLine ? textDecorationLine.includes("underline") : parent.underline,
    };
  };

  /** A `<br>` that is not a line of the text: the last child of the editor, which shows a final empty line, or the only content of an element. */
  const isFiller = (br: Element) => (br.parentNode === root && br === root.lastChild) || br.parentNode!.childNodes.length === 1;

  /** The spans the DOM holds, a style being that of the nearest element that has one; a stray `<br>` or block is a "\n". */
  function read(): Span[] {
    const spans: Span[] = [];
    const push = (text: string, style: SpanStyle) => text && spans.push({ text, ...style });
    const walk = (node: Node, style: SpanStyle) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) push((child as Text).data, style);
        else if (child instanceof HTMLBRElement) {
          if (!isFiller(child)) push("\n", style);
        } else if (child instanceof HTMLElement) {
          const block = child.tagName === "DIV" || child.tagName === "P";
          if (block && spans.length > 0 && !spans[spans.length - 1].text.endsWith("\n")) push("\n", style);
          walk(child, styleOf(child, style));
        }
      }
    };
    walk(root, base);
    return spans;
  }

  /** Draws the spans, each in an element with its three styles written out, then the filler that shows a final empty line. */
  function render(spans: readonly Span[]) {
    root.replaceChildren(
      ...spans.map(({ text, bold, italic, underline }) => {
        const element = document.createElement("span");
        element.style.fontWeight = bold ? "bold" : "normal";
        element.style.fontStyle = italic ? "italic" : "normal";
        element.style.textDecoration = underline ? "underline" : "none";
        element.textContent = text;
        return element;
      }),
      document.createElement("br"),
    );
  }

  // ── Selection and text offsets ──
  /** The text offset of a point of the DOM: the length of the text before it. */
  function offsetOf(container: Node, offset: number): number {
    let length = 0;
    const walk = (node: Node): boolean => {
      const children = [...node.childNodes];
      if (node === container && node.nodeType === Node.TEXT_NODE) return (length += offset), true;
      if (node.nodeType === Node.TEXT_NODE) return (length += (node as Text).data.length), false;
      for (let index = 0; index < children.length; index++) {
        if (node === container && index === offset) return true;
        const child = children[index];
        if (child instanceof HTMLBRElement) {
          if (!isFiller(child)) length++;
        } else if (walk(child)) return true;
      }
      return node === container;
    };
    walk(root);
    return length;
  }

  /** The point of the DOM at a text offset, in the text nodes the editor draws. */
  function pointAt(offset: number): { node: Node; offset: number } {
    const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let seen = 0;
    let latest: Text | null = null;
    for (let node = nodes.nextNode() as Text | null; node; node = nodes.nextNode() as Text | null) {
      if (offset <= seen + node.data.length) return { node, offset: offset - seen };
      seen += node.data.length;
      latest = node;
    }
    return latest ? { node: latest, offset: latest.data.length } : { node: root, offset: 0 };
  }

  /** The selection in text offsets, or null when it is not in the editor. */
  function selected(): { start: number; end: number } | null {
    const range = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
    if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    return { start: offsetOf(range.startContainer, range.startOffset), end: offsetOf(range.endContainer, range.endOffset) };
  }

  function select(start: number, end: number) {
    const from = pointAt(start);
    const to = pointAt(end);
    getSelection()?.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
    last = { start, end };
  }

  const current = () => selected() ?? last;

  // ── Styles of the selection ──
  /** The styles of a caret: those of the character before it, or of the shape in an empty text. */
  const caretStyle = (spans: readonly Span[], at: number): SpanStyle => (spans.length === 0 ? base : Object.fromEntries(EMPHASES.map((key) => [key, rangeStyle(spans, at, at, key)])) as SpanStyle);

  function stylesOf(spans: readonly Span[], { start, end }: { start: number; end: number }): SpanStyle {
    if (start === end) return pending ?? caretStyle(spans, start);
    return Object.fromEntries(EMPHASES.map((key) => [key, rangeStyle(spans, start, end, key)])) as SpanStyle;
  }

  /** Publishes the styles of the selection, when they changed. */
  function publish() {
    const styles = stylesOf(read(), current());
    if (!selection || EMPHASES.some((key) => selection!.styles[key] !== styles[key])) selection = { styles, toggle };
  }

  /** Remembers the text before a change; the characters of a word typed in a row make one step. */
  function remember(typed: boolean) {
    if (!(typed && typing)) {
      undos.push({ spans: read(), ...current() });
      redos = [];
    }
    typing = typed;
  }

  /** Undoes (from `undos` to `redos`) or redoes (the other way) one step. */
  function restore(from: Snapshot[], to: Snapshot[]) {
    const state = from.pop();
    if (!state) return;
    to.push({ spans: read(), ...current() });
    typing = false;
    pending = null;
    render(state.spans);
    select(state.start, state.end);
    publish();
  }
  const undo = () => restore(undos, redos);
  const redo = () => restore(redos, undos);

  /** Sets a style on the selection, or at a caret on what is typed next. */
  function toggle(key: Emphasis) {
    const spans = read();
    const range = current();
    if (range.start === range.end) {
      pending = { ...stylesOf(spans, range) };
      pending[key] = !pending[key];
      pendingAt = range.start;
    } else {
      remember(false);
      render(styleRange(spans, range.start, range.end, key, !rangeStyle(spans, range.start, range.end, key)));
      select(range.start, range.end);
    }
    publish();
  }

  /** Replaces the selection with a text, in the pending style or that of the caret, and puts the caret after it. */
  function insert(text: string) {
    const { start, end } = current();
    const spans = deleteRange(read(), start, end);
    const style = pending ?? caretStyle(spans, start);
    pending = null;
    render(insertText(spans, start, text, style));
    select(start + text.length, start + text.length);
    publish();
  }

  // ── Events ──
  function onBeforeInput(event: InputEvent) {
    const type = event.inputType;
    if (type === "historyUndo" || type === "historyRedo") {
      event.preventDefault();
      return type === "historyUndo" ? undo() : redo();
    }
    if (!type.startsWith("format")) remember(type === "insertText" && event.data !== " ");
    if (type === "insertLineBreak" || type === "insertParagraph") insertThen(event, "\n");
    else if (type === "insertFromPaste" || type === "insertFromDrop") insertThen(event, (event.dataTransfer?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n"));
    else if (type === "insertText" && pending && event.data) insertThen(event, event.data);
    else if (type === "formatBold" || type === "formatItalic" || type === "formatUnderline") {
      event.preventDefault();
      toggle(type.slice(6).toLowerCase() as Emphasis);
    }
  }

  function insertThen(event: Event, text: string) {
    event.preventDefault();
    insert(text);
  }

  function finish() {
    if (done) return;
    done = true;
    onapply(fromSpans(read(), shape));
  }

  function onKeyDown(event: KeyboardEvent) {
    const command = (event.ctrlKey || event.metaKey) && !event.altKey ? event.key.toLowerCase() : "";
    const style = ({ b: "bold", i: "italic", u: "underline" } as Record<string, Emphasis | undefined>)[command];
    if (command === "z" || command === "y") {
      event.preventDefault();
      event.stopPropagation();
      if (command === "z" && !event.shiftKey) undo();
      else redo();
    } else if (style) {
      event.preventDefault();
      event.stopPropagation();
      toggle(style);
    } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      finish();
    } else if (event.key === "Escape") {
      event.preventDefault();
      done = true;
      oncancel();
    }
  }

  /** The selection moved: a pending style stays only for the caret it was set at, then the panel is told. */
  function onSelectionChange() {
    const range = selected();
    if (!range) return;
    last = range;
    if (pending && (range.start !== range.end || range.start !== pendingAt)) pending = null;
    publish();
  }

  onMount(() => {
    render(spansOf(shape));
    root.focus();
    select(0, root.textContent?.length ?? 0);
    publish();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      selection = null;
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<div
  bind:this={root}
  class="dg-text-editor"
  role="textbox"
  aria-multiline="true"
  aria-label={t("text_label")}
  contenteditable="true"
  spellcheck="false"
  tabindex="0"
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  style:height="{height}px"
  style:font-size="{fontSize}px"
  style:line-height={LINE_HEIGHT}
  style:text-align={shape.textAlign}
  style:font-weight={shape.bold ? "bold" : undefined}
  style:font-style={shape.italic ? "italic" : undefined}
  style:text-decoration={shape.underline ? "underline" : undefined}
  onkeydown={onKeyDown}
  onbeforeinput={onBeforeInput}
  oninput={publish}
  onblur={finish}
></div>

<style>
  .dg-text-editor {
    position: absolute;
    padding: 4px;
    border: 2px solid var(--accent);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    font-family: inherit;
    white-space: pre-wrap;
    overflow: auto;
    outline: none;
  }
</style>
