// Importing the files of living-documentation.

import assert from "node:assert/strict";
import { test } from "node:test";
import { imagesStored, newDiagram, openView, reload, sidebar, stored, storedImages, storedIndex, picture, useBrowser } from "./diagram.ts";

useBrowser();

/** The `.diagrams.json` of the fixture of living-documentation (tests/fixtures/with-diagrams/testdocs). */
const SAMPLE_DIAGRAMS = [
  {
    id: "diag-1",
    title: "Sample Diagram",
    nodes: [
      { id: "n1", label: "Start", shapeType: "box", colorKey: "c-blue", x: 0, y: 0 },
      { id: "n2", label: "End", shapeType: "ellipse", colorKey: "c-green", x: 200, y: 0 },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2" }],
    edgesStraight: false,
    gridEnabled: true,
    alignGuides: true,
  },
];
/** A second diagram: a custom shape of the library, and an image that is not provided. */
const SECOND_DIAGRAMS = [
  {
    id: "diag-2",
    title: "Servers",
    nodes: [
      { id: "s1", label: "Prod", shapeType: "custom-shape", customShapeId: "srv", x: 0, y: 0 },
      { id: "p1", label: "Photo", shapeType: "image", imageSrc: "/images/missing.png", x: 200, y: 0 },
    ],
    edges: [],
  },
];
const SAMPLE_LIBRARIES = { libraries: [{ id: "lib-1", name: "Infra", shapes: [{ id: "srv", name: "Server", imageSrc: "/images/icon.png", width: 80, height: 40 }] }] };
const json = (name: string, value: unknown) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });

test("imports the files of living-documentation after a confirmation: diagrams, libraries and the images they refer to", async () => {
  const noise = await picture();
  const opened = await openView();
  const { page, host } = opened;
  await newDiagram(opened, "Existing");
  const chooser = page.waitForEvent("filechooser");
  await sidebar(page).getByRole("button", { name: "Import" }).click();
  await (
    await chooser
  ).setFiles([
    json(".diagrams.json", SAMPLE_DIAGRAMS),
    json("more.json", SECOND_DIAGRAMS),
    json(".shape-libraries.json", SAMPLE_LIBRARIES),
    { name: "icon.png", mimeType: "image/png", buffer: noise },
    { name: "unused.png", mimeType: "image/png", buffer: noise },
  ]);
  const dialog = page.getByRole("dialog", { name: "Import these files?" });
  await dialog.getByText("Diagrams: 2, libraries: 1, custom shapes: 1, images: 1").waitFor();
  await dialog.getByText("missing.png").waitFor();
  // Cancelled, nothing is written.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await sidebar(page).getByRole("button", { name: "Sample Diagram", exact: true }).count(), 0);
  assert.equal(Object.keys(await storedImages(host)).length, 0);

  const again = page.waitForEvent("filechooser");
  await sidebar(page).getByRole("button", { name: "Import" }).click();
  await (
    await again
  ).setFiles([json(".diagrams.json", SAMPLE_DIAGRAMS), json("more.json", SECOND_DIAGRAMS), json(".shape-libraries.json", SAMPLE_LIBRARIES), { name: "icon.png", mimeType: "image/png", buffer: noise }]);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();

  await sidebar(page).getByRole("button", { name: "Sample Diagram", exact: true }).waitFor();
  await page.getByRole("img", { name: "Rectangle Start", exact: true }).waitFor();
  await page.getByRole("img", { name: "Ellipse End", exact: true }).waitFor();
  await page.getByRole("img", { name: "Arrow from Rectangle Start to Ellipse End", exact: true }).waitFor();
  await imagesStored(host, (keys) => keys.length === 1 && /^image:[0-9a-f]{64}$/.test(keys[0]));
  await stored(host, (index) => index.length === 3);

  await reload(page);
  await sidebar(page).getByRole("button", { name: "Servers", exact: true }).waitFor();
  await sidebar(page).getByRole("button", { name: "Existing", exact: true }).waitFor();
  await sidebar(page).getByRole("button", { name: "Sample Diagram", exact: true }).click();
  await page.getByRole("img", { name: "Rectangle Start", exact: true }).waitFor();
  await page.getByRole("img", { name: "Arrow from Rectangle Start to Ellipse End", exact: true }).waitFor();
  await sidebar(page).getByRole("button", { name: "Servers", exact: true }).click();
  await page.getByRole("img", { name: /Photo/ }).getByText("missing image").waitFor();
  assert.equal(Object.keys(await storedImages(host)).length, 1);
});

test("refuses a file that is not JSON, naming it, and imports nothing", async () => {
  const opened = await openView();
  const { page, host } = opened;
  const chooser = page.waitForEvent("filechooser");
  await sidebar(page).getByRole("button", { name: "Import" }).click();
  await (await chooser).setFiles([{ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("{nope") }, json(".diagrams.json", SAMPLE_DIAGRAMS)]);
  await page.getByRole("alert").getByText(/notes\.json.*not JSON/).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal((await storedIndex(host)).length, 0);
  assert.equal(await sidebar(page).getByRole("button", { name: "Sample Diagram", exact: true }).count(), 0);
});
