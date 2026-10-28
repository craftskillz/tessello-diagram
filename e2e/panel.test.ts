// The panel of the selection slides out to the right when nothing is selected, giving the canvas its room, and comes back
// with the next selection, without touching the diagram.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { newDiagram, newShape } from "../src/lib/diagram.ts";
import { canvas, clickAt, diagramHost, isSelected, openView, PANEL_WIDTH, storedDiagram, useBrowser } from "./diagram.ts";

useBrowser();

test("shows the panel only while something is selected, the canvas taking its width back when it leaves", async () => {
  const diagram = newDiagram("plan", "Plan", 1);
  diagram.shapes.push({ ...newShape("a", { x: 0, y: 0 }, 0), text: "A" });
  diagram.shapes.push({ ...newShape("b", { x: 300, y: 0 }, 1), text: "B" });
  const host = diagramHost();
  await host.storage.set(`diagram:${diagram.id}`, diagram as never);
  await host.storage.set("diagrams", [{ id: diagram.id, title: diagram.title, updatedAt: diagram.updatedAt }]);
  const { page } = await openView({ host, params: { id: diagram.id } });
  const panels = page.getByRole("complementary");
  const stored = await storedDiagram(host, diagram.id);
  await canvas(page).waitFor();
  assert.equal(await panels.count(), 0);
  const width = (await canvas(page).boundingBox())!.width;
  const zoom = await page.getByRole("group", { name: "Zoom" }).locator("output").textContent();

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await page.getByRole("complementary", { name: "Shape style" }).waitFor();
  await until(async () => Math.abs((await canvas(page).boundingBox())!.width - (width - PANEL_WIDTH)) < 1, "the panel to take its width from the canvas");

  // A change of selection keeps the panel where it is.
  await page.getByRole("img", { name: "Rectangle B", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await until(() => isSelected(page, "Rectangle B"), "the second shape to be selected");
  assert.equal(await panels.count(), 1);
  await page.keyboard.press("Escape");
  await until(async () => (await panels.count()) === 0, "the panel to leave");
  await until(async () => Math.abs((await canvas(page).boundingBox())!.width - width) < 1, "the canvas to take its width back");

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await until(() => isSelected(page, "Rectangle A"), "the shape to be selected");
  await clickAt(page, 150, 200);
  await until(async () => (await panels.count()) === 0, "a click on an empty spot to close the panel");

  assert.equal(await page.getByRole("group", { name: "Zoom" }).locator("output").textContent(), zoom);
  assert.deepEqual(await storedDiagram(host, diagram.id), stored);
});
