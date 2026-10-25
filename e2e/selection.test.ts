// Selection: groups, locks, copy and paste of shapes and of a style, the grid, the guides and the zoom.

import assert from "node:assert/strict";
import { test } from "node:test";
import { addRectangle, addShape, at, clickAt, drag, dragHandle, isSelected, near, newDiagram, openView, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

useBrowser();

test("a group is selected by a click on a member, moves as one block, and Alt+click selects a member alone", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Groups");
  await addRectangle(opened, -100, 0, "A");
  await addRectangle(opened, 100, 0, "B");
  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await page.getByRole("img", { name: "Rectangle B", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await saved(host, () => page.getByRole("button", { name: "Group selection" }).click());

  await clickAt(page, 0, 200);
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  assert.ok(await isSelected(page, "Rectangle B"));
  assert.equal(await page.locator(".dg-group-outline").count(), 1);

  // The grid takes the center of A to (−100, 100).
  await saved(host, async () => drag(page, await at(page, -100, 0), await at(page, -97, 103)));
  const [a, b] = (await storedDiagram(host)).shapes;
  assert.deepEqual([a.x, a.y, b.x, b.y], [-100, 100, 100, 100]);
  assert.ok(a.groupId && a.groupId === b.groupId);

  await page.getByRole("img", { name: "Rectangle B", exact: true }).click({ modifiers: ["Alt"] });
  assert.ok(await isSelected(page, "Rectangle B"));
  assert.ok(!(await isSelected(page, "Rectangle A")));

  await saved(host, () => page.getByRole("button", { name: "Ungroup" }).click());
  assert.deepEqual((await storedDiagram(host)).shapes.map((shape) => shape.groupId), [null, null]);
});

test("a locked shape is selected with a padlock, but neither moved, deleted nor taken by Ctrl+A, until it is unlocked", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Locks");
  await addRectangle(opened, 0, 0, "A");
  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await saved(host, () => page.getByRole("button", { name: "Lock", exact: true }).click());
  const panel = page.getByRole("complementary", { name: "Locked" });
  await panel.getByRole("button", { name: "Unlock" }).waitFor();
  assert.equal(await panel.getByRole("button").count(), 1);
  await page.getByRole("img", { name: "Locked" }).waitFor();

  await page.keyboard.press("Delete");
  await drag(page, await at(page, 0, 0), await at(page, 200, 100));
  await clickAt(page, 0, 200);
  await page.keyboard.press("ControlOrMeta+a");
  assert.ok(!(await isSelected(page, "Rectangle A")));
  // A point of the page may be half a pixel off the drawing.
  const [shape] = (await storedDiagram(host)).shapes;
  near({ x: shape.x, y: shape.y }, { x: 0, y: 0 });
  assert.equal(shape.locked, true);

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await saved(host, () => panel.getByRole("button", { name: "Unlock" }).click());
  await saved(host, () => page.keyboard.press("Delete"));
  assert.equal((await storedDiagram(host)).shapes.length, 0);
});

test("copies a group joined by an arrow and pastes it twice, 40 further each time, as new groups", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Copies");
  await addRectangle(opened, -100, 0, "A");
  await addRectangle(opened, 100, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -100, 0), await at(page, 100, 0)));
  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await page.getByRole("img", { name: "Rectangle B", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await saved(host, () => page.getByRole("button", { name: "Group selection" }).click());

  await page.keyboard.press("ControlOrMeta+c");
  await saved(host, () => page.keyboard.press("ControlOrMeta+v"));
  await saved(host, () => page.keyboard.press("ControlOrMeta+v"));
  const { shapes, arrows } = await storedDiagram(host);
  // A point of the page may be half a pixel off the drawing: each copy lands exactly 40 further than the last.
  assert.deepEqual(shapes.map((shape) => shape.text), ["A", "B", "A", "B", "A", "B"]);
  near({ x: shapes[0].x, y: shapes[0].y }, { x: -100, y: 0 });
  for (let index = 2; index < 6; index++) assert.deepEqual([shapes[index].x, shapes[index].y], [shapes[index - 2].x + 40, shapes[index - 2].y + 40]);
  const groups = shapes.map((shape) => shape.groupId);
  assert.equal(new Set(groups).size, 3);
  assert.deepEqual([groups[2] === groups[3], groups[4] === groups[5]], [true, true]);
  assert.equal(arrows.length, 3);
  assert.deepEqual([arrows[1].from.shapeId, arrows[1].to.shapeId], [shapes[2].id, shapes[3].id]);
  // The last paste is selected.
  assert.equal(await page.locator(".dg-shape.selected").count(), 2);
});

test("copies the style of a shape onto another, with its size when asked", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Styles");
  await addRectangle(opened, -100, 0, "A");
  await saved(host, () => page.getByRole("button", { name: "Blue" }).click());
  await addShape(opened, "Ellipse (E)", 100, 0, "B");
  await tool(page, "Select (S)");

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await dragHandle(page, "Resize from the bottom-right corner", 40, 20);
  await page.getByRole("button", { name: "Copy style" }).click();
  await page.getByRole("img", { name: "Ellipse B", exact: true }).click();
  await saved(host, () => page.getByRole("button", { name: "Paste style" }).click());
  let b = (await storedDiagram(host)).shapes[1];
  assert.deepEqual([b.color, b.w, b.h], ["c-blue", 120, 60]);

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await page.getByRole("checkbox", { name: "with size" }).check();
  // The shortcuts are those of the canvas, not of the checkbox.
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+Alt+c");
  await page.getByRole("img", { name: "Ellipse B", exact: true }).click();
  await saved(host, () => page.keyboard.press("ControlOrMeta+Alt+v"));
  b = (await storedDiagram(host)).shapes[1];
  assert.deepEqual([b.color, b.w, b.h], ["c-blue", 160, 80]);
});

test("the grid and the guides are saved with the diagram, and the zoom fits the drawing", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "View");
  await addRectangle(opened, 0, 0, "A");
  await tool(page, "Select (S)");
  assert.equal(await page.getByRole("button", { name: "Grid (G)" }).getAttribute("aria-pressed"), "true");
  await clickAt(page, 0, 200);
  await saved(host, () => page.keyboard.press("g"));
  await saved(host, () => page.getByRole("button", { name: "Guides" }).click());
  const { grid, guides } = (await storedDiagram(host)) as unknown as { grid: boolean; guides: boolean };
  assert.deepEqual([grid, guides], [false, false]);

  const zoom = page.getByRole("group", { name: "Zoom" });
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByText("125%").waitFor();
  await zoom.getByRole("button", { name: "Zoom out" }).click();
  await zoom.getByRole("button", { name: "Zoom out" }).click();
  await zoom.getByText("80%").waitFor();
  // A single rectangle is shown at its real size, in the middle of the canvas.
  await zoom.getByRole("button", { name: "Fit" }).click();
  await zoom.getByText("100%").waitFor();
});
