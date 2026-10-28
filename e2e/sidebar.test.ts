// The burger button hides the list of diagrams to give the canvas its room, and shows it again, without touching the diagram.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { until } from "@tessello/sdk/testing";
import { newDiagram, newShape } from "../src/lib/diagram.ts";
import { canvas, diagramHost, isSelected, openView, panelSlidIn, sidebar, storedDiagram, useBrowser } from "./diagram.ts";

useBrowser();

const hide = (page: Page) => page.getByRole("button", { name: "Hide diagrams" });
const show = (page: Page) => page.getByRole("button", { name: "Show diagrams" });
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));

test("hides the list and shows it again, keeping the focus, the view and the diagram as they were", async () => {
  const diagram = newDiagram("plan", "Plan", 1);
  diagram.shapes.push({ ...newShape("a", { x: 0, y: 0 }, 0), text: "A" });
  const host = diagramHost();
  await host.storage.set(`diagram:${diagram.id}`, diagram as never);
  await host.storage.set("diagrams", [{ id: diagram.id, title: diagram.title, updatedAt: diagram.updatedAt }]);
  const { page } = await openView({ host, params: { id: diagram.id } });
  const zoom = page.getByRole("group", { name: "Zoom" });
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByText("125%").waitFor();
  await page.getByRole("img", { name: "Rectangle A", exact: true }).click();
  await until(() => isSelected(page, "Rectangle A"), "the shape to be selected");
  await panelSlidIn(page);
  const width = (await canvas(page).boundingBox())!.width;
  const stored = await storedDiagram(host, diagram.id);

  assert.equal(await hide(page).getAttribute("aria-expanded"), "true");
  assert.equal(await hide(page).getAttribute("aria-controls"), await sidebar(page).getAttribute("id"));
  await hide(page).click();
  await until(async () => (await canvas(page).boundingBox())!.width > width + 100, "the canvas to take the room of the list");
  assert.equal(await sidebar(page).isVisible(), false);
  assert.equal(await show(page).getAttribute("aria-expanded"), "false");
  await until(async () => (await focused(page)) === "Show diagrams", "the focus to stay on the toggle");

  await show(page).click();
  await sidebar(page).waitFor();
  await until(async () => Math.abs((await canvas(page).boundingBox())!.width - width) < 1, "the canvas to return to its width");
  await until(async () => (await focused(page)) === "Hide diagrams", "the focus to stay on the toggle");
  assert.equal(await zoom.locator("output").textContent(), "125%");
  assert.ok(await isSelected(page, "Rectangle A"));
  assert.deepEqual(await storedDiagram(host, diagram.id), stored);
});

test("offers the toggle both ways when no diagram is open", async () => {
  const { page } = await openView();
  await page.getByText("Select or create a diagram").waitFor();
  await hide(page).click();
  await show(page).waitFor();
  assert.equal(await sidebar(page).isVisible(), false);
  await page.getByText("Select or create a diagram").waitFor();
  await show(page).click();
  await sidebar(page).waitFor();
  await hide(page).waitFor();
});
