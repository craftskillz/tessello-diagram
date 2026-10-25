// Shapes: drawn with each tool, resized, turned, styled and written, and the arrows that follow them.

import assert from "node:assert/strict";
import { test } from "node:test";
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
