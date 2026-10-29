// The panel of the selection slides out to the right when nothing is selected, giving the canvas its room, and comes back
// with the next selection, without touching the diagram. A rectangle's panel also sets the rounding of its corners.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { newDiagram, newShape } from "../src/lib/diagram.ts";
import { canvas, clickAt, diagramHost, isSelected, openView, PANEL_WIDTH, saved, storedDiagram, useBrowser } from "./diagram.ts";

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

test("sets the corner radius of a rectangle, bounded by half its smallest side, and offers it for rectangles only", async () => {
  const diagram = newDiagram("plan", "Plan", 1);
  diagram.shapes.push({ ...newShape("a", { x: 0, y: 0 }, 0), text: "A" });
  diagram.shapes.push({ ...newShape("b", { x: 300, y: 0 }, 1, "ellipse"), text: "B" });
  const host = diagramHost();
  await host.storage.set(`diagram:${diagram.id}`, diagram as never);
  await host.storage.set("diagrams", [{ id: diagram.id, title: diagram.title, updatedAt: diagram.updatedAt }]);
  const { page } = await openView({ host, params: { id: diagram.id } });
  const radius = page.getByRole("spinbutton", { name: "Corner radius" });
  const body = page.getByRole("img", { name: "Rectangle A", exact: true }).locator(".dg-body");

  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await radius.waitFor();
  assert.equal(await radius.inputValue(), "6");
  assert.equal(await body.getAttribute("rx"), "6");

  await saved(host, () => radius.fill("0").then(() => radius.press("Tab")));
  assert.equal((await storedDiagram(host, diagram.id)).shapes[0].cornerRadius, 0);
  assert.equal(await body.getAttribute("rx"), "0");

  // The rectangle is 120 × 60: half its smallest side is 30.
  await saved(host, () => radius.fill("500").then(() => radius.press("Tab")));
  assert.equal((await storedDiagram(host, diagram.id)).shapes[0].cornerRadius, 30);
  assert.equal(await radius.inputValue(), "30");
  assert.equal(await body.getAttribute("rx"), "30");

  // An ellipse, alone or with a rectangle, has no corners to round.
  await page.getByRole("img", { name: "Ellipse B", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await until(() => isSelected(page, "Ellipse B"), "the ellipse to be selected");
  assert.equal(await radius.count(), 0);
  await page.getByRole("img", { name: "Ellipse B", exact: true }).click();
  assert.equal(await radius.count(), 0);
});
