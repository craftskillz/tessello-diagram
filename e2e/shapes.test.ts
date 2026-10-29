// Shapes: drawn with each tool, resized, turned, styled and written, and the arrows that follow them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { addRectangle, addShape, arrowEnds, at, canvas, drag, dragHandle, middleOf, near, newDiagram, openView, reload, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

useBrowser();

test("keeps two rectangles connected by an arrow after a reload, and the arrow follows a moved rectangle", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Checkout");
  await addRectangle(opened, -200, 0, "API");
  await addRectangle(opened, 200, 0, "DB");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));

  await reload(page);
  await page.getByRole("img", { name: "Rectangle API", exact: true }).waitFor();
  await page.getByRole("img", { name: "Rectangle DB", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Diagram title" }).inputValue(), "Checkout");
  const arrow = "Arrow from Rectangle API to Rectangle DB";
  // The rectangles are 120 × 60: the line stops at their outline, and never enters them.
  let ends = await arrowEnds(page, arrow);
  near(ends.start, { x: -140, y: 0 });
  near(ends.tip, { x: 140, y: 0 });

  await tool(page, "Select (S)");
  await saved(host, async () => drag(page, await at(page, 200, 0), await at(page, 200, 300)));
  // From DB at (200, 300) toward API at (−200, 0), the line meets the top side of DB at (160, 270).
  ends = await arrowEnds(page, arrow);
  near(ends.tip, { x: 160, y: 270 });
  near(ends.start, { x: -160, y: 30 });

  await reload(page);
  await page.getByRole("img", { name: arrow }).waitFor();
  near((await arrowEnds(page, arrow)).tip, { x: 160, y: 270 });
});

test("draws each built-in shape, resizes it with Shift, turns it, styles it and writes its text, and finds it all after a reload", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Shapes");
  // Each shape is resized by its bottom-right corner, by (30, 5) with Shift: the larger change wins, and the
  // top-left corner stays.
  const shapes = [
    { tool: "Rectangle (R)", name: "Rectangle", text: "R1", x: -240, y: -130, size: [150, 75] },
    { tool: "Ellipse (E)", name: "Ellipse", text: "E1", x: -60, y: -130, size: [150, 75] },
    { tool: "Database (D)", name: "Database", text: "D1", x: 110, y: -130, size: [90, 120] },
    { tool: "Circle (C)", name: "Circle", text: "C1", x: 260, y: -130, size: [90, 90] },
    { tool: "Actor (A)", name: "Actor", text: "A1", x: -240, y: 90, size: [66, 114.4] },
    { tool: "Post-it (P)", name: "Post-it", text: "P1", x: -60, y: 90, size: [150, 125] },
    { tool: "Free text (T)", name: "Free text", text: "T1", x: 130, y: 90, size: [150, 37.5] },
  ] as const;
  for (const shape of shapes) {
    await addShape(opened, shape.tool, shape.x, shape.y, shape.text);
    await page.keyboard.down("Shift");
    await saved(host, () => dragHandle(page, "Resize from the bottom-right corner", 30, 5));
    await page.keyboard.up("Shift");
    await saved(host, () => page.getByRole("button", { name: "Rotate right by 10°" }).click());
    await saved(host, () => page.getByRole("button", { name: "Blue" }).click());
  }

  // The rotation handle of the selected free text, dragged to its right, turns it a quarter turn.
  const text = (await storedDiagram(host)).shapes.find((shape) => shape.text === "T1")!;
  const right = await at(page, text.x + 100, text.y);
  const handle = await middleOf(page.getByRole("button", { name: "Rotate the shape", exact: true }));
  await saved(host, () => drag(page, handle, right));
  // Its text has its own handle: dragged below the shape, the text points down, a quarter turn more than the shape.
  const below = await at(page, text.x, text.y + 100);
  const textHandle = await middleOf(page.getByRole("button", { name: "Rotate the text", exact: true }));
  await saved(host, () => drag(page, textHandle, below));

  // Ctrl+A selects everything, and the panel changes every selected shape.
  await canvas(page).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+a");
  const size = page.getByRole("spinbutton", { name: "Font size" });
  await size.fill("20");
  await saved(host, () => size.press("Enter"));
  // Ctrl+click adds a shape to the selection, and takes it out again.
  await page.getByRole("img", { name: "Rectangle R1", exact: true }).click();
  await page.getByRole("img", { name: "Database D1", exact: true }).click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Edit text" }).waitFor({ state: "detached" });
  await page.getByRole("img", { name: "Database D1", exact: true }).click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Edit text" }).waitFor();
  // A click selects one shape alone, and its text is edited with the button of the panel.
  await page.getByRole("img", { name: "Ellipse E1", exact: true }).click();
  await page.getByRole("button", { name: "Edit text" }).click();
  await page.getByRole("textbox", { name: "Text of the shape" }).fill("Edge cache");
  await saved(host, () => page.getByRole("textbox", { name: "Text of the shape" }).press("Enter"));

  await reload(page);
  await page.getByRole("img", { name: "Ellipse Edge cache" }).waitFor();
  const stored = (await storedDiagram(host)).shapes;
  for (const shape of shapes) {
    const name = shape.text === "E1" ? "Edge cache" : shape.text;
    const drawn = page.getByRole("img", { name: `${shape.name} ${name}`, exact: true });
    assert.match((await drawn.getAttribute("class"))!, /\bc-blue\b/);
    const found = stored.find((item) => item.text === name)!;
    assert.ok(Math.abs(found.w - shape.size[0]) <= 0.5 && Math.abs(found.h - shape.size[1]) <= 0.5, `${shape.name}: ${found.w} × ${found.h}`);
    assert.equal(found.rotation, shape.text === "T1" ? 90 : 10);
    assert.equal(found.fontSize, 20);
    assert.equal(found.textRotation, shape.text === "T1" ? 90 : 0);
    assert.match((await drawn.getAttribute("transform"))!, new RegExp(`rotate\\(${found.rotation}\\)`));
  }
});

test("an attached arrow follows the real outline of a shape that is resized or turned", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Outline");
  await addShape(opened, "Ellipse (E)", -200, 0, "Front");
  await addShape(opened, "Circle (C)", 200, 0, "Store");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));
  const arrow = "Arrow from Ellipse Front to Circle Store";
  // The ellipse is 120 × 60 and the circle 60 across: the line stops on their curves.
  let ends = await arrowEnds(page, arrow);
  near(ends.start, { x: -140, y: 0 });
  near(ends.tip, { x: 170, y: 0 });

  // Resized from its center by its bottom-right corner, by (30, 30), the circle is 120 across.
  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Circle Store", exact: true }).click();
  await page.getByRole("button", { name: "Resize: fixed corner" }).click();
  await saved(host, () => dragHandle(page, "Resize from the bottom-right corner", 30, 30));
  ends = await arrowEnds(page, arrow);
  near(ends.tip, { x: 140, y: 0 });

  // Turned a quarter turn, the ellipse is 60 wide on screen.
  await page.getByRole("img", { name: "Ellipse Front", exact: true }).click();
  for (let turn = 0; turn < 9; turn++) await saved(host, () => page.getByRole("button", { name: "Rotate right by 10°" }).click());
  ends = await arrowEnds(page, arrow);
  near(ends.start, { x: -170, y: 0 });
});

test("bold, italic and underline style the whole text of any shape: drawn, edited, undone, redone and kept after a reload", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Emphasis");
  await addRectangle(opened, -150, 0, "Role");
  await addShape(opened, "Free text (T)", 150, 0, "Note");
  const emphases = ["Bold", "Italic", "Underline"] as const;
  const shown = (text: string) => page.locator(`text:has-text('${text}') tspan tspan`).first().evaluate((node) => {
    const { fontWeight, fontStyle, textDecorationLine } = getComputedStyle(node);
    return { bold: Number(fontWeight) >= 600 || fontWeight === "bold", italic: fontStyle === "italic", underline: textDecorationLine.includes("underline") };
  });
  const all = { bold: true, italic: true, underline: true };

  for (const [name, text, index] of [["Rectangle Role", "Role", 0], ["Free text Note", "Note", 1]] as const) {
    await page.getByRole("img", { name, exact: true }).click();
    for (const emphasis of emphases) {
      const button = page.getByRole("button", { name: emphasis, exact: true });
      assert.equal(await button.getAttribute("aria-pressed"), "false");
      await saved(host, () => button.click());
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    }
    const style = (await storedDiagram(host)).shapes[index];
    assert.deepEqual([style.bold, style.italic, style.underline], [true, true, true]);
    assert.deepEqual(await shown(text), all);
  }

  // The editor shows the font of the shape while its text is written.
  await page.getByRole("img", { name: "Rectangle Role", exact: true }).dblclick();
  const editor = page.getByRole("textbox", { name: "Text of the shape" });
  const font = await editor.evaluate((node) => { const { fontWeight, fontStyle, textDecorationLine } = getComputedStyle(node); return { bold: Number(fontWeight) >= 600, italic: fontStyle === "italic", underline: textDecorationLine.includes("underline") }; });
  assert.deepEqual(font, all);
  await page.keyboard.press("Escape");

  await page.getByRole("img", { name: "Free text Note", exact: true }).click();
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await shown("Note"), { bold: true, italic: true, underline: false });
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  assert.deepEqual(await shown("Note"), all);

  await reload(page);
  await page.getByRole("img", { name: "Rectangle Role", exact: true }).waitFor();
  const kept = (await storedDiagram(host)).shapes;
  assert.deepEqual(kept.map((shape) => [shape.bold, shape.italic, shape.underline]), [[true, true, true], [true, true, true]]);
  assert.deepEqual(await shown("Role"), all);
  assert.deepEqual(await shown("Note"), all);
});

// The rich text of a shape: a part of its text styled in the editor, from the keyboard or the panel.

/** The spans of the editor, each with its text and the styles it shows. */
const editorSpans = (editor: import("playwright").Locator) =>
  editor.evaluate((node) =>
    [...node.querySelectorAll("span")].map((span) => {
      const { fontWeight, fontStyle, textDecorationLine } = getComputedStyle(span);
      return { text: span.textContent, bold: Number(fontWeight) >= 600, italic: fontStyle === "italic", underline: textDecorationLine.includes("underline") };
    }),
  );

/** The pieces of the drawn text of a shape that are nested in a line and carry the given attribute, as their text. */
const drawn = (page: import("playwright").Page, attribute: string) =>
  page.locator("text tspan tspan").evaluateAll((nodes, attribute) => nodes.filter((node) => node.hasAttribute(attribute)).map((node) => node.textContent), attribute);

test("a part of the text of a shape is made bold with Ctrl/Cmd+B in the editor: drawn, applied by Enter, undone and redone in one step and kept after a reload", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Rich");
  await addRectangle(opened, 0, 0, "alpha beta");

  await page.getByRole("img", { name: "Rectangle alpha beta", exact: true }).dblclick();
  const editor = page.getByRole("textbox", { name: "Text of the shape" });
  await page.keyboard.press("End");
  for (let key = 0; key < 4; key++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("ControlOrMeta+b");
  assert.deepEqual(await editorSpans(editor), [
    { text: "alpha ", bold: false, italic: false, underline: false },
    { text: "beta", bold: true, italic: false, underline: false },
  ]);

  await saved(host, () => page.keyboard.press("Enter"));
  await editor.waitFor({ state: "detached" });
  assert.deepEqual(await drawn(page, "font-weight"), ["beta"]);
  assert.deepEqual((await storedDiagram(host)).shapes[0].textRuns, [{ start: 6, end: 10, bold: true }]);

  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await drawn(page, "font-weight"), []);
  assert.equal((await storedDiagram(host)).shapes[0].textRuns, undefined);
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  assert.deepEqual(await drawn(page, "font-weight"), ["beta"]);

  await reload(page);
  await page.getByRole("img", { name: "Rectangle alpha beta", exact: true }).waitFor();
  assert.deepEqual(await drawn(page, "font-weight"), ["beta"]);
  assert.deepEqual((await storedDiagram(host)).shapes[0].textRuns, [{ start: 6, end: 10, bold: true }]);
});

test("Ctrl/Cmd+Z undoes the typing and the styles within the editor, a word at a time, and Ctrl/Cmd+Shift+Z redoes them", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Undo rich");
  await addRectangle(opened, 0, 0, "alpha beta");

  await page.getByRole("img", { name: "Rectangle alpha beta", exact: true }).dblclick();
  const editor = page.getByRole("textbox", { name: "Text of the shape" });
  const text = () => editor.evaluate((node) => node.textContent);
  await page.keyboard.press("End");
  await page.keyboard.type(" gamma");
  for (let key = 0; key < 5; key++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("ControlOrMeta+b");
  assert.deepEqual((await editorSpans(editor)).map(({ text, bold }) => [text, bold]), [["alpha beta ", false], ["gamma", true]]);

  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual((await editorSpans(editor)).map(({ text, bold }) => [text, bold]), [["alpha beta gamma", false]]);
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await text(), "alpha beta ");
  await page.keyboard.press("ControlOrMeta+z");
  assert.equal(await text(), "alpha beta");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  assert.equal(await text(), "alpha beta ");
  // The editor stays open: the undo of the diagram is not reached.
  assert.ok(await editor.evaluate((node) => node === document.activeElement));

  await saved(host, () => page.keyboard.press("Enter"));
  assert.equal((await storedDiagram(host)).shapes[0].text, "alpha beta ");
});

test("the panel styles the selected part of the text being edited, shows the state of the selection, and a style set at a caret goes to what is typed next", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Panel rich");
  await addRectangle(opened, 0, 0, "alpha beta");

  await page.getByRole("img", { name: "Rectangle alpha beta", exact: true }).dblclick();
  const editor = page.getByRole("textbox", { name: "Text of the shape" });
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await page.keyboard.press("End");
  for (let key = 0; key < 4; key++) await page.keyboard.press("Shift+ArrowLeft");
  assert.equal(await italic.getAttribute("aria-pressed"), "false");
  await italic.click();
  // The editor stays open and keeps the focus, and the button shows the state of the selection.
  assert.ok(await editor.evaluate((node) => node === document.activeElement));
  assert.equal(await italic.getAttribute("aria-pressed"), "true");
  assert.deepEqual((await editorSpans(editor)).map(({ text, italic }) => [text, italic]), [["alpha ", false], ["beta", true]]);
  await page.keyboard.press("Home");
  await until(async () => (await italic.getAttribute("aria-pressed")) === "false", "the button to show the caret in an unstyled word");

  // A caret at the end, underline: only the next character is underlined.
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+u");
  const underline = page.getByRole("button", { name: "Underline", exact: true });
  await until(async () => (await underline.getAttribute("aria-pressed")) === "true", "the button to show the pending underline");
  await page.keyboard.type("x");
  assert.deepEqual((await editorSpans(editor)).map(({ text, underline }) => [text, underline]), [["alpha ", false], ["beta", false], ["x", true]]);
  await page.keyboard.type("y");
  await saved(host, () => page.keyboard.press("Enter"));
  // What is typed after the italic word keeps its italic, as in a word processor, and gains the underline.
  assert.deepEqual((await storedDiagram(host)).shapes[0].textRuns, [{ start: 6, end: 10, italic: true }, { start: 10, end: 12, italic: true, underline: true }]);
});

test("Shift+Enter adds a line to the text of a shape and a paste inserts plain text only", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Lines");
  await addRectangle(opened, 0, 0, "one");

  await page.getByRole("img", { name: "Rectangle one", exact: true }).dblclick();
  const editor = page.getByRole("textbox", { name: "Text of the shape" });
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("two");
  await editor.evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/plain", "!");
    data.setData("text/html", "<b>bold</b>");
    node.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await saved(host, () => page.keyboard.press("Enter"));
  const [shape] = (await storedDiagram(host)).shapes;
  assert.equal(shape.text, "one\ntwo!");
  assert.equal(shape.textRuns, undefined);
});

test("outside editing, the emphasis buttons act on the whole text and erase the styles of its parts", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Whole");
  await addRectangle(opened, 0, 0, "alpha beta");

  await page.getByRole("img", { name: "Rectangle alpha beta", exact: true }).dblclick();
  await page.keyboard.press("End");
  for (let key = 0; key < 4; key++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await saved(host, () => page.keyboard.press("Enter"));

  const bold = page.getByRole("button", { name: "Bold", exact: true });
  assert.equal(await bold.getAttribute("aria-pressed"), "false");
  await saved(host, () => bold.click());
  assert.equal(await bold.getAttribute("aria-pressed"), "true");
  let [shape] = (await storedDiagram(host)).shapes;
  assert.equal(shape.bold, true);
  assert.deepEqual(shape.textRuns, [{ start: 6, end: 10, italic: true }]);
  assert.deepEqual(await drawn(page, "font-weight"), ["alpha ", "beta"]);

  await saved(host, () => bold.click());
  assert.equal(await bold.getAttribute("aria-pressed"), "false");
  [shape] = (await storedDiagram(host)).shapes;
  assert.ok(!shape.bold);
  assert.deepEqual(shape.textRuns, [{ start: 6, end: 10, italic: true }]);
  assert.deepEqual(await drawn(page, "font-weight"), []);
});
