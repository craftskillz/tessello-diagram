// Diagrams: undo and redo, the title, deleting a diagram, and a change that cannot be saved.

import assert from "node:assert/strict";
import { test } from "node:test";
import { addRectangle, answered, at, clickAt, drag, dragHandle, newDiagram, openView, pointOn, reload, saved, sidebar, stored, storedDiagram, storedIndex, tool, useBrowser } from "./diagram.ts";

useBrowser();

test("undoes a move, a waypoint and a rename one by one, redoes them all, and finds them after a reload", async () => {
  const opened = await openView();
  const { page, host , surface } = opened;
  await newDiagram(opened, "Plan");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));
  // The history starts over when the diagram is opened: what was drawn before is not undone.
  await reload(page);
  const name = "Arrow from Rectangle A to Rectangle B";
  await page.getByRole("img", { name, exact: true }).waitFor();

  const state = async () => {
    const diagram = await storedDiagram(host);
    const a = diagram.shapes.find((shape) => shape.text === "A")!;
    return { a: [a.x, a.y], waypoints: diagram.arrows[0].waypoints.length, title: (await storedIndex(host))[0].title };
  };
  const undone = await state();

  await tool(page, "Select (S)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, -200, 100)));
  const middle = await pointOn(page, name, 0.5);
  await page.mouse.click(middle.x, middle.y);
  await saved(host, () => dragHandle(page, "Drag to add a waypoint", 0, -80));
  const field = page.getByRole("textbox", { name: "Diagram title" });
  await field.fill("Renamed");
  await saved(host, () => field.press("Enter"));
  await clickAt(page, 0, 300);

  const done = { a: [-200, 100], waypoints: 1, title: "Renamed" };
  assert.deepEqual(await state(), done);

  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await state(), { ...done, title: undone.title });
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await state(), { ...done, waypoints: undone.waypoints, title: undone.title });
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await state(), undone);
  assert.equal(await field.inputValue(), "Plan");
  // There is nothing more to undo.
  await page.keyboard.press("ControlOrMeta+z");
  assert.deepEqual(await state(), undone);

  for (let step = 0; step < 3; step++) await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  assert.deepEqual(await state(), done);

  // Shown again after it was hidden, the View reads the diagram again: unchanged, it keeps its history.
  await answered(page, () => {
    surface.setVisible(false);
    surface.setVisible(true);
  });
  await clickAt(page, 0, 300);
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await state(), { ...done, title: undone.title });
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));

  await reload(page);
  await page.getByRole("img", { name, exact: true }).waitFor();
  assert.deepEqual(await state(), done);
  assert.equal(await field.inputValue(), "Renamed");
});

test("Ctrl+Z in the title field undoes the typing, not the diagram", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Plan");
  await addRectangle(opened, 0, 0, "A");
  const field = page.getByRole("textbox", { name: "Diagram title" });
  await field.click();
  await field.pressSequentially("X");
  await field.press("ControlOrMeta+z");
  assert.equal(await field.inputValue(), "Plan");
  await page.getByRole("img", { name: "Rectangle A", exact: true }).waitFor();
});

test("deletes a diagram after a confirmation, then opens the first remaining one, or shows the empty state", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Kept");
  await newDiagram(opened, "Removed");

  await sidebar(page).getByRole("button", { name: "Delete Removed" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this diagram?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await sidebar(page).getByRole("button", { name: "Removed", exact: true }).waitFor();

  await sidebar(page).getByRole("button", { name: "Delete Removed" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await stored(host, (index) => index.every((entry) => entry.title !== "Removed"));
  assert.equal(await sidebar(page).getByRole("button", { name: "Removed", exact: true }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "Diagram title" }).inputValue(), "Kept");

  await sidebar(page).getByRole("button", { name: "Delete Kept" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await page.getByText("Select or create a diagram").waitFor();
  await sidebar(page).getByText("No diagrams").waitFor();
});

test("an empty title becomes Untitled", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Draft");
  const field = page.getByRole("textbox", { name: "Diagram title" });
  await field.fill("  ");
  await field.press("Enter");
  await sidebar(page).getByRole("button", { name: "Untitled", exact: true }).waitFor();
  assert.equal(await field.inputValue(), "Untitled");
});

test("tells the User when a change cannot be saved, and keeps it on screen", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Full");
  host.refuseWrites({ code: "quota_exceeded" });
  await tool(page, "Rectangle (R)");
  const point = await at(page, 0, 0);
  await page.mouse.dblclick(point.x, point.y);
  await page.getByRole("textbox", { name: "Text of the shape" }).fill("Kept");
  await page.getByRole("textbox", { name: "Text of the shape" }).press("Enter");
  await page.getByRole("alert").getByText(/Your last change could not be saved: the storage of the Diagram Module is full/).waitFor();
  await page.getByRole("status").getByText("Save failed").waitFor();
  await page.getByRole("img", { name: "Rectangle Kept", exact: true }).waitFor();
  assert.equal((await storedDiagram(host)).shapes.length, 0);
});
