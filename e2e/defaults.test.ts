// The creation defaults: set in their dialog, or saved from the selection.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type TestHost, until } from "@tessello/sdk/testing";
import { addRectangle, addShape, at, drag, newDiagram, openView, reload, saved, storedDiagram, tool, useBrowser } from "./diagram.ts";

useBrowser();

type StoredDefaults = { arrows: { dashed: boolean }; shapes: Record<string, { color: string }> };
const storedDefaults = async (host: TestHost) => (await host.storage.get("defaults")) as StoredDefaults | null;

test("new rectangles take the default color set in Diagram defaults, after a reload too; a size out of bounds is refused, and existing shapes are unchanged", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Styles");
  await addRectangle(opened, -200, 0, "Before");

  await page.getByRole("button", { name: "Defaults" }).click();
  const dialog = page.getByRole("dialog", { name: "Diagram defaults" });
  await dialog.getByRole("combobox", { name: "Rectangle · Color" }).selectOption({ label: "Blue" });
  const width = dialog.getByRole("spinbutton", { name: "Rectangle · Width" });
  await width.fill("5");
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.getByRole("alert").getByText("Correct the values out of their bounds before saving.").waitFor();
  assert.equal(await width.getAttribute("aria-invalid"), "true");
  await width.fill("200");
  assert.equal(await width.getAttribute("aria-invalid"), "false");
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.waitFor({ state: "detached" });
  await until(async () => (await storedDefaults(host))?.shapes.rect.color === "c-blue", "the defaults to be written");
  await addRectangle(opened, 200, 0, "After");

  await reload(page);
  await page.getByRole("img", { name: "Rectangle After", exact: true }).waitFor();
  await addRectangle(opened, 0, 200, "Again");
  const [before, after, again] = (await storedDiagram(host)).shapes;
  assert.deepEqual([before.color, before.w], ["c-gray", 120]);
  assert.deepEqual([after.color, after.w, after.h], ["c-blue", 200, 60]);
  assert.deepEqual([again.color, again.w], ["c-blue", 200]);
});

test("Save as default for this shape type, and for arrows, make the style of the selection that of the next ones", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "From selection");
  await addShape(opened, "Ellipse (E)", -200, 0, "Source");
  await saved(host, () => page.getByRole("button", { name: "Green", exact: true }).click());
  await page.getByRole("button", { name: "Save as default for this shape type" }).click();
  await page.getByRole("status").getByText("Saved: new Ellipse shapes take this style.").waitFor();
  await until(async () => (await storedDefaults(host))?.shapes.ellipse.color === "c-green", "the defaults to be written");

  await addShape(opened, "Ellipse (E)", 200, 0, "Next");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, -200, 0), await at(page, 200, 0)));
  await saved(host, () => page.getByRole("button", { name: "Dashed" }).click());
  await page.getByRole("button", { name: "Save as default for arrows" }).click();
  await until(async () => (await storedDefaults(host))?.arrows.dashed === true, "the defaults to be written");
  await saved(host, async () => drag(page, await at(page, -200, 100), await at(page, 200, 100)));

  const diagram = await storedDiagram(host);
  assert.equal(diagram.shapes[1].color, "c-green");
  assert.deepEqual(diagram.arrows.map((arrow) => arrow.dashed), [true, true]);
});
