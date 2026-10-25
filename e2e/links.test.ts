// Links on a shape: to another diagram, followed and come back from, and to an external URL.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { addRectangle, middleOf, newDiagram, openView, saved, sidebar, stored, storedDiagram, storedIndex, useBrowser } from "./diagram.ts";

useBrowser();

test("links a shape to a new diagram, follows it with Shift+click and comes back; a link to a deleted diagram says so and can be removed", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Overview");
  await addRectangle(opened, 0, 0, "Billing");

  // A new diagram needs a title.
  await page.getByRole("button", { name: "Link…" }).click();
  const dialog = page.getByRole("dialog", { name: "Link on this shape" });
  await dialog.getByRole("radio", { name: "New diagram" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.getByText("Enter a title for the new diagram.").waitFor();
  await dialog.getByRole("textbox", { name: "Title of the new diagram" }).fill("Billing details");
  await saved(host, () => dialog.getByRole("button", { name: "Save" }).click());
  await sidebar(page).getByRole("button", { name: "Billing details", exact: true }).waitFor();
  const billing = page.getByRole("img", { name: "Rectangle Billing" });
  await billing.locator(".dg-link[data-link='diagram']").waitFor();
  const target = (await storedIndex(host)).find((entry) => entry.title === "Billing details")!;
  const overview = (await storedIndex(host)).find((entry) => entry.title === "Overview")!;
  // The new diagram is written before the shape that leads to it.
  await until(async () => JSON.stringify((await storedDiagram(host, overview.id)).shapes[0].link ?? null) === JSON.stringify({ type: "diagram", value: target.id }), "the link to be written");

  // Shift+click follows the link, and "← Back" returns.
  const title = page.getByRole("textbox", { name: "Diagram title" });
  const shiftClick = async () => {
    const point = await middleOf(billing);
    await page.keyboard.down("Shift");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up("Shift");
  };
  await shiftClick();
  await page.getByRole("button", { name: "← Back to “Overview”" }).click();
  await billing.waitFor();
  assert.equal(await title.inputValue(), "Overview");
  await page.getByRole("button", { name: /^← Back to/ }).waitFor({ state: "detached" });

  // Opening a diagram from the list forgets the way back.
  await shiftClick();
  await page.getByRole("button", { name: "← Back to “Overview”" }).waitFor();
  assert.equal(await title.inputValue(), "Billing details");
  await sidebar(page).getByRole("button", { name: "Overview", exact: true }).click();
  await billing.waitFor();
  await page.getByRole("button", { name: /^← Back to/ }).waitFor({ state: "detached" });

  // The target deleted, the link says so, and is removed.
  await sidebar(page).getByRole("button", { name: "Delete Billing details" }).click();
  await page.getByRole("dialog", { name: "Delete this diagram?" }).getByRole("button", { name: "Delete" }).click();
  await stored(host, (index) => index.every((entry) => entry.title !== "Billing details"));
  await shiftClick();
  const notice = page.getByRole("alert").filter({ hasText: "Diagram not found" });
  await notice.waitFor();
  assert.equal(await title.inputValue(), "Overview");
  await saved(host, () => notice.getByRole("button", { name: "Remove link" }).click());
  assert.equal(await billing.locator(".dg-link").count(), 0);
  await until(async () => ((await storedDiagram(host, overview.id)).shapes[0].link ?? null) === null, "the link to be removed");
});

test("a link to an external URL gets https:// and opens in a new tab", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Docs");
  await addRectangle(opened, 0, 0, "Wiki");
  await page.getByRole("button", { name: "Link…" }).click();
  const dialog = page.getByRole("dialog", { name: "Link on this shape" });
  await dialog.getByRole("textbox", { name: "URL" }).fill("example.com/wiki");
  await saved(host, () => dialog.getByRole("button", { name: "Save" }).click());
  const wiki = page.getByRole("img", { name: "Rectangle Wiki" });
  await wiki.locator(".dg-link[data-link='url']").waitFor();
  assert.deepEqual((await storedDiagram(host)).shapes[0].link, { type: "url", value: "https://example.com/wiki" });

  const point = await middleOf(wiki);
  // The new tab is answered here, not by the network.
  await page.context().route("https://example.com/**", (route) => route.fulfill({ body: "Wiki" }));
  const popup = page.context().waitForEvent("page");
  await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Shift");
  assert.equal((await popup).url(), "https://example.com/wiki");
});
