// Pulling an arrow from the connection handles of a shape: hover, the four sides, zoom and pan, abandoned gestures,
// custom anchors, and what turns the handles off.

import assert from "node:assert/strict";
import { test } from "node:test";
import { addRectangle, arrowEnds, at, canvas, clickAt, drag, editStored, isSelected, middleOf, near, newDiagram, openView, reload, saved, storedDiagram, storedIndex, tool, useBrowser } from "./diagram.ts";

useBrowser();

test("a visible connection handle stays reachable over a nearby shape, while ordinary hover finds the frontmost shape", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Nearby shapes");
  await addRectangle(opened, 0, 0, "A");
  await addRectangle(opened, 121, 0, "B");
  await tool(page, "Select (S)");
  await page.keyboard.press("Escape");
  const origin = await at(page, 0, 0);
  await page.mouse.move(origin.x, origin.y);
  const handle = page.getByRole("button", { name: "Draw arrow from right" });
  const from = await middleOf(handle);
  // The gap to A's handle and the handle itself overlap B's outline.
  await page.mouse.move(origin.x + 62, origin.y);
  near(await middleOf(handle), from);
  await page.mouse.move(from.x, from.y, { steps: 8 });
  near(await middleOf(handle), from);
  await saved(host, async () => drag(page, from, await at(page, 270, 100)));
  const data = await storedDiagram(host);
  assert.deepEqual(data.arrows[0].from, { shapeId: data.shapes[0].id, port: "E" });
  await editStored(page, host, (diagram) => {
    Object.assign(diagram.shapes[1], { x: 40 });
    diagram.arrows = [];
  });
  await tool(page, "Select (S)");
  await page.mouse.move(origin.x - 30, origin.y);
  await page.mouse.move(origin.x + 55, origin.y);
  near(await middleOf(handle), await at(page, 114, 0));
});

test("pulls a connection from a hovered shape while keeping Select, persists it and undoes it as one change", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Pull connections");
  await addRectangle(opened, -180, 0, "Source");
  await addRectangle(opened, 180, 0, "Target");
  await tool(page, "Select (S)");
  await page.keyboard.press("Escape");
  const source = await at(page, -180, 0);
  await page.mouse.move(source.x, source.y);
  const handle = page.getByRole("button", { name: "Draw arrow from right" });
  await handle.waitFor();
  // Crossing the gap preserves hover; leaving the source and its handles hides them.
  await page.mouse.move(source.x + 66, source.y);
  assert.equal(await handle.count(), 1);
  await page.mouse.move(source.x, source.y - 100);
  assert.equal(await handle.count(), 0);
  await page.mouse.move(source.x, source.y);
  await saved(host, async () => drag(page, await middleOf(handle), await at(page, 120, 0)));
  let data = await storedDiagram(host);
  assert.equal(data.arrows.length, 1);
  assert.deepEqual(data.arrows[0].from, { shapeId: data.shapes[0].id, port: "E" });
  assert.deepEqual(data.arrows[0].to, { shapeId: data.shapes[1].id, port: "W" });
  assert.equal(data.shapes[0].x, -180);
  assert.equal(await page.getByRole("button", { name: "Select (S)" }).getAttribute("aria-pressed"), "true");
  assert.ok(await isSelected(page, "Arrow from Rectangle Source at E to Rectangle Target at W"));
  const target = await middleOf(page.getByRole("img", { name: "Rectangle Target", exact: true }));
  const nextHandle = await middleOf(handle);
  assert.ok(nextHandle.x > target.x, "after release, hover belongs to the target under the pointer");
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal((await storedDiagram(host)).arrows.length, 0);
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  await reload(page);
  await page.getByRole("img", { name: "Arrow from Rectangle Source at E to Rectangle Target at W" }).waitFor();
  data = await storedDiagram(host);
  assert.equal(data.arrows.length, 1);
  assert.equal(data.arrows[0].from.port, "E");
});

test("connection handles cover all four sides, use current defaults and stay the same screen size after zoom and pan", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Directions");
  await addRectangle(opened, 0, 0, "Source");
  await tool(page, "Select (S)");
  await page.getByRole("button", { name: "Defaults", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Diagram defaults" });
  await dialog.getByRole("combobox", { name: "Route", exact: true }).selectOption("elbow");
  await dialog.getByRole("combobox", { name: "Line style", exact: true }).selectOption({ label: "Dashed" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  for (const [side, port, x, y] of [["top", "N", -120, -120], ["right", "E", 170, 90], ["bottom", "S", 120, 130], ["left", "W", -180, 70]] as const) {
    const source = await middleOf(page.getByRole("img", { name: "Rectangle Source", exact: true }));
    await page.mouse.move(source.x, source.y);
    const from = await middleOf(page.getByRole("button", { name: `Draw arrow from ${side}` }));
    await saved(host, () => drag(page, from, { x: source.x + x, y: source.y + y }));
    const arrow = (await storedDiagram(host)).arrows.at(-1)!;
    assert.equal(arrow.from.port, port);
    assert.equal(arrow.to.shapeId, undefined);
    assert.equal(arrow.route, "elbow");
    assert.equal(arrow.dashed, true);
  }
  await editStored(page, host, (diagram) => { Object.assign(diagram.shapes[0], { rotation: 90 }); diagram.arrows = []; });
  await tool(page, "Select (S)");
  const zoom = page.getByRole("group", { name: "Zoom" });
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  const center = await middleOf(canvas(page));
  await page.mouse.move(center.x + 190, center.y + 150);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(center.x + 230, center.y + 170);
  await page.mouse.up({ button: "middle" });
  const source = await middleOf(page.getByRole("img", { name: "Rectangle Source", exact: true }));
  await page.mouse.move(source.x, source.y);
  const handle = page.getByRole("button", { name: "Draw arrow from top" });
  const box = (await handle.boundingBox())!;
  assert.ok(Math.abs(box.width - 18) < 1 && Math.abs(box.height - 18) < 1);
  const from = await middleOf(handle);
  assert.ok(from.x > source.x + 40, "local north rotates to the right");
  await saved(host, () => drag(page, from, { x: from.x + 120, y: from.y + 60 }));
  assert.equal((await storedDiagram(host)).arrows[0].from.port, "N");
  for (const [delta, percent] of [[10000, "10%"], [-10000, "400%"]] as const) {
    let source = await middleOf(page.getByRole("img", { name: "Rectangle Source", exact: true }));
    await page.mouse.move(source.x, source.y);
    await page.keyboard.down("ControlOrMeta");
    await page.mouse.wheel(0, delta);
    await page.keyboard.up("ControlOrMeta");
    await zoom.getByText(percent, { exact: true }).waitFor();
    source = await middleOf(page.getByRole("img", { name: "Rectangle Source", exact: true }));
    await page.mouse.move(source.x, source.y);
    const handle = page.getByRole("button", { name: "Draw arrow from right" });
    const box = (await handle.boundingBox())!;
    assert.ok(Math.abs(box.width - 18) < 1 && Math.abs(box.height - 18) < 1);
    const from = await middleOf(handle);
    await saved(host, () => drag(page, from, { x: from.x + 100, y: from.y + 65 }));
    assert.equal((await storedDiagram(host)).arrows.at(-1)!.from.port, "E");
  }
});

test("abandoned connection gestures change neither selection nor storage, and the next pull still works", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Abandon");
  await addRectangle(opened, 0, 0, "Source");
  await tool(page, "Select (S)");
  for (const abandon of ["click", "small", "return", "escape", "cancel"] as const) {
    await clickAt(page, 0, 0);
    const before = await storedIndex(host);
    const from = await middleOf(page.getByRole("button", { name: "Draw arrow from right" }));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    if (abandon === "small") await page.mouse.move(from.x + 2, from.y);
    if (["return", "escape", "cancel"].includes(abandon)) await page.mouse.move(from.x + 100, from.y + 70);
    if (abandon === "return") await page.mouse.move(from.x + 1, from.y);
    if (abandon === "escape") await page.keyboard.press("Escape");
    if (abandon === "cancel") await canvas(page).dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    assert.equal(await page.locator(".dg-arrow-preview").count(), 0);
    assert.equal((await storedDiagram(host)).arrows.length, 0);
    assert.deepEqual(await storedIndex(host), before);
    assert.ok(await isSelected(page, "Rectangle Source"));
    // After each abandonment, create a new arrow, then undo that single change.
    const again = await middleOf(page.getByRole("button", { name: "Draw arrow from bottom" }));
    await saved(host, () => drag(page, again, { x: again.x + 100, y: again.y + 60 }));
    await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
    assert.equal((await storedDiagram(host)).arrows.length, 0);
  }
});

test("pulls from real custom anchors on a rotated resized shape, then falls back when anchors or the definition disappear", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Custom pulls");
  await addRectangle(opened, 0, 0, "Source");
  const definition = { id: "gateway", name: "Gateway", imageKey: "image:missing", width: 200, height: 80, labelPlacement: "center", showInDiagram: true,
    anchors: [{ id: "inlet", x: 0.2, y: 0.1 }, { id: "outlet", x: 0.9, y: 0.7 }] };
  const libraries = [{ id: "platform", name: "Platform", shapes: [definition] }];
  await host.storage.set("shapes", libraries as never);
  await editStored(page, host, (diagram) => {
    Object.assign(diagram.shapes[0], { type: "custom", w: 200, h: 80, rotation: 90,
      customShapeRef: { libraryId: "platform", shapeId: "gateway", name: "Gateway" }, labelPlacement: "center" });
  });
  await tool(page, "Select (S)");
  await clickAt(page, 0, 0);
  const from = await middleOf(page.getByRole("button", { name: "Draw arrow from right" }));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const to = await at(page, 220, -100);
  await page.mouse.move(to.x, to.y);
  const preview = page.locator(".dg-arrow-preview");
  await preview.waitFor();
  const [x, y] = (await preview.getAttribute("d"))!.slice(1).split(/[ ,LC]/).map(Number);
  near({ x, y }, { x: -16, y: 80 });
  await saved(host, () => page.mouse.up());
  const shapeId = (await storedDiagram(host)).shapes[0].id;
  assert.deepEqual((await storedDiagram(host)).arrows[0].from, { shapeId, port: "outlet" });
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.equal((await storedDiagram(host)).arrows.length, 0);
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  await reload(page);
  const name = "Arrow from Custom shape Source at outlet to (220, -100)";
  near((await arrowEnds(page, name)).start, { x: -16, y: 80 });
  definition.anchors = [];
  await host.storage.set("shapes", libraries as never);
  await reload(page);
  near((await arrowEnds(page, name)).start, { x: 40, y: -18.18 });
  for (const missingDefinition of [false, true]) {
    if (missingDefinition) {
      libraries[0].shapes = [];
      await host.storage.set("shapes", libraries as never);
      await reload(page);
    }
    await tool(page, "Select (S)");
    await clickAt(page, 0, 0);
    const handle = await middleOf(page.getByRole("button", { name: "Draw arrow from bottom" }));
    await saved(host, async () => drag(page, handle, await at(page, -220, 130)));
    assert.deepEqual((await storedDiagram(host)).arrows.at(-1)!.from, { shapeId, port: null });
  }
  await reload(page);
  assert.deepEqual((await storedDiagram(host)).arrows.map((arrow) => arrow.from.port), ["outlet", null, null]);
});

test("connection discovery respects tools, text editing, locks, groups and panning priority", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Priorities");
  await addRectangle(opened, -150, 0, "A");
  await addRectangle(opened, 150, 0, "B");
  assert.equal(await page.locator(".dg-connect").count(), 0);
  await tool(page, "Select (S)");
  await clickAt(page, -150, 0);
  assert.equal(await page.locator(".dg-connect").count(), 4);
  await page.keyboard.down("ControlOrMeta");
  await clickAt(page, 150, 0);
  await page.keyboard.up("ControlOrMeta");
  assert.equal(await page.locator(".dg-connect").count(), 0);
  await saved(host, () => page.getByRole("button", { name: "Group selection", exact: true }).click());
  assert.equal(await page.locator(".dg-connect").count(), 0);
  await page.keyboard.down("Alt");
  await clickAt(page, -150, 0);
  await page.keyboard.up("Alt");
  assert.equal(await page.locator(".dg-connect").count(), 4);
  const handle = await middleOf(page.getByRole("button", { name: "Draw arrow from right" }));
  await page.keyboard.down("Space");
  await drag(page, handle, { x: handle.x + 45, y: handle.y + 25 });
  await page.keyboard.up("Space");
  assert.equal((await storedDiagram(host)).arrows.length, 0);
  assert.equal((await storedDiagram(host)).shapes[0].x, -150);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  assert.equal(await page.locator(".dg-connect").count(), 0);
  await page.getByRole("textbox", { name: "Text of the shape" }).press("Escape");
  await saved(host, () => page.getByRole("button", { name: "Lock", exact: true }).click());
  assert.equal(await page.locator(".dg-connect").count(), 0);
});

