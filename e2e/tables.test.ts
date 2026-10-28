// Tables: made with the toolbar, written cell by cell, resized in rows and columns, and found again after a reload or an undo.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { at, dragHandle, newDiagram, openView, reload, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

useBrowser();

test("creates a 3 × 3 table, writes its cells with Tab, wraps long text in a column, and finds the cells after a reload and an undo", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Grid");

  // The first cell is edited right after the table is placed.
  await tool(page, "Table");
  const center = await at(page, 0, 0);
  await page.mouse.dblclick(center.x, center.y);
  await page.getByRole("textbox", { name: "Cell 1, 1" }).fill("Name");
  // Tab applies and moves on to the next cell, then Shift+Tab goes back.
  await saved(host, () => page.getByRole("textbox", { name: "Cell 1, 1" }).press("Tab"));
  await page.getByRole("textbox", { name: "Cell 1, 2" }).fill("Role");
  await page.getByRole("textbox", { name: "Cell 1, 2" }).press("Tab");
  await page.getByRole("textbox", { name: "Cell 1, 3" }).press("Shift+Tab");
  await page.getByRole("textbox", { name: "Cell 1, 2" }).press("Escape");

  await until(async () => (await storedDiagram(host)).shapes[0]?.cells?.[0][1] === "Role", "the cells to be stored");
  let table = (await storedDiagram(host)).shapes[0];
  assert.equal(table.type, "table");
  assert.deepEqual(table.cells, [["Name", "Role", ""], ["", "", ""], ["", "", ""]]);
  assert.equal(table.columns?.length, 3);

  // A double-click on a cell edits that cell; the text is drawn inside its column only.
  const grid = page.locator('[data-type="table"]');
  await grid.waitFor();
  const cell = await at(page, table.x, table.y);
  await page.mouse.dblclick(cell.x, cell.y);
  await page.getByRole("textbox", { name: "Cell 2, 2" }).fill("a very long text that has to wrap inside its own column");
  await saved(host, () => page.getByRole("textbox", { name: "Cell 2, 2" }).press("Enter"));
  assert.ok((await grid.locator("text:has-text('wrap') tspan").count()) > 1);
  const longest = await grid.locator("text:has-text('wrap')").evaluate((node: SVGTextElement) => node.getBBox().width);
  assert.ok(longest <= table.w / 3, `the text is ${longest} wide in a column of ${table.w / 3}`);

  // Escape abandons what was typed.
  await page.mouse.dblclick(cell.x, cell.y);
  await page.getByRole("textbox", { name: "Cell 2, 2" }).fill("lost");
  await page.getByRole("textbox", { name: "Cell 2, 2" }).press("Escape");
  assert.equal((await storedDiagram(host)).shapes[0].cells?.[1][1], "a very long text that has to wrap inside its own column");

  await reload(page);
  await grid.waitFor();
  assert.equal(await grid.locator("text:has-text('Role')").count(), 1);
  table = (await storedDiagram(host)).shapes[0];
  assert.equal(table.cells?.[0][0], "Name");

  // An undo gives back the previous text of a cell.
  await page.mouse.dblclick(cell.x, cell.y);
  await page.getByRole("textbox", { name: "Cell 2, 2" }).fill("second");
  await saved(host, () => page.getByRole("textbox", { name: "Cell 2, 2" }).press("Enter"));
  assert.equal((await storedDiagram(host)).shapes[0].cells?.[1][1], "second");
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal((await storedDiagram(host)).shapes[0].cells?.[1][1], "a very long text that has to wrap inside its own column");
});

test("changes the rows and the columns of a selected table from the panel", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Grid");
  await tool(page, "Table");
  const center = await at(page, 0, 0);
  await page.mouse.dblclick(center.x, center.y);
  await page.getByRole("textbox", { name: "Cell 1, 1" }).press("Escape");

  const rows = page.getByRole("spinbutton", { name: "Rows" });
  const columns = page.getByRole("spinbutton", { name: "Columns" });
  assert.equal(await rows.inputValue(), "3");
  assert.equal(await columns.inputValue(), "3");
  await rows.fill("5");
  await saved(host, () => rows.press("Enter"));
  await columns.fill("2");
  await saved(host, () => columns.press("Enter"));

  const table = (await storedDiagram(host)).shapes[0];
  assert.equal(table.cells?.length, 5);
  assert.ok(table.cells?.every((row) => row.length === 2));
  assert.equal(await page.locator('[data-type="table"] .dg-grid-line').count(), 4 + 1);
  await until(async () => (await rows.inputValue()) === "5", "the panel to show the rows");
});

/** A table placed at the center of the drawing and left selected, read back as stored. */
async function selectedTable(opened: Awaited<ReturnType<typeof openView>>) {
  const { page, host } = opened;
  await newDiagram(opened, "Grid");
  await tool(page, "Table");
  const center = await at(page, 0, 0);
  await page.mouse.dblclick(center.x, center.y);
  await page.getByRole("textbox", { name: "Cell 1, 1" }).press("Escape");
  await page.getByRole("button", { name: "Resize from the right side" }).waitFor();
  await until(async () => (await storedDiagram(host)).shapes.length === 1, "the table to be stored");
  return (await storedDiagram(host)).shapes[0];
}

/** Runs a change, then waits until the stored table is no longer the one given, and returns it. */
async function changed(host: Parameters<typeof storedDiagram>[0], was: { w: number; h: number; fontSize: number }, change: () => Promise<unknown>) {
  await change();
  const same = (shape: typeof was) => shape.w === was.w && shape.h === was.h && shape.fontSize === was.fontSize;
  await until(async () => !same((await storedDiagram(host)).shapes[0] as typeof was), "the table to be stored with its new size");
  return (await storedDiagram(host)).shapes[0];
}

test("resizes a table by a side without changing its text size, and an undo gives back its size", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const before = await selectedTable(opened);

  const wider = await changed(host, before, () => dragHandle(page, "Resize from the right side", 40, 0));
  assert.ok(Math.abs(wider.w - (before.w + 40)) < 2, `${before.w} grew to ${wider.w}`);
  assert.equal(wider.h, before.h);
  assert.equal(wider.fontSize, before.fontSize);
  assert.ok(Math.abs(wider.x - (before.x + 20)) < 1, "the left side stays");
  wider.columns!.forEach((part, index) => assert.ok(Math.abs(part - before.columns![index]) < 1e-6));

  const taller = await changed(host, wider, () => dragHandle(page, "Resize from the bottom side", 0, 30));
  assert.ok(Math.abs(taller.h - (before.h + 30)) < 2);
  assert.equal(taller.fontSize, before.fontSize);

  // One undo gives back the size before the last gesture.
  const undone = await changed(host, taller, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal(undone.h, before.h);
  assert.equal(undone.w, wider.w);
});

test("resizes a table by a corner with its text size", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const before = await selectedTable(opened);

  const after = await changed(host, before, () => dragHandle(page, "Resize from the bottom-right corner", 60, 10));
  const scale = after.w / before.w;
  assert.ok(scale > 1.1);
  assert.ok(Math.abs(after.h / before.h - scale) < 0.01, "the proportions are kept");
  assert.ok(after.fontSize > before.fontSize);
});

test("drags a column separator: only that column changes and the table widens, even turned", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const before = await selectedTable(opened);
  const widths = before.columns!.map((part) => part * before.w);

  const after = await changed(host, before, () => dragHandle(page, "Resize column 1", 30, 0));
  const next = after.columns!.map((part) => part * after.w);
  assert.ok(Math.abs(next[0] - (widths[0] + 30)) < 2);
  assert.ok(Math.abs(next[1] - widths[1]) < 0.5 && Math.abs(next[2] - widths[2]) < 0.5);
  assert.ok(Math.abs(after.w - (before.w + 30)) < 2);
  assert.ok(Math.abs(after.x - after.w / 2 - (before.x - before.w / 2)) < 0.5, "the left side stays");
  assert.equal(after.cells?.length, before.cells?.length);

  // Turned by 30°, the table widens along its own axis: the drag follows that axis on the screen.
  for (let turn = 0; turn < 3; turn++) await page.getByRole("button", { name: "Rotate right by 10°" }).click();
  await until(async () => (await storedDiagram(host)).shapes[0].rotation === 30, "the rotation to be stored");
  const angle = (30 * Math.PI) / 180;
  const turned = await changed(host, after, () => dragHandle(page, "Resize column 2", 20 * Math.cos(angle), 20 * Math.sin(angle)));
  assert.ok(Math.abs(turned.w - (after.w + 20)) < 3, `${after.w} became ${turned.w}`);

  const undone = await changed(host, turned, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal(undone.w, after.w);
});
