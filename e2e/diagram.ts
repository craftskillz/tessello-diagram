// What the browser tests of Diagram share: its built package served from dist/, its View and Widget opened in Chromium
// against the Test Host of the SDK, and the gestures and readings of the canvas. Every wait goes through `until`, which
// reads again until a deadline (E2E_CPU_SLOWDOWN multiplies it), never through a fixed time.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before } from "node:test";
import { type Browser, chromium, type Page } from "playwright";
import { createTestHost, type FolderServer, serveFolder, slowDownCpu, type TestHost, type TestHostOptions, type TestSurface, until, WIDGET_SIZES } from "@tessello/sdk/testing";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(await readFile(`${DIST}manifest.json`, "utf8").catch(() => {
  throw new Error("No dist/: run `npm run build` before the browser tests.");
}));
const module = { id: manifest.id as string, version: manifest.version as string };

let browser: Browser;
let server: FolderServer;

/** Serves dist/ and starts Chromium for the tests of the file that calls it. */
export function useBrowser(): void {
  before(async () => {
    server = await serveFolder(DIST);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await server?.close();
  });
}

/** Counts, in the page, the requests its Module sends to the Host, and the responses it gets (CONVENTION.md §5.1). */
const COUNT_REQUESTS = `window.__requests = { sent: 0, answered: 0 };
window.addEventListener("message", ({ data }) => {
  if (typeof data !== "object" || data === null || data.tessello !== 1 || typeof data.id !== "string") return;
  if (data.type === "response") window.__requests.answered++;
  else window.__requests.sent++;
});`;

/** A page in a new browser context, slowed down by E2E_CPU_SLOWDOWN. */
async function newPage(): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await slowDownCpu(page);
  await page.addInitScript(COUNT_REQUESTS);
  return page;
}

type Requests = { sent: number; answered: number };
const requests = (page: Page) => page.evaluate(() => (window as unknown as { __requests: Requests }).__requests);

/**
 * Runs `action`, then waits until the Module has asked the Host something, and has the answer to every request it sent:
 * for what it does with no sign on screen, such as reading the diagrams again when shown.
 */
export async function answered(page: Page, action: () => unknown) {
  const before = (await requests(page)).sent;
  await action();
  await until(async () => {
    const { sent, answered } = await requests(page);
    return sent > before && sent === answered;
  }, "the Host to answer the Module");
}

interface Opened {
  page: Page;
  host: TestHost;
  surface: TestSurface;
}

/** A Test Host for Diagram, under the Identifier of its Manifest. */
export const diagramHost = (options: Omit<TestHostOptions, "module"> = {}) => createTestHost({ module, ...options });

type OpenOptions = Pick<TestHostOptions, "storage" | "theme"> & { host?: TestHost; params?: Record<string, string> };

/** Opens the View, in English, on a Test Host of its own unless one is given. Without a diagram, it says so. */
export async function openView(options: OpenOptions = {}): Promise<Opened> {
  const host = options.host ?? diagramHost({ storage: options.storage, theme: options.theme });
  const page = await newPage();
  const surface = await host.attach(page, { surface: "view", ...(options.params ? { params: options.params } : {}) });
  await page.goto(`${server.url}/${manifest.view.entry}`);
  await page.getByRole("application", { name: "Canvas" }).or(page.getByText("Select or create a diagram")).first().waitFor();
  return { page, host, surface };
}

/** Opens the Widget, at the size its Manifest declares, on a Test Host of its own unless one is given. */
export async function openWidget(options: Pick<OpenOptions, "host" | "storage"> = {}): Promise<Opened> {
  const host = options.host ?? diagramHost({ storage: options.storage });
  const page = await newPage();
  await page.setViewportSize(WIDGET_SIZES[manifest.widget.size as keyof typeof WIDGET_SIZES]);
  const surface = await host.attach(page, { surface: "widget" });
  await page.goto(`${server.url}/${manifest.widget.entry}`);
  return { page, host, surface };
}

export const canvas = (page: Page) => page.getByRole("application", { name: "Canvas" });
export const sidebar = (page: Page) => page.getByRole("navigation", { name: "Diagrams" });

// The storage, as the Test Host holds it.

/** An entry of the list of diagrams, under the key `diagrams`. */
type Entry = { id: string; title: string; updatedAt: number };

type StoredEnd = { shapeId?: string; port?: string | null; x?: number; y?: number };
type StoredShape = {
  id: string;
  type: string;
  text: string;
  cells?: string[][];
  columns?: number[];
  cellStyles?: Record<string, unknown>[][];
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  textRotation: number;
  color: string;
  fontSize: number;
  groupId: string | null;
  locked: boolean;
  imageKey?: string;
  link: { type: string; value: string } | null;
};
type StoredArrow = {
  id: string;
  from: StoredEnd;
  to: StoredEnd;
  route: string;
  waypoints: { x: number; y: number }[];
  heads: string;
  dashed: boolean;
  width: number;
  label: string;
  labelAt: number;
  labelOffset: number;
};
type StoredDiagram = { id: string; title: string; grid: boolean; guides: boolean; shapes: StoredShape[]; arrows: StoredArrow[] };

export const storedIndex = async (host: TestHost) => ((await host.storage.get("diagrams")) ?? []) as Entry[];

/** Waits until the list of diagrams passes `written`. */
export async function stored(host: TestHost, written: (index: Entry[]) => boolean, what = "the list of diagrams to change") {
  await until(async () => written(await storedIndex(host)), what);
}

/** Runs a change, then waits until it is written: a diagram is written before the list, so a newer `updatedAt` in the list means the diagram is written too. */
export async function saved(host: TestHost, change: () => Promise<unknown>) {
  const before = Math.max(0, ...(await storedIndex(host)).map((entry) => entry.updatedAt));
  await change();
  await stored(host, (index) => index.some((entry) => entry.updatedAt > before), "the change to be written");
}

/** The diagram stored under `diagram:<id>`, or the first one stored. */
export async function storedDiagram(host: TestHost, id?: string): Promise<StoredDiagram> {
  const key = id ? `diagram:${id}` : (await host.storage.keys()).find((each) => each.startsWith("diagram:"));
  assert.ok(key, "a diagram is stored");
  return (await host.storage.get(key)) as unknown as StoredDiagram;
}

/** Changes the stored diagram, as another surface would, then reloads the View, which opens it again. */
export async function editStored(page: Page, host: TestHost, change: (diagram: StoredDiagram) => void) {
  const diagram = await storedDiagram(host);
  change(diagram);
  await host.storage.set(`diagram:${diagram.id}`, diagram as never);
  await reload(page);
}

/** Reloads the View, and waits until it shows a diagram again. */
export async function reload(page: Page) {
  await page.reload();
  await page.getByRole("textbox", { name: "Diagram title" }).waitFor();
}

/** The images stored, by key. */
export async function storedImages(host: TestHost): Promise<Record<string, string>> {
  const keys = (await host.storage.keys()).filter((key) => key.startsWith("image:"));
  return Object.fromEntries(await Promise.all(keys.map(async (key) => [key, (await host.storage.get(key)) as string])));
}

/** Waits until the keys of the images stored pass `written`. */
export async function imagesStored(host: TestHost, written: (keys: string[]) => boolean) {
  await until(async () => written(Object.keys(await storedImages(host))), "the images stored to change");
}

// The canvas.

/** A point of the drawing, in page coordinates, following the canvas's current pan and zoom. */
export async function at(page: Page, x: number, y: number) {
  return canvas(page).locator(":scope > g").evaluate((drawing: SVGGElement, point) => {
    const { x, y } = new DOMPoint(point.x, point.y).matrixTransform(drawing.getScreenCTM()!);
    return { x, y };
  }, { x, y });
}

type ToolName = "Select (S)" | "Rectangle (R)" | "Ellipse (E)" | "Database (D)" | "Circle (C)" | "Actor (A)" | "Post-it (P)" | "Free text (T)" | "Table" | "Arrow (F)";

export async function tool(page: Page, name: ToolName) {
  await page.getByRole("button", { name }).click();
}

/** Creates a diagram with the sidebar's “+ New”, and names it. */
export async function newDiagram({ page, host }: Opened, title: string) {
  await saved(host, () => sidebar(page).getByRole("button", { name: "+ New" }).click());
  const field = page.getByRole("textbox", { name: "Diagram title" });
  await field.fill(title);
  await saved(host, () => field.press("Enter"));
  await sidebar(page).getByRole("button", { name: title, exact: true }).waitFor();
}

/** Places a shape with a tool by a double-click, and writes its text: the shape stays selected. */
export async function addShape({ page, host }: Opened, name: ToolName, x: number, y: number, text: string) {
  await tool(page, name);
  const point = await at(page, x, y);
  await page.mouse.dblclick(point.x, point.y);
  await page.getByRole("textbox", { name: "Text of the shape" }).fill(text);
  await page.getByRole("textbox", { name: "Text of the shape" }).press("Enter");
  // The shape is written once placed, then with its text: what is waited for is its text, in the diagram and the list.
  await until(async () => {
    const index = await storedIndex(host);
    for (const key of (await host.storage.keys()).filter((each) => each.startsWith("diagram:"))) {
      const diagram = (await host.storage.get(key)) as unknown as StoredDiagram & { updatedAt: number };
      const listed = index.find((entry) => entry.id === diagram.id)?.updatedAt === diagram.updatedAt;
      if (listed && diagram.shapes.some((shape) => shape.text === text)) return true;
    }
    return false;
  }, `the shape “${text}” to be written`);
  await page.getByRole("img", { name: new RegExp(` ${text}$`) }).waitFor();
}

export const addRectangle = (opened: Opened, x: number, y: number, text: string) => addShape(opened, "Rectangle (R)", x, y, text);

/** The middle of an element, in the coordinates of the page. */
export async function middleOf(locator: { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> }) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Drags a handle of the selection by (dx, dy) pixels. */
export async function dragHandle(page: Page, name: string, dx: number, dy: number) {
  const from = await middleOf(page.getByRole("button", { name }));
  await drag(page, from, { x: from.x + dx, y: from.y + dy });
}

/** Clicks the drawing at a point given in its coordinates. */
export async function clickAt(page: Page, x: number, y: number) {
  const point = await at(page, x, y);
  await page.mouse.click(point.x, point.y);
}

/** Where the arrow starts and where its tip is, in the coordinates of the drawing. */
export async function arrowEnds(page: Page, name: string) {
  const arrow = page.getByRole("img", { name });
  const [x1, y1] = (await arrow.locator(".dg-arrow-line").getAttribute("d"))!.slice(1).split(/[ ,LC]/).map(Number);
  const [x, y] = (await arrow.locator(".dg-arrow-head").getAttribute("points"))!.split(" ")[0].split(",").map(Number);
  return { start: { x: x1, y: y1 }, tip: { x, y } };
}

/** Within a pixel: a point of the page and a point of the drawing may differ by half a pixel. */
export function near(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  assert.ok(Math.abs(actual.x - expected.x) <= 1 && Math.abs(actual.y - expected.y) <= 1, `${JSON.stringify(actual)} is not near ${JSON.stringify(expected)}`);
}

/** A point of the drawn line of an arrow, at a part of its length, in the coordinates of the page. */
export async function pointOn(page: Page, name: string, part: number) {
  const point = await page
    .getByRole("img", { name, exact: true })
    .locator(".dg-arrow-line")
    .evaluate((path: SVGPathElement, part) => {
      const { x, y } = path.getPointAtLength(path.getTotalLength() * part);
      return { x, y };
    }, part);
  return at(page, point.x, point.y);
}

export async function isSelected(page: Page, name: string | RegExp) {
  return /\bselected\b/.test((await page.getByRole("img", { name, exact: typeof name === "string" }).getAttribute("class"))!);
}

/** Waits until the View shows the diagram titled `title`. */
export async function opened(page: Page, title: string) {
  const field = page.getByRole("textbox", { name: "Diagram title" });
  await until(async () => (await field.inputValue()) === title, `the View to open “${title}”`);
}

// Pictures and files.

/** A PNG made by the browser: opaque noise, which compresses badly, so that its size grows with its pixels. */
export async function noisePng(page: Page, w: number, h: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = new OffscreenCanvas(w, h);
      const context = canvas.getContext("2d")!;
      const pixels = context.createImageData(w, h);
      for (let index = 0; index < pixels.data.length; index++) pixels.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
      context.putImageData(pixels, 0, 0);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    [w, h],
  );
  return Buffer.from(base64, "base64");
}

let small: Buffer | undefined;

/** A small opaque picture, 200 × 150, made once per file. */
export async function picture(): Promise<Buffer> {
  if (!small) {
    const page = await newPage();
    small = await noisePng(page, 200, 150);
    await page.context().close();
  }
  return small;
}

/** Chooses a picture with the Image tool, by a double-click on a point of the drawing. */
export async function chooseImage(page: Page, x: number, y: number, name: string, buffer: Buffer, mimeType = "image/png") {
  await page.getByRole("button", { name: "Image (I)" }).click();
  const chooser = page.waitForEvent("filechooser");
  const point = await at(page, x, y);
  await page.mouse.dblclick(point.x, point.y);
  await (await chooser).setFiles({ name, mimeType, buffer });
}

/** The file the View hands the User when `start` runs: its name and its bytes. */
export async function downloaded(page: Page, start: () => Promise<void>): Promise<{ name: string; bytes: Buffer }> {
  const [file] = await Promise.all([page.waitForEvent("download"), start()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}
