// Exports: a PNG drawn from the model, and a .drawio file.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { addRectangle, addShape, at, downloaded, drag, newDiagram, openView, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

useBrowser();

/** The size of a PNG, from its header, and the opacity of its top-left pixel, as the browser decodes it. */
async function pngOf(page: Page, bytes: Buffer): Promise<{ w: number; h: number; cornerAlpha: number }> {
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "the file is a PNG");
  const cornerAlpha = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const context = new OffscreenCanvas(1, 1).getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  }, bytes.toString("base64"));
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20), cornerAlpha };
}

test("exports the whole diagram as a PNG drawn from its model, what is off the screen included, and the selection alone with Ctrl+Shift+E", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Checkout: v2");
  await addRectangle(opened, -150, 0, "A");
  await addRectangle(opened, 150, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -150, 0), await at(page, 150, 0)));
  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  // The drawing moves far out of the canvas.
  const middle = await at(page, 0, 0);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(3000, 0);
  await page.getByRole("img", { name: "Rectangle A", exact: true }).waitFor();

  // Twice the size of the drawing, with 20 around it: a rectangle 120 × 60 is 320 × 200.
  const selection = await downloaded(page, () => page.keyboard.press("ControlOrMeta+Shift+e"));
  assert.equal(selection.name, "Checkout_v2.png");
  const one = await pngOf(page, selection.bytes);
  assert.ok(Math.abs(one.w - 320) <= 4 && Math.abs(one.h - 200) <= 4, `${one.w} × ${one.h}`);
  assert.equal(one.cornerAlpha, 255, "the background of the theme");

  // Nothing selected: the two rectangles and the arrow between them, 420 wide.
  await page.keyboard.press("Escape");
  const whole = await pngOf(page, (await downloaded(page, () => page.getByRole("button", { name: "PNG", exact: true }).click())).bytes);
  assert.ok(Math.abs(whole.w - 920) <= 4 && Math.abs(whole.h - 200) <= 4, `${whole.w} × ${whole.h}`);

  await page.getByRole("button", { name: "Transparent" }).click();
  const transparent = await pngOf(page, (await downloaded(page, () => page.getByRole("button", { name: "PNG", exact: true }).click())).bytes);
  assert.equal(transparent.cornerAlpha, 0);
});

test("exports the diagram as a .drawio file, with a cell for each shape, group and arrow", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Billing");
  await addRectangle(opened, -100, 0, "A");
  await addShape(opened, "Database (D)", 100, 0, "B");
  await addRectangle(opened, 0, 150, "C");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -100, 0), await at(page, 100, 0)));
  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await page.getByRole("img", { name: "Database B", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await saved(host, () => page.getByRole("button", { name: "Group selection" }).click());

  const file = await downloaded(page, () => page.getByRole("button", { name: "Export as drawio (.drawio)" }).click());
  assert.equal(file.name, "Billing.drawio");
  const { shapes, arrows } = await storedDiagram(host);
  const parsed = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const cells = [...document.querySelectorAll("mxCell")];
    return {
      error: document.querySelector("parsererror")?.textContent ?? null,
      name: document.querySelector("diagram")?.getAttribute("name"),
      cells: cells.length,
      groups: cells.filter((cell) => cell.getAttribute("style") === "group;").length,
      edges: cells.filter((cell) => cell.getAttribute("edge") === "1").map((cell) => [cell.getAttribute("source"), cell.getAttribute("target")]),
      values: cells.filter((cell) => cell.getAttribute("vertex") === "1").map((cell) => cell.getAttribute("value")),
    };
  }, file.bytes.toString("utf8"));
  assert.equal(parsed.error, null);
  assert.equal(parsed.name, "Billing");
  // The root and its layer, the group, three shapes and the arrow.
  assert.equal(parsed.cells, 7);
  assert.equal(parsed.groups, 1);
  assert.deepEqual(parsed.edges, [[arrows[0].from.shapeId, arrows[0].to.shapeId]]);
  assert.deepEqual(parsed.values.filter(Boolean).sort(), shapes.map((shape) => shape.text).sort());
});
