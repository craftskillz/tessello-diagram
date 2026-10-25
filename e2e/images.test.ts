// Images: chosen, encoded and stored once, removed once unused, too heavy, pasted, and missing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { at, chooseImage, editStored, imagesStored, newDiagram, noisePng, openView, reload, saved, sidebar, storedDiagram, storedImages, tool, picture, useBrowser } from "./diagram.ts";

useBrowser();

test("inserts a chosen image with its caption as a group, finds it after a reload, and removes it from the storage once deleted for good", async () => {
  const noise = await picture();
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Pictures");
  const gauge = page.getByRole("navigation", { name: "Diagrams" }).getByText(/^Storage: \d+\.\d MB \/ 5 MB$/);
  await gauge.waitFor();
  const usageBefore = Number(await page.getByRole("meter").getAttribute("value"));

  await saved(host, () => chooseImage(page, 0, 0, "logo.final.png", noise));
  const image = page.getByRole("img", { name: "Image", exact: true });
  await image.waitFor();
  await page.getByRole("img", { name: "Free text logo.final", exact: true }).waitFor();
  const [key] = Object.keys(await storedImages(host));
  assert.match(key, /^image:[0-9a-f]{64}$/);
  // Opaque, it is stored in WebP; the image and its caption are one group.
  assert.match((await storedImages(host))[key], /^data:image\/webp;base64,/);
  const shapes = (await storedDiagram(host)).shapes;
  const placed = shapes.find((shape) => shape.type === "image")!;
  assert.equal(placed.imageKey, key);
  assert.ok(placed.groupId);
  assert.equal(shapes.find((shape) => shape.type === "text")!.groupId, placed.groupId);
  const usage = async () => Number(await page.getByRole("meter").getAttribute("value"));
  await until(async () => (await usage()) > usageBefore, "the gauge to count the image");

  // The same picture again is not stored twice.
  await saved(host, () => chooseImage(page, 0, -220, "copy.png", noise));
  await page.getByRole("img", { name: "Free text copy", exact: true }).waitFor();
  assert.equal(Object.keys(await storedImages(host)).length, 1);

  await reload(page);
  await page.getByRole("img", { name: "Free text copy", exact: true }).waitFor();
  assert.match((await image.first().locator("image").getAttribute("href"))!, /^data:image\/webp;base64,/);

  // Deleting one of the two leaves the picture. Deleting the other keeps it while an undo can bring it back.
  await tool(page, "Select (S)");
  await saved(host, async () => {
    await image.first().click();
    await page.keyboard.press("Delete");
  });
  assert.equal(await image.count(), 1);
  await saved(host, async () => {
    await image.click();
    await page.keyboard.press("Delete");
  });
  assert.equal(await page.getByRole("img", { name: /^Free text/ }).count(), 0);
  await saved(host, () => page.keyboard.press("ControlOrMeta+z"));
  assert.match((await image.locator("image").getAttribute("href"))!, /^data:image\/webp;base64,/);
  await saved(host, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  assert.equal(Object.keys(await storedImages(host)).length, 1);
  // Once the history is gone, nothing uses it: it is removed from the storage.
  await reload(page);
  await page.getByRole("textbox", { name: "Diagram title" }).waitFor();
  await imagesStored(host, (keys) => keys.length === 0);
});

test("stores a picture with transparency in PNG, and an SVG as it is", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Pictures");
  const transparent = Buffer.from(
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(40, 40);
      canvas.getContext("2d")!.fillRect(0, 0, 20, 40);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }),
    "base64",
  );
  await saved(host, () => chooseImage(page, 0, 0, "half.png", transparent));
  await page.getByRole("img", { name: "Free text half", exact: true }).waitFor();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>';
  await page.getByRole("button", { name: "Image (I)" }).click();
  const chooser = page.waitForEvent("filechooser");
  const point = await at(page, 0, -200);
  await page.mouse.dblclick(point.x, point.y);
  await saved(host, async () => (await chooser).setFiles({ name: "badge.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) }));
  await page.getByRole("img", { name: "Free text badge", exact: true }).waitFor();
  const values = Object.values(await storedImages(host)).sort();
  assert.equal(values.length, 2);
  assert.match(values[0], /^data:image\/png;base64,/);
  assert.equal(values[1], `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  // The SVG keeps its proportions.
  const badge = (await storedDiagram(host)).shapes.find((shape) => shape.type === "image" && shape.y < -100)!;
  assert.deepEqual([badge.w, badge.h], [80, 40]);
});

test("deleting the diagram that shows an image removes the image from the storage", async () => {
  const noise = await picture();
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Kept");
  await newDiagram(opened, "Pictures");
  await saved(host, () => chooseImage(page, 0, 0, "logo.png", noise));
  await page.getByRole("img", { name: "Free text logo", exact: true }).waitFor();
  await imagesStored(host, (keys) => keys.length === 1);
  await sidebar(page).getByRole("button", { name: "Delete Pictures" }).click();
  await page.getByRole("dialog", { name: "Delete this diagram?" }).getByRole("button", { name: "Delete" }).click();
  await imagesStored(host, (keys) => keys.length === 0);
});

test("refuses an image too heavy, with a message, and places nothing", async () => {
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Pictures");
  await chooseImage(page, 0, 0, "huge.png", await noisePng(page, 1600, 1600));
  await page.getByRole("alert").getByText(/This image is too large: \d+ KB once reduced, more than the 900 KB/).waitFor();
  assert.equal(await page.getByRole("img", { name: "Image", exact: true }).count(), 0);
  assert.equal((await storedDiagram(host)).shapes.length, 0);
  assert.deepEqual(await storedImages(host), {});
  await page.getByRole("button", { name: "Close" }).click();
  assert.equal(await page.getByRole("alert").count(), 0);
});

test("pastes an image of the system clipboard in the middle of the view, captioned image", async () => {
  const noise = await picture();
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Pictures");
  const base64 = noise.toString("base64");
  await saved(host, () =>
    page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "image.png", { type: "image/png" }));
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, base64),
  );
  await page.getByRole("img", { name: "Free text image", exact: true }).waitFor();
  const placed = (await storedDiagram(host)).shapes.find((shape) => shape.type === "image")!;
  assert.deepEqual([placed.x, placed.y], [0, 0]);
});

test("an image missing from the storage shows a missing image frame", async () => {
  const noise = await picture();
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Pictures");
  await saved(host, () => chooseImage(page, 0, 0, "logo.png", noise));
  await page.getByRole("img", { name: "Image", exact: true }).waitFor();
  await editStored(page, host, (diagram) => {
    (diagram.shapes.find((shape) => shape.type === "image") as Record<string, unknown>).imageKey = `image:${"0".repeat(64)}`;
  });
  await page.getByRole("img", { name: "Image", exact: true }).getByText("missing image").waitFor();
});
