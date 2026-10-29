// The burger button hides the list of diagrams to give the canvas its room, and shows it again, without touching the diagram.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Locator, Page } from "playwright";
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

test("lays the header on two lines, the title with the toggle on its right, then the buttons", async () => {
  const cases = [
    { locale: "en", title: "Diagrams", toggle: "Hide diagrams", actions: ["Import", "+ New"], window: 1280, width: 220 },
    { locale: "en", title: "Diagrams", toggle: "Hide diagrams", actions: ["Import", "+ New"], window: 560, width: 150 },
    { locale: "fr", title: "Diagrammes", toggle: "Masquer les diagrammes", actions: ["Importer", "+ Nouveau"], window: 1280, width: 220 },
    { locale: "fr", title: "Diagrammes", toggle: "Masquer les diagrammes", actions: ["Importer", "+ Nouveau"], window: 560, width: 150 },
  ];
  for (const { locale, title, toggle, actions, window, width } of cases) {
    const { page } = await openView({ locale });
    await page.setViewportSize({ width: window, height: 700 });
    const nav = page.getByRole("navigation", { name: title });
    await until(async () => (await nav.boundingBox())?.width === width, `the sidebar to be ${width}px wide`);
    const where = `${locale} at ${width}px`;
    const box = async (locator: Locator) => (await locator.boundingBox())!;
    const buttons = actions.map((name) => nav.getByRole("button", { name, exact: true }));
    const [bar, header, heading, burger, importer, creator] = [
      await box(nav),
      await box(nav.locator(".dg-sidebar-head")),
      await box(nav.getByRole("heading", { name: title })),
      await box(nav.getByRole("button", { name: toggle })),
      await box(buttons[0]),
      await box(buttons[1]),
    ];

    assert.ok(heading.y + heading.height <= importer.y, `${where}: the title is above the buttons`);
    assert.ok(importer.y - (heading.y + heading.height) >= 4, `${where}: the lines are spaced`);
    assert.ok(Math.abs(burger.y + burger.height / 2 - (heading.y + heading.height / 2)) <= 4, `${where}: the toggle is on the line of the title`);
    assert.ok(header.x + header.width - (burger.x + burger.width) <= 14, `${where}: the toggle is at the right end of the header`);
    assert.ok(Math.abs(importer.x - heading.x) <= 1, `${where}: Import is aligned with the title`);
    // Too narrow for both, as in French at 150px, the second button goes below the first rather than break its words.
    const sameLine = Math.abs(importer.y - creator.y) <= 1 && creator.x >= importer.x + importer.width;
    const below = creator.y >= importer.y + importer.height && Math.abs(creator.x - importer.x) <= 1;
    assert.ok(sameLine || below, `${where}: the second button follows the first, on its line or below it`);
    for (const [index, button] of buttons.entries()) {
      const lines = await button.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
      });
      assert.equal(lines, 1, `${where}: “${actions[index]}” keeps its words on one line`);
    }
    for (const each of [heading, burger, importer, creator]) {
      assert.ok(each.x >= bar.x && each.x + each.width <= bar.x + bar.width, `${where}: nothing sticks out of the sidebar`);
    }
    assert.ok(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth), `${where}: the sidebar does not scroll sideways`);
    await page.context().close();
  }
});

test("shows the full title of a diagram in a tooltip, without repeating it to a screen reader", async () => {
  const long = "A very long title for a diagram, much longer than the list can show on one line";
  const host = diagramHost();
  const entries = [
    { id: "long", title: long, updatedAt: 2 },
    { id: "blank", title: "", updatedAt: 1 },
  ];
  for (const entry of entries) await host.storage.set(`diagram:${entry.id}`, newDiagram(entry.id, entry.title, entry.updatedAt) as never);
  await host.storage.set("diagrams", entries);
  const { page } = await openView({ host, params: { id: "long" } });
  const longTitle = sidebar(page).getByRole("button", { name: long, exact: true });
  const untitled = sidebar(page).getByRole("button", { name: "Untitled", exact: true });

  assert.equal(await longTitle.getAttribute("aria-current"), "page");
  assert.equal(await longTitle.getAttribute("title"), long);
  assert.ok(await longTitle.evaluate((element) => element.scrollWidth > element.clientWidth), "the long title is cut in the list");
  assert.equal(await untitled.getAttribute("title"), "Untitled");

  // Chromium gives a title equal to the name no description, so the screen reader hears the title once.
  const cdp = await page.context().newCDPSession(page);
  type Value = { value: string } | undefined;
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: { role: Value; name: Value; description: Value }[] };
  for (const name of [long, "Untitled"]) {
    const node = nodes.find((each) => each.role?.value === "button" && each.name?.value === name);
    assert.ok(node, `the button named “${name}” is exposed`);
    assert.ok(!node.description?.value, `the button named “${name}” has no description repeating its name`);
  }
  await page.context().close();
});
