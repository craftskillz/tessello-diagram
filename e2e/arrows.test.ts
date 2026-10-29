// Arrows: labels of parallel arrows, curved and elbow routes, style and label, free arrows, ports, and deleting what they join.

import assert from "node:assert/strict";
import { test } from "node:test";
import { addRectangle, arrowEnds, at, clickAt, drag, dragHandle, editStored, isSelected, middleOf, near, newDiagram, openView, pointOn, reload, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

useBrowser();

test("three arrows A→B, A→B and B→A are all visible with their labels, and each is selected by a click on its own line", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Parallel");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 0, "B");
  await tool(page, "Arrow (F)");
  for (const [from, to] of [[-200, 200], [-200, 200], [200, -200]]) await saved(host, async () => drag(page, await at(page, from, 0), await at(page, to, 0)));
  await editStored(page, host, (diagram) => diagram.arrows.forEach((arrow, index) => (arrow.label = ["one", "two", "back"][index])));

  const names = ["Arrow “one” from Rectangle A to Rectangle B", "Arrow “two” from Rectangle A to Rectangle B", "Arrow “back” from Rectangle B to Rectangle A"];
  await page.getByRole("img", { name: names[0], exact: true }).waitFor();
  // Each label shows, apart from the others.
  const labels = await Promise.all(["one", "two", "back"].map((label) => page.getByText(label, { exact: true }).boundingBox()));
  for (const [index, box] of labels.entries()) {
    for (const other of labels.slice(index + 1)) assert.ok(box!.y + box!.height <= other!.y || other!.y + other!.height <= box!.y, "two labels overlap");
  }
  for (const name of names) {
    const middle = await pointOn(page, name, 0.5);
    await page.mouse.click(middle.x, middle.y);
    for (const other of names) assert.equal(await isSelected(page, other), other === name, `after a click on ${name}`);
  }
});

test("a curved arrow between the north ports of two shapes is selected by a click anywhere on its visible line", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Curve");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 200, "B");
  // The rectangles are 120 × 60: their north ports are the middles of their top sides.
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, -30), await at(page, 200, 170)));
  const [arrow] = (await storedDiagram(host)).arrows;
  assert.deepEqual([arrow.from, arrow.to], [{ shapeId: arrow.from.shapeId, port: "N" }, { shapeId: arrow.to.shapeId, port: "N" }]);
  // The new arrow is selected: its panel sets its route.
  await saved(host, () => page.getByRole("button", { name: "Curved" }).click());
  assert.equal((await storedDiagram(host)).arrows[0].route, "curved");

  const name = "Arrow from Rectangle A at N to Rectangle B at N";
  await tool(page, "Select (S)");
  for (const part of [0.1, 0.5, 0.9]) {
    await clickAt(page, 0, 300);
    assert.equal(await isSelected(page, name), false);
    const point = await pointOn(page, name, part);
    await page.mouse.click(point.x, point.y);
    assert.equal(await isSelected(page, name), true, `a click at ${part} of the line`);
  }
});

test("an elbow made by a drag is found after a reload, keeps its waypoints when its shape moves, and is selected by a click on its last segment", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Corners");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 200, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 200)));
  const name = "Arrow from Rectangle A to Rectangle B";
  await tool(page, "Select (S)");
  const middle = await pointOn(page, name, 0.5);
  await page.mouse.click(middle.x, middle.y);
  await saved(host, () => page.getByRole("button", { name: "Elbow" }).click());
  // Out of the right side of A, down halfway, and into the left side of B: the middle segment is at x = 0.
  near((await arrowEnds(page, name)).start, { x: -140, y: 0 });
  near((await arrowEnds(page, name)).tip, { x: 140, y: 200 });

  // Dragging the middle segment 60 to the right makes its two corners the waypoints of the arrow.
  await saved(host, async () => drag(page, await at(page, 0, 100), await at(page, 60, 100)));
  const corners = (await storedDiagram(host)).arrows[0].waypoints;
  assert.equal(corners.length, 2);
  near(corners[0], { x: 60, y: 0 });
  near(corners[1], { x: 60, y: 200 });

  await reload(page);
  await page.getByRole("img", { name, exact: true }).waitFor();
  assert.deepEqual((await storedDiagram(host)).arrows[0].waypoints, corners);
  near((await arrowEnds(page, name)).start, { x: -140, y: 0 });

  // B moves down: the waypoints stay, and the last segments follow it, down from the second corner into its top side.
  await saved(host, async () => drag(page, await at(page, 200, 200), await at(page, 200, 300)));
  assert.deepEqual((await storedDiagram(host)).arrows[0].waypoints, corners);
  near((await arrowEnds(page, name)).tip, { x: 200, y: 270 });

  await clickAt(page, 0, -200);
  assert.equal(await isSelected(page, name), false);
  await clickAt(page, 200, 225);
  assert.equal(await isSelected(page, name), true);
});

test("a double-click on a waypoint of the selected arrow removes it, one undo brings it back, and elsewhere on the line it edits the label", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Waypoints");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));
  await tool(page, "Select (S)");
  await clickAt(page, 0, 0);
  // Two waypoints: the first by the handle in the middle of the line, the second by that of its first segment.
  await saved(host, async () => drag(page, await at(page, 0, 0), await at(page, 0, -80)));
  const handle = await middleOf(page.getByRole("button", { name: "Drag to add a waypoint" }).first());
  await saved(host, () => drag(page, handle, { x: handle.x, y: handle.y - 60 }));
  const waypoints = async () => (await storedDiagram(host)).arrows[0].waypoints;
  const before = await waypoints();
  assert.equal(before.length, 2);
  const editor = page.getByRole("textbox", { name: "Label of the arrow" });

  const [first, second] = before;
  // The pointer shifts by a pixel during the second press, as a hand does: the waypoint does not move before it goes.
  const removed = await at(page, first.x, first.y);
  await saved(host, async () => {
    await page.mouse.click(removed.x, removed.y);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.move(removed.x + 1, removed.y);
    await page.mouse.up({ clickCount: 2 });
  });
  assert.deepEqual(await waypoints(), [second]);
  assert.equal(await editor.count(), 0);

  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await waypoints(), before);

  // Elsewhere on the line, the label is edited and the waypoints stay.
  const aside = await at(page, 100, -40);
  await page.mouse.dblclick(aside.x, aside.y);
  await editor.waitFor();
  assert.deepEqual(await waypoints(), before);
});

test("a double-click on a corner of the selected elbow arrow removes it", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Corner");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 200, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 200)));
  await tool(page, "Select (S)");
  const middle = await pointOn(page, "Arrow from Rectangle A to Rectangle B", 0.5);
  await page.mouse.click(middle.x, middle.y);
  await saved(host, () => page.getByRole("button", { name: "Elbow" }).click());
  await saved(host, async () => drag(page, await at(page, 0, 100), await at(page, 60, 100)));
  const [corner, other] = (await storedDiagram(host)).arrows[0].waypoints;
  const point = await at(page, corner.x, corner.y);
  await saved(host, () => page.mouse.dblclick(point.x, point.y));
  assert.deepEqual((await storedDiagram(host)).arrows[0].waypoints, [other]);
  assert.equal(await page.getByRole("textbox", { name: "Label of the arrow" }).count(), 0);
});

test("a dashed arrow with heads at both ends, 3 wide, with its label dragged along it and aside, is found after a reload", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Styles");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));
  await tool(page, "Select (S)");
  await clickAt(page, 0, 0);
  const panel = page.getByRole("complementary", { name: "Arrow" });
  await saved(host, () => panel.getByRole("button", { name: "Dashed" }).click());
  await saved(host, () => panel.getByRole("button", { name: "Arrowheads at both ends" }).click());
  await panel.getByRole("spinbutton", { name: "Line width" }).fill("3");
  await saved(host, () => panel.getByRole("spinbutton", { name: "Line width" }).press("Enter"));

  // A double-click on the line edits its label, which shows in the middle of the line.
  const point = await at(page, 0, 0);
  await page.mouse.dblclick(point.x, point.y);
  await page.getByRole("textbox", { name: "Label of the arrow" }).fill("calls");
  await saved(host, () => page.getByRole("textbox", { name: "Label of the arrow" }).press("Enter"));
  const name = "Arrow “calls” from Rectangle A to Rectangle B";
  const label = page.getByRole("img", { name, exact: true }).getByRole("button", { name: /^Label:/ });
  near(await middleOf(label), await at(page, 0, 0));

  // The line goes from (−140, 0) to (140, 0): 70 to the right is three quarters of the way, and 30 up is 30 aside. The
  // label is taken by its left part, beside the handle of the segment, which is in the middle of the line.
  const box = (await label.boundingBox())!;
  const from = { x: box.x + 4, y: box.y + box.height / 2 };
  await saved(host, () => drag(page, from, { x: from.x + 70, y: from.y - 30 }));
  const [arrow] = (await storedDiagram(host)).arrows;
  assert.deepEqual({ dashed: arrow.dashed, heads: arrow.heads, width: arrow.width, label: arrow.label }, { dashed: true, heads: "both", width: 3, label: "calls" });
  assert.ok(Math.abs(arrow.labelAt - 0.75) < 0.01 && Math.abs(arrow.labelOffset + 30) < 1, JSON.stringify(arrow));

  await reload(page);
  const drawn = page.getByRole("img", { name, exact: true });
  await drawn.waitFor();
  assert.equal(await drawn.locator(".dg-arrow-head").count(), 2);
  assert.equal(await drawn.locator(".dg-arrow-line").getAttribute("stroke-width"), "3");
  assert.equal(await drawn.locator(".dg-arrow-line").getAttribute("stroke-dasharray"), "12 9");
  near(await middleOf(label), await at(page, 70, -30));

  // A double-click on the label, away from the line, edits it.
  const aside = await middleOf(label);
  await page.mouse.dblclick(aside.x, aside.y);
  assert.equal(await page.getByRole("textbox", { name: "Label of the arrow" }).inputValue(), "calls");
  await page.getByRole("textbox", { name: "Label of the arrow" }).press("Escape");

  // A click on the label selects the arrow, and "Reset label" brings the label back to the middle of the line.
  await page.mouse.click((await middleOf(label)).x, (await middleOf(label)).y);
  assert.equal(await isSelected(page, name), true);
  await saved(host, () => panel.getByRole("button", { name: "Reset label" }).click());
  near(await middleOf(label), await at(page, 0, 0));

  // The handle on the right edge of the label widens it on both sides, around its center.
  const automatic = (await label.boundingBox())!.width;
  await saved(host, () => dragHandle(page, "Drag to change the width of the label", 30, 0));
  assert.ok(Math.abs((await label.boundingBox())!.width - automatic - 60) < 2);
  near(await middleOf(label), await at(page, 0, 0));
});

test("a drag on the empty canvas draws a free arrow, which moves by its body and is taken by a selection rectangle", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Free");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -150, -100), await at(page, 150, -100)));
  await page.getByRole("img", { name: "Arrow from (-150, -100) to (150, -100)" }).waitFor();
  // A click without a drag draws nothing.
  await clickAt(page, 0, 100);
  // With Shift, the arrow turns by steps of 45°: drawn a little below the level, it stays level.
  await page.keyboard.down("Shift");
  await saved(host, async () => drag(page, await at(page, -150, 100), await at(page, 100, 130)));
  await page.keyboard.up("Shift");
  const arrows = (await storedDiagram(host)).arrows;
  assert.equal(arrows.length, 2);
  assert.ok(Math.abs(arrows[1].to.y! - arrows[1].from.y!) < 1e-6, JSON.stringify(arrows[1]));

  await tool(page, "Select (S)");
  await saved(host, async () => drag(page, await at(page, 0, -100), await at(page, 0, -60)));
  await page.getByRole("img", { name: "Arrow from (-150, -60) to (150, -60)" }).waitFor();

  await clickAt(page, 0, 250);
  await drag(page, await at(page, -200, -90), await at(page, 200, -30));
  assert.equal(await isSelected(page, "Arrow from (-150, -60) to (150, -60)"), true);
  // The arrow drawn with Shift is outside the rectangle.
  assert.doesNotMatch((await page.getByRole("img", { name: /^Arrow from \(-150, 100\)/ }).getAttribute("class"))!, /\bselected\b/);
});

test("an end attached to the north-east port follows the shape turned by 90°, until its ends are detached", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Ports");
  await addRectangle(opened, 200, 0, "B");
  // While the arrow is drawn, the shape shows its ports; the north-east one is on the rounded top-right corner, toward
  // (260, −30) from the center: at (257.6, −28.8), the corners having a radius of 6.
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -100, 0), await at(page, 258, -29)));
  const name = "Arrow from (-100, 0) to Rectangle B at NE";
  near((await arrowEnds(page, name)).tip, { x: 257.6, y: -28.8 });

  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle B", exact: true }).click();
  for (let turn = 0; turn < 9; turn++) await saved(host, () => page.getByRole("button", { name: "Rotate right by 10°" }).click());
  // Turned a quarter turn clockwise, the top-right corner of B is at its bottom-right, at (228.8, 57.6).
  near((await arrowEnds(page, name)).tip, { x: 228.8, y: 57.6 });

  const point = await pointOn(page, name, 0.5);
  await page.mouse.click(point.x, point.y);
  await saved(host, () => page.getByRole("button", { name: "Detach ends" }).click());
  assert.deepEqual((await storedDiagram(host)).arrows[0].to.port, null);
  await page.getByRole("img", { name: "Arrow from (-100, 0) to Rectangle B", exact: true }).waitFor();
});

test("deleting a shape frees the ends of its arrows, where they were; Ctrl+Delete deletes its arrows too", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Delete");
  await addRectangle(opened, -200, 0, "A");
  await addRectangle(opened, 200, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));

  await tool(page, "Select (S)");
  await page.getByRole("img", { name: "Rectangle B", exact: true }).click();
  await saved(host, () => page.keyboard.press("Delete"));
  // The end stays where it was drawn, on the left side of B; a point of the page may be half a pixel off the drawing.
  await page.getByRole("img", { name: /^Arrow from Rectangle A to \(140, -?[01]\)$/ }).waitFor();
  near((await storedDiagram(host)).arrows[0].to as { x: number; y: number }, { x: 140, y: 0 });

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await saved(host, () => page.keyboard.press("Control+Delete"));
  assert.equal((await storedDiagram(host)).arrows.length, 0);
  assert.equal(await page.getByRole("img", { name: /^Arrow/ }).count(), 0);
});
