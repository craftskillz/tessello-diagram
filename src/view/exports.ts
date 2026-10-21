// "Export PNG" and "Export as drawio (.drawio)": the file is handed to the User as a download, which the Host allows a
// View (CONVENTION.md §4), named from the title of the diagram. Exporting does not save the diagram: it exports what is
// on screen. What an export loses, or why it fails, is told in a message.

import { copyItems } from "../lib/clipboard.ts";
import type { Shape } from "../lib/diagram.ts";
import { fileNameOf, toDrawio } from "../lib/drawio.ts";
import { t, titleOf } from "../lib/i18n.ts";
import { pictureKeyOf } from "../lib/library.ts";
import { reasonOf } from "../lib/storage.ts";
import { diagrams, readImages, shapeLibraries, status, ui } from "../lib/store.svelte.ts";
import { canvasMeasure } from "../lib/text.ts";
import { renderPng } from "./png.ts";

/** Hands the User a file to save. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  // The download has started from the URL by then.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The keys of the pictures shapes show: those of images, and those of the definitions of custom shapes. */
const picturesOf = (shapes: readonly Shape[]): string[] => shapes.flatMap((shape) => pictureKeyOf(shapeLibraries.list, shape) ?? []);

/** Runs an export, telling the User why it failed. */
async function reportingFailure(run: () => Promise<void>): Promise<void> {
  status.exportNotice = "";
  try {
    await run();
  } catch (error) {
    status.exportNotice = t("export_error", { reason: reasonOf(error) });
  }
}

/**
 * The PNG of the selection, with the arrows between its shapes, or of the whole diagram when nothing is selected, on
 * the background of the theme unless "Transparent" is on. An empty diagram exports nothing.
 */
export function exportPng(): Promise<void> {
  const diagram = diagrams.open;
  if (!diagram) return Promise.resolve();
  const ids = ui.selection.length ? ui.selection : [...diagram.shapes, ...diagram.arrows].map((item) => item.id);
  const between = new Set(copyItems(diagram, ids).arrows.map((arrow) => arrow.id));
  const shapes = diagram.shapes.filter((shape) => ids.includes(shape.id));
  const arrows = diagram.arrows.filter((arrow) => ids.includes(arrow.id) || between.has(arrow.id));
  if (!shapes.length && !arrows.length) return Promise.resolve();
  return reportingFailure(async () => {
    const images = await readImages(picturesOf(shapes));
    const background = ui.transparentPng ? null : getComputedStyle(document.body).backgroundColor;
    const png = await renderPng({ diagram, shapes, arrows, libraries: shapeLibraries.list, images, measure: canvasMeasure() }, background);
    download(png, fileNameOf(titleOf(diagram.title), "png"));
  });
}

/** The `.drawio` file of the whole diagram, its pictures embedded. The texts turned apart from their shape are lost: the User is told. */
export function exportDrawio(): Promise<void> {
  const diagram = diagrams.open;
  if (!diagram) return Promise.resolve();
  return reportingFailure(async () => {
    const { xml, droppedRotations } = toDrawio(diagram, shapeLibraries.list, await readImages(picturesOf(diagram.shapes)));
    download(new Blob([xml], { type: "application/xml" }), fileNameOf(titleOf(diagram.title), "drawio"));
    if (droppedRotations) status.exportNotice = t("drawio_rotations_dropped", { count: droppedRotations });
  });
}
