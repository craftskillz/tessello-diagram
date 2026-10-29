// Tables: made with the toolbar, written cell by cell, resized in rows and columns, and found again after a reload or an undo.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { addRectangle, arrowEnds, at, canvas, clickAt, drag, dragHandle, middleOf, near, newDiagram, openView, panelSlidIn, reload, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

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
  assert.equal(await grid.locator("text:has-text('Role') tspan tspan").count(), 1);
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

test("the right border resizes the last column alone, the bottom border the last row, even turned", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const before = await selectedTable(opened);
  const widths = before.columns!.map((part) => part * before.w);
  const heights = before.rows!.map((part) => part * before.h);

  // The border is grabbed away from the side handle in its middle and from the link handles of the cells along it.
  const wider = await changed(host, before, () => dragFrom(page, before, before.w / 2, alongRight(before), 30, 0));
  const nextWidths = wider.columns!.map((part) => part * wider.w);
  assert.ok(Math.abs(nextWidths[2] - (widths[2] + 30)) < 2);
  assert.ok(Math.abs(nextWidths[0] - widths[0]) < 0.5 && Math.abs(nextWidths[1] - widths[1]) < 0.5);
  assert.ok(Math.abs(wider.w - (before.w + 30)) < 2);
  assert.ok(Math.abs(wider.x - wider.w / 2 - (before.x - before.w / 2)) < 0.5, "the left side stays");

  const taller = await changed(host, wider, () => dragFrom(page, wider, alongBottom(wider), wider.h / 2, 0, 20));
  const nextHeights = taller.rows!.map((part) => part * taller.h);
  assert.ok(Math.abs(nextHeights[2] - (heights[2] + 20)) < 2);
  assert.ok(Math.abs(nextHeights[0] - heights[0]) < 0.5 && Math.abs(nextHeights[1] - heights[1]) < 0.5);
  assert.ok(Math.abs(taller.h - (wider.h + 20)) < 2);
  assert.ok(Math.abs(taller.y - taller.h / 2 - (wider.y - wider.h / 2)) < 0.5, "the top side stays");

  for (let turn = 0; turn < 3; turn++) await page.getByRole("button", { name: "Rotate right by 10°" }).click();
  await until(async () => (await storedDiagram(host)).shapes[0].rotation === 30, "the rotation to be stored");
  const rotated = (await storedDiagram(host)).shapes[0];
  const angle = (30 * Math.PI) / 180;
  const turned = await changed(host, taller, () => dragFrom(page, rotated, rotated.w / 2, alongRight(rotated), 20 * Math.cos(angle), 20 * Math.sin(angle)));
  assert.ok(Math.abs(turned.w - (taller.w + 20)) < 3, `${taller.w} became ${turned.w}`);
  const turnedRow = await changed(host, turned, () => dragFrom(page, turned, alongBottom(turned), turned.h / 2, -20 * Math.sin(angle), 20 * Math.cos(angle)));
  assert.ok(Math.abs(turnedRow.h - (turned.h + 20)) < 3, `${turned.h} became ${turnedRow.h}`);

  const undone = await changed(host, turnedRow, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal(undone.h, turned.h);
  assert.equal(undone.w, turned.w);
});

test("a side handle still scales every column in proportion", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const before = await selectedTable(opened);
  const after = await changed(host, before, () => dragHandle(page, "Resize from the right side", 40, 0));
  assert.ok(after.w > before.w + 30);
  after.columns!.forEach((part, index) => assert.ok(Math.abs(part - before.columns![index]) < 1e-6));
});

test("drags a row separator: only that row changes and the table grows, even turned", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const before = await selectedTable(opened);
  const heights = before.rows!.map((part) => part * before.h);

  const after = await changed(host, before, () => dragHandle(page, "Resize row 1", 0, 20));
  const next = after.rows!.map((part) => part * after.h);
  assert.ok(Math.abs(next[0] - (heights[0] + 20)) < 2);
  assert.ok(Math.abs(next[1] - heights[1]) < 0.5 && Math.abs(next[2] - heights[2]) < 0.5);
  assert.ok(Math.abs(after.h - (before.h + 20)) < 2);
  assert.ok(Math.abs(after.y - after.h / 2 - (before.y - before.h / 2)) < 0.5, "the top side stays");
  assert.equal(after.cells?.length, before.cells?.length);

  // A click in the middle of the taller first row selects a cell of that row, not of the one below it.
  await tool(page, "Select (S)");
  const spot = await at(page, after.x, after.y - after.h / 2 + next[0] / 2);
  await page.mouse.click(spot.x, spot.y);
  await page.getByRole("button", { name: "Select row 1" }).waitFor();

  // Turned by 30°, the table grows along its own axis: the drag follows that axis on the screen.
  for (let turn = 0; turn < 3; turn++) await page.getByRole("button", { name: "Rotate right by 10°" }).click();
  await until(async () => (await storedDiagram(host)).shapes[0].rotation === 30, "the rotation to be stored");
  const angle = (30 * Math.PI) / 180;
  const turned = await changed(host, after, () => dragHandle(page, "Resize row 2", -20 * Math.sin(angle), 20 * Math.cos(angle)));
  assert.ok(Math.abs(turned.h - (after.h + 20)) < 3, `${after.h} became ${turned.h}`);

  const undone = await changed(host, turned, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal(undone.h, after.h);
});

type Opened = Awaited<ReturnType<typeof openView>>;
type Table = Awaited<ReturnType<typeof selectedTable>>;

/** A quarter of the way along the first column or row, between the link handles at its corner and at its middle. */
const alongBottom = (table: Table): number => -table.w / 2 + (table.columns![0] * table.w) / 4;
const alongRight = (table: Table): number => -table.h / 2 + (table.rows![0] * table.h) / 4;

/** Drags by (`dx`, `dy`) on screen from a point of the table given in its own frame, from its center and before its rotation. */
async function dragFrom(page: Opened["page"], table: Table, lx: number, ly: number, dx: number, dy: number) {
  const angle = (table.rotation * Math.PI) / 180;
  const from = await at(page, table.x + lx * Math.cos(angle) - ly * Math.sin(angle), table.y + lx * Math.sin(angle) + ly * Math.cos(angle));
  await drag(page, from, { x: from.x + dx, y: from.y + dy });
}

const links = (page: Opened["page"]) => page.getByRole("button", { name: /^Link from cell/ });

/** The middle of a cell of a table placed by the Table tool (equal columns), in page coordinates. */
function cellSpot(page: Opened["page"], table: Table, row: number, col: number) {
  const [rows, columns] = [table.cells!.length, table.cells![0].length];
  return at(page, table.x - table.w / 2 + ((col + 0.5) * table.w) / columns, table.y - table.h / 2 + ((row + 0.5) * table.h) / rows);
}

test("hovering a cell on the border shows its points as link handles: 5 for a corner, 3 for an edge, none inside", async () => {
  const opened = await openView();
  const { page } = opened;
  const table = await selectedTable(opened);
  await tool(page, "Select (S)");
  for (const [row, col, count] of [[0, 0, 5], [0, 1, 3], [1, 2, 3], [2, 2, 5], [1, 1, 0]] as const) {
    const spot = await cellSpot(page, table, row, col);
    await page.mouse.move(spot.x, spot.y);
    await until(async () => (await links(page).count()) === count, `${count} link handles on cell ${row}, ${col}`);
  }
  const corner = await cellSpot(page, table, 0, 2);
  await page.mouse.move(corner.x, corner.y);
  await page.getByRole("button", { name: "Link from cell 1, 3 (top-right)" }).waitFor();
});

test("pulls a link from a cell point; the Arrow tool starts and ends on cell points; the arrow follows its cell when a column widens", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const table = await selectedTable(opened);
  await addRectangle(opened, 400, 0, "Target");
  await tool(page, "Select (S)");
  // Fits both shapes beside the panel of the selection, which would otherwise push Target, on the right edge, out of view.
  await clickAt(page, table.x, table.y);
  await panelSlidIn(page);
  await page.getByRole("group", { name: "Zoom" }).getByRole("button", { name: "Fit" }).click();
  const spot = await cellSpot(page, table, 0, 2);
  await page.mouse.move(spot.x, spot.y);
  const handle = page.getByRole("button", { name: "Link from cell 1, 3 (right)" });
  await handle.waitFor();
  await saved(host, async () => drag(page, await middleOf(handle), await at(page, 400, 0)));
  let data = await storedDiagram(host);
  assert.deepEqual(data.arrows[0].from, { shapeId: data.shapes[0].id, port: "r0c2-E" });
  assert.equal(data.arrows[0].to.shapeId, data.shapes[1].id);

  // The Arrow tool aims at the cell points of the table and ends on one.
  await tool(page, "Arrow (F)");
  const end = await at(page, table.x - table.w / 2, table.y + table.h / 2 - table.h / 6);
  await page.mouse.move(end.x + 4, end.y);
  await until(async () => (await canvas(page).locator('.dg-port[data-port="r2c0-W"]').count()) === 1, "the cell points to be shown");
  await saved(host, async () => drag(page, await at(page, 400, 20), { x: end.x + 4, y: end.y }));
  data = await storedDiagram(host);
  assert.equal(data.arrows.length, 2);
  assert.deepEqual(data.arrows[1].to, { shapeId: data.shapes[0].id, port: "r2c0-W" });

  // Widening the first column moves the left border and keeps the left arrow on its cell, but not the right one.
  await tool(page, "Select (S)");
  await page.keyboard.press("Escape");
  await clickAt(page, table.x, table.y);
  const name = (await page.getByRole("img", { name: /^Arrow/ }).first().getAttribute("aria-label"))!;
  const before = await arrowEnds(page, name);
  await dragHandle(page, "Resize from the right side", 60, 0);
  await until(async () => Math.abs((await arrowEnds(page, name)).start.x - before.start.x) > 20, "the arrow to follow its cell");
});

test("a cell's link handles never cover the resize, rotate or separator handles, at any zoom, and each handle keeps its own job", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const table = await selectedTable(opened);
  await addRectangle(opened, 0, -260, "Above");
  await tool(page, "Select (S)");
  await clickAt(page, table.x, table.y);
  const zoom = page.getByRole("group", { name: "Zoom" });
  const rects = (selector: string) =>
    page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map(({ left, top, right, bottom }) => ({ left, top, right, bottom })));
  for (const [button, times, percent] of [["Zoom in", 0, "100%"], ["Zoom in", 2, "156%"], ["Zoom out", 3, "51%"]] as const) {
    await zoom.getByRole("button", { name: "Fit" }).click();
    await zoom.getByText("100%", { exact: true }).waitFor();
    for (let i = 0; i < times; i++) await zoom.getByRole("button", { name: button }).click();
    await zoom.getByText(percent, { exact: true }).waitFor();
    await page.mouse.move(0, 0);
    for (const [row, col, count] of [[0, 1, 3], [0, 0, 5], [1, 0, 3]] as const) {
      const spot = await cellSpot(page, table, row, col);
      await page.mouse.move(spot.x, spot.y);
      await until(async () => (await links(page).count()) === count, `${count} handles on cell ${row}, ${col} at ${percent}`);
      // A link handle is a circle, measured from its center: the box of its turned group is wider than it.
      const connect = (await rects(".dg-connect circle")).map(({ left, top, right, bottom }) => {
        const [x, y, r] = [(left + right) / 2, (top + bottom) / 2, 9];
        return { left: x - r, top: y - r, right: x + r, bottom: y + r };
      });
      const others = await rects(".dg-handle, .dg-separator");
      assert.ok(others.length >= 9);
      // They have the size of the link handles of other shapes, and a table has no handle that turns its text alone.
      const size = await page.locator(".dg-connect circle").first().getAttribute("r");
      assert.equal(size, "9");
      assert.equal(await page.locator(".dg-handle-text").count(), 0);
      for (const a of connect) {
        for (const b of others) {
          const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
          assert.ok(apart, `a link handle ${JSON.stringify(a)} covers ${JSON.stringify(b)} at ${percent}`);
        }
      }
    }
  }
  await zoom.getByRole("button", { name: "Fit" }).click();
  await zoom.getByText("100%", { exact: true }).waitFor();

  // With the middle top cell hovered, the top side handle still resizes and its N link handle still pulls an arrow.
  const top = await cellSpot(page, table, 0, 1);
  await page.mouse.move(top.x, top.y);
  await links(page).first().waitFor();
  const taller = await changedHeight(host, table.h, () => dragHandle(page, "Resize from the top side", 0, -30));
  assert.ok(taller > table.h + 20);
  const grown = (await storedDiagram(host)).shapes[0];
  const hover = await cellSpot(page, grown, 0, 1);
  await page.mouse.move(hover.x, hover.y);
  const north = page.getByRole("button", { name: "Link from cell 1, 2 (top)" });
  await north.waitFor();
  await saved(host, async () => drag(page, await middleOf(north), await at(page, 0, -260)));
  const data = await storedDiagram(host);
  assert.deepEqual(data.arrows[0].from, { shapeId: data.shapes[0].id, port: "r0c1-N" });
  assert.equal(data.arrows[0].to.shapeId, data.shapes[1].id);
});

async function changedHeight(host: Opened["host"], was: number, change: () => Promise<unknown>) {
  await change();
  await until(async () => (await storedDiagram(host)).shapes[0].h !== was, "the table to be stored with its new height");
  return (await storedDiagram(host)).shapes[0].h;
}

const cellsSelected = (page: Opened["page"]) => page.locator(".dg-cell-selected");
const styles = async (host: Opened["host"]) => (await storedDiagram(host)).shapes[0].cellStyles!;
/** Clicks a cell of a table with Shift held. */
async function shiftClick(page: Opened["page"], table: Table, row: number, col: number) {
  const spot = await cellSpot(page, table, row, col);
  await page.keyboard.down("Shift");
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.up("Shift");
}

test("selects a cell of a selected table, styles it from the panel, then extends the selection to a rectangle", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const table = await selectedTable(opened);
  await tool(page, "Select (S)");
  assert.equal(await cellsSelected(page).count(), 0);

  const first = await cellSpot(page, table, 0, 1);
  await page.mouse.click(first.x, first.y);
  await until(async () => (await cellsSelected(page).count()) === 1, "one cell to be selected");
  await saved(host, () => page.getByRole("button", { name: "Red", exact: true }).click());
  await saved(host, () => page.getByRole("button", { name: "Bold", exact: true }).click());
  let cellStyles = await styles(host);
  assert.deepEqual(cellStyles[0][1], { color: "c-red", bold: true });
  assert.deepEqual([cellStyles[0][0], cellStyles[0][2], ...cellStyles[1], ...cellStyles[2]], Array.from({ length: 8 }, () => ({})));
  assert.equal(await page.getByRole("button", { name: "Bold", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal((await storedDiagram(host)).shapes[0].color, table.color, "the table keeps its own color");

  const size = page.getByRole("spinbutton", { name: "Font size" });
  await size.fill("20");
  await saved(host, () => size.press("Enter"));
  assert.equal((await styles(host))[0][1].fontSize, 20);

  // Shift+click extends the selection to the rectangle between the first cell and this one; the sizes differ there.
  await shiftClick(page, table, 1, 2);
  await until(async () => (await cellsSelected(page).count()) === 4, "a rectangle of 4 cells to be selected");
  assert.equal(await size.inputValue(), "");
  assert.equal(await page.getByRole("button", { name: "Bold", exact: true }).getAttribute("aria-pressed"), "false");
  await size.fill("24");
  await saved(host, () => size.press("Enter"));
  cellStyles = await styles(host);
  for (const [row, col] of [[0, 1], [0, 2], [1, 1], [1, 2]]) assert.equal(cellStyles[row][col].fontSize, 24, `cell ${row}, ${col}`);
  assert.equal(cellStyles[0][0].fontSize, undefined);
  assert.equal(cellStyles[2][2].fontSize, undefined);
  assert.equal(await size.inputValue(), "24");
});

test("a column bar and a row bar select a column and a row; Escape returns to the table, whose style then erases those of its cells", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const table = await selectedTable(opened);
  await tool(page, "Select (S)");

  await page.getByRole("button", { name: "Select column 2" }).click();
  await until(async () => (await cellsSelected(page).count()) === 3, "a column to be selected");
  await saved(host, () => page.getByRole("button", { name: "Italic", exact: true }).click());
  let cellStyles = await styles(host);
  assert.deepEqual(cellStyles.map((row) => row[1]), [{ italic: true }, { italic: true }, { italic: true }]);
  assert.deepEqual(cellStyles.map((row) => row[0]), [{}, {}, {}]);

  await page.getByRole("button", { name: "Select row 3" }).click();
  await until(async () => (await cellsSelected(page).count()) === 3, "a row to be selected");
  await saved(host, () => page.getByRole("button", { name: "Green", exact: true }).click());
  cellStyles = await styles(host);
  assert.deepEqual(cellStyles[2].map((style) => style.color), ["c-green", "c-green", "c-green"]);
  assert.equal(cellStyles[0][2].color, undefined);

  await page.keyboard.press("Escape");
  await until(async () => (await cellsSelected(page).count()) === 0, "the cells to be unselected");
  assert.equal(await page.getByRole("button", { name: "Select row 3" }).count(), 1, "the table stays selected");
  await saved(host, () => page.getByRole("button", { name: "Blue", exact: true }).click());
  const after = (await storedDiagram(host)).shapes[0];
  assert.equal(after.color, "c-blue");
  assert.ok(after.cellStyles!.every((row) => row.every((style) => Object.keys(style).length === 0)), "no cell keeps its own style");

  // A click outside the table also gives the selection back to the whole table.
  await page.getByRole("button", { name: "Select column 1" }).click();
  await until(async () => (await cellsSelected(page).count()) === 3, "a column to be selected again");
  await clickAt(page, table.x + table.w, table.y + table.h);
  await until(async () => (await cellsSelected(page).count()) === 0, "the cells to be unselected by a click outside");
});

test("the style of a cell is drawn, undone, redone and kept after a reload", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const table = await selectedTable(opened);
  await tool(page, "Select (S)");
  const spot = await cellSpot(page, table, 0, 1);
  await page.mouse.dblclick(spot.x, spot.y);
  await page.getByRole("textbox", { name: "Cell 1, 2" }).fill("Role");
  await saved(host, () => page.getByRole("textbox", { name: "Cell 1, 2" }).press("Enter"));
  await page.mouse.click(spot.x, spot.y);
  await until(async () => (await cellsSelected(page).count()) === 1, "the cell to be selected");
  await saved(host, () => page.getByRole("button", { name: "Red", exact: true }).click());
  await saved(host, () => page.getByRole("button", { name: "Bold", exact: true }).click());

  const grid = page.locator('[data-type="table"]');
  const shown = async () => ({
    fills: await grid.locator("[data-cell-fill]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-cell-fill"))),
    weight: await grid.locator("text:has-text('Role') tspan tspan").evaluate((node) => getComputedStyle(node).fontWeight),
  });
  assert.deepEqual((await shown()).fills, ["r0c1"]);
  assert.ok(Number((await shown()).weight) >= 600 || (await shown()).weight === "bold");

  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual((await styles(host))[0][1], {});
  assert.deepEqual((await shown()).fills, []);
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  assert.deepEqual((await styles(host))[0][1], { color: "c-red", bold: true });

  await reload(page);
  await grid.waitFor();
  assert.deepEqual((await styles(host))[0][1], { color: "c-red", bold: true });
  assert.deepEqual((await shown()).fills, ["r0c1"]);
});

test("the bars that select rows and columns never cover the resize, rotate, separator or link handles, at any zoom", async () => {
  const opened = await openView();
  const { page } = opened;
  const table = await selectedTable(opened);
  await tool(page, "Select (S)");
  const zoom = page.getByRole("group", { name: "Zoom" });
  const rects = (selector: string) =>
    page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map(({ left, top, right, bottom }) => ({ left, top, right, bottom })));
  for (const [times, percent] of [[0, "100%"], [2, "156%"]] as const) {
    await zoom.getByRole("button", { name: "Fit" }).click();
    await zoom.getByText("100%", { exact: true }).waitFor();
    for (let i = 0; i < times; i++) await zoom.getByRole("button", { name: "Zoom in" }).click();
    await zoom.getByText(percent, { exact: true }).waitFor();
    for (const [row, col, count] of [[0, 0, 5], [0, 1, 3]] as const) {
      const spot = await cellSpot(page, table, row, col);
      await page.mouse.move(spot.x, spot.y);
      await until(async () => (await links(page).count()) === count, `${count} link handles at ${percent}`);
      const bars = await rects(".dg-pick");
      assert.equal(bars.length, 6);
      const connect = (await rects(".dg-connect circle")).map(({ left, top, right, bottom }) => {
        const [x, y] = [(left + right) / 2, (top + bottom) / 2];
        return { left: x - 9, top: y - 9, right: x + 9, bottom: y + 9 };
      });
      const others = [...(await rects(".dg-handle:not(.dg-pick), .dg-separator")), ...connect];
      assert.ok(others.length >= 9 + count);
      for (const a of bars) {
        for (const b of others) {
          const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
          assert.ok(apart, `a bar ${JSON.stringify(a)} covers ${JSON.stringify(b)} at ${percent}`);
        }
      }
    }
  }
});
