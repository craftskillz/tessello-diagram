// The shape editor: a custom shape with anchors, placed from the palette, hidden from it, and deleted.

import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { addRectangle, arrowEnds, at, drag, near, newDiagram, openView, saved, storedDiagram, tool, picture, useBrowser } from "./diagram.ts";

useBrowser();

test("makes a custom shape with two anchors, places it, attaches an arrow to its second anchor, and hides it from the palette without changing it", async () => {
  const noise = await picture();
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Icons");

  // The shape editor: a library, and a shape made from a picture, with two anchors of its own.
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "New library" }).click();
  const libraryName = page.getByRole("textbox", { name: "Library name" });
  await libraryName.fill("Platform icons");
  await libraryName.press("Enter");
  await page.getByRole("button", { name: "New shape" }).click();
  await page.getByText("Choose an image: the shape is saved once it has one.").waitFor();
  await page.getByLabel("Image", { exact: true }).setInputFiles({ name: "gateway.png", mimeType: "image/png", buffer: noise });
  await page.getByRole("button", { name: "gateway" }).waitFor();
  const name = page.getByRole("textbox", { name: "Shape name" });
  await name.fill("Gateway");
  await name.press("Enter");
  for (const [side, size] of [["Width", "100"], ["Height", "60"]]) {
    await page.getByRole("spinbutton", { name: side }).fill(size);
    await page.getByRole("spinbutton", { name: side }).press("Enter");
  }
  await page.getByRole("button", { name: "Clear anchors" }).click();
  await page.getByText("No anchor: arrows attach to this shape automatically only.").waitFor();
  const preview = page.getByRole("button", { name: "Preview of the shape" });
  const box = (await preview.boundingBox())!;
  await preview.click({ position: { x: box.width / 2, y: 1 } });
  await preview.click({ position: { x: box.width - 1, y: box.height / 2 } });
  await page.getByRole("button", { name: "Anchor p2", exact: true }).waitFor();
  await page.getByText("2 anchors").waitFor();

  type Library = { id: string; name: string; shapes: Record<string, unknown>[] };
  const storedLibraries = async () => ((await host.storage.get("shapes")) ?? []) as unknown as Library[];
  const [library] = await until(async () => {
    const libraries = await storedLibraries();
    return (libraries[0]?.shapes[0]?.anchors as unknown[] | undefined)?.length === 2 && libraries;
  }, "the two anchors to be written");
  assert.equal(library.name, "Platform icons");
  const [definition] = library.shapes;
  assert.deepEqual([definition.name, definition.width, definition.height, definition.showInDiagram], ["Gateway", 100, 60, true]);
  assert.deepEqual((definition.anchors as { id: string }[]).map((anchor) => anchor.id), ["p1", "p2"]);
  assert.match(String(definition.imageKey), /^image:[0-9a-f]{64}$/);

  // Back to the diagram: the palette offers it, placed at its size with its name.
  await page.getByRole("button", { name: "← Back to diagram" }).click();
  await page.getByRole("group", { name: "Custom shapes" }).getByRole("button", { name: "Platform icons · Gateway" }).click();
  const origin = await at(page, 0, 0);
  await saved(host, () => page.mouse.dblclick(origin.x, origin.y));
  const icon = page.getByRole("img", { name: "Custom shape Gateway", exact: true });
  await icon.waitFor();
  const placed = (await storedDiagram(host)).shapes.find((shape) => shape.type === "custom")!;
  assert.deepEqual([placed.w, placed.h, placed.text], [100, 60, "Gateway"]);

  // An arrow from its second anchor, on the middle of its right side, to a rectangle.
  await addRectangle(opened, 300, 0, "B");
  await tool(page, "Arrow (F)");
  await saved(host, async () => drag(page, await at(page, placed.x + 50, placed.y), await at(page, 300, 0)));
  const arrow = (await storedDiagram(host)).arrows[0];
  assert.deepEqual(arrow.from, { shapeId: placed.id, port: "p2" });
  const name0 = "Arrow from Custom shape Gateway at p2 to Rectangle B";
  near((await arrowEnds(page, name0)).start, { x: placed.x + 49.6, y: placed.y });

  // Hidden from the palette, it is no longer offered, but the shape placed stays as it was.
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("checkbox", { name: "Show in diagram palette" }).uncheck();
  await until(async () => (await storedLibraries())[0].shapes[0].showInDiagram === false, "the shape to be hidden from the palette");
  await page.getByRole("button", { name: "← Back to diagram" }).click();
  await icon.waitFor();
  assert.equal(await page.getByRole("group", { name: "Custom shapes" }).count(), 0);
  assert.match((await icon.locator("image").getAttribute("href"))!, /^data:image\/webp;base64,/);
  near((await arrowEnds(page, name0)).start, { x: placed.x + 49.6, y: placed.y });

  // Deleted after a confirmation that says a diagram uses it, it shows as a dashed frame with its name, still attached.
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Delete shape" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this shape?" });
  await dialog.getByText("1 diagram uses it", { exact: false }).waitFor();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await page.getByText("No shape yet.").first().waitFor();
  await page.getByRole("button", { name: "← Back to diagram" }).click();
  await icon.getByText("Gateway", { exact: true }).waitFor();
  assert.equal(await icon.locator("image").count(), 0);
  assert.deepEqual((await storedDiagram(host)).arrows[0].from, { shapeId: placed.id, port: "p2" });
  // Without its anchor, the arrow leaves the frame toward the rectangle, from its right side.
  near((await arrowEnds(page, name0)).start, { x: placed.x + 50, y: placed.y });
});
