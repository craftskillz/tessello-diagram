// Opening a diagram fits its content; later edits and rereads preserve the User's view.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright";
import { until } from "@tessello/sdk/testing";
import { newArrow, newDiagram, newShape } from "../src/lib/diagram.ts";
import { answered, at, canvas, diagramHost, drag, middleOf, near, opened, openView, openWidget, saved, sidebar, storedDiagram, useBrowser } from "./diagram.ts";

useBrowser();

async function diagrams() {
  const wide = newDiagram("wide", "Wide", 1);
  wide.shapes.push({ ...newShape("rotated", { x: 2400, y: -1000 }, 0), w: 800, h: 200, rotation: 45, text: "Rotated" });
  wide.arrows.push(newArrow("free", { x: -1200, y: -1800 }, { x: -600, y: -300 }, 1));
  const small = newDiagram("small", "Small", 2);
  small.shapes.push({ ...newShape("link", { x: -1500, y: 1800 }, 0), text: "Wide", link: { type: "diagram", value: wide.id } });
  const empty = newDiagram("empty", "Empty", 3);
  const host = diagramHost();
  for (const diagram of [wide, small, empty]) await host.storage.set(`diagram:${diagram.id}`, diagram as never);
  await host.storage.set("diagrams", [wide, small, empty].map(({ id, title, updatedAt }) => ({ id, title, updatedAt })));
  return { host, wide, small, empty };
}

/** Measures the visible outlines, including rotation and the free arrow, in screen pixels. */
async function fitted(page: Page) {
  await until(async () => {
    const viewport = (await canvas(page).boundingBox())!;
    // DOM bounds measure the outlines themselves; Playwright also pads curves for stroke miters.
    const boxes = await canvas(page).locator(".dg-shape .dg-body, .dg-arrow-line, .dg-arrow-head")
      .evaluateAll((outlines) => outlines.map((outline) => {
        const { x, y, width, height } = outline.getBoundingClientRect();
        return { x, y, width, height };
      }));
    if (!boxes.length) return false;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    return left >= viewport.x + 39 && top >= viewport.y + 39
      && right <= viewport.x + viewport.width - 39 && bottom <= viewport.y + viewport.height - 39
      && Math.abs((left + right) / 2 - (viewport.x + viewport.width / 2)) < 1
      && Math.abs((top + bottom) / 2 - (viewport.y + viewport.height / 2)) < 1;
  }, "the whole drawing to be centered with a margin");
}

test("fits a large off-center diagram on opening, switches to a small diagram at 100%, and fits again through a link", async () => {
  const { host, wide, small, empty } = await diagrams();
  const { page } = await openView({ host, params: { id: wide.id } });
  await fitted(page);
  const zoom = page.getByRole("group", { name: "Zoom" });
  assert.ok(parseInt((await zoom.locator("output").textContent())!) < 100);

  await sidebar(page).getByRole("button", { name: "Small", exact: true }).click();
  await opened(page, "Small");
  await fitted(page);
  assert.equal(await zoom.locator("output").textContent(), "100%");
  const shape = (await page.getByRole("img", { name: "Rectangle Wide", exact: true }).locator(".dg-body").boundingBox())!;
  assert.ok(Math.abs(shape.width - 120) < 2);
  assert.ok(Math.abs(shape.height - 60) < 2);

  await page.getByRole("img", { name: "Rectangle Wide", exact: true }).click({ modifiers: ["Shift"] });
  await opened(page, "Wide");
  await fitted(page);

  await sidebar(page).getByRole("button", { name: "Empty", exact: true }).click();
  await opened(page, "Empty");
  assert.equal(await zoom.locator("output").textContent(), "100%");
  near(await at(page, 0, 0), await middleOf(canvas(page)));
  await sidebar(page).getByRole("button", { name: "Wide", exact: true }).click();
  await opened(page, "Wide");
  await fitted(page);
  for (const diagram of [wide, small, empty]) assert.deepEqual(await storedDiagram(host, diagram.id), diagram);
});

test("keeps manual zoom and pan while moving a shape, undoing, rereading the same diagram and resizing the canvas", async () => {
  const { host, small } = await diagrams();
  const { page, surface } = await openView({ host, params: { id: small.id } });
  await fitted(page);
  const zoom = page.getByRole("group", { name: "Zoom" });
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByText("125%").waitFor();
  const viewport = (await canvas(page).boundingBox())!;
  const start = { x: viewport.x + 20, y: viewport.y + 20 };
  await page.mouse.click(start.x, start.y);
  await page.keyboard.down("Space");
  await drag(page, start, { x: start.x + 80, y: start.y + 40 });
  await page.keyboard.up("Space");
  const shape = page.getByRole("img", { name: "Rectangle Wide", exact: true }).locator(".dg-body");
  const bounds = () => shape.evaluate((element) => element.getBoundingClientRect().toJSON());
  const before = await bounds();
  near(await middleOf(shape), { x: viewport.x + viewport.width / 2 + 80, y: viewport.y + viewport.height / 2 + 40 });
  const from = await middleOf(shape);
  await saved(host, () => drag(page, from, { x: from.x + 50, y: from.y + 50 }));
  near(await middleOf(shape), { x: from.x + 50, y: from.y + 50 });
  assert.equal(await zoom.locator("output").textContent(), "125%");
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.deepEqual(await bounds(), before);
  await answered(page, () => {
    surface.setVisible(false);
    surface.setVisible(true);
  });
  assert.deepEqual(await bounds(), before);
  assert.equal(await zoom.locator("output").textContent(), "125%");
  await page.setViewportSize({ ...page.viewportSize()!, height: 800 });
  assert.deepEqual(await bounds(), before);
  assert.deepEqual((await storedDiagram(host, small.id)).shapes, small.shapes);
});

test("waits for usable canvas dimensions before fitting a newly opened diagram", async () => {
  const { host, wide, empty } = await diagrams();
  const { page } = await openView({ host, params: { id: empty.id } });
  const hidden = await page.addStyleTag({ content: 'svg[role="application"] { display: none !important; }' });
  await sidebar(page).getByRole("button", { name: "Wide", exact: true }).click();
  await opened(page, "Wide");
  assert.equal(await canvas(page).isVisible(), false);
  await hidden.evaluate((style) => style.parentNode!.removeChild(style));
  await fitted(page);
  assert.deepEqual(await storedDiagram(host, wide.id), wide);
});

test("fits the diagram requested by the Widget both in an existing View and on initial navigation", async () => {
  const { host, wide, empty } = await diagrams();
  const view = await openView({ host, params: { id: empty.id } });
  const widget = await openWidget({ host });
  await widget.page.getByRole("list", { name: "Recent diagrams" }).getByRole("button", { name: /^Wide/ }).click();
  await opened(view.page, "Wide");
  await fitted(view.page);
  assert.deepEqual(host.openedViews, [{ id: wide.id }]);
  const initial = await openView({ host, params: host.openedViews[0] });
  await opened(initial.page, "Wide");
  await fitted(initial.page);
  assert.deepEqual(await storedDiagram(host, wide.id), wide);
});

test("centers the whole curve of a free arrow, not just its endpoints", async () => {
  const curve = newDiagram("curve", "Curve", 1);
  curve.arrows.push({ ...newArrow("free", { x: 2000, y: 2000 }, { x: 3000, y: 2000 }, 0), route: "curved" });
  const host = diagramHost();
  await host.storage.set(`diagram:${curve.id}`, curve as never);
  await host.storage.set("diagrams", [{ id: curve.id, title: curve.title, updatedAt: curve.updatedAt }]);
  const { page } = await openView({ host });
  await fitted(page);
  assert.deepEqual(await storedDiagram(host, curve.id), curve);
});
