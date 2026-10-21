// The images of the diagrams, kept in the Host storage since there is no `images/` folder: each under `image:<sha256>`
// of its content, as a data URL, so that an image is stored once, whatever the diagrams that show it. An image stays
// until no diagram, custom shape or step of the undo history refers to it any more. Pure functions; the encoding of a
// picture, which needs the browser, is in encoding.ts.

import { type Diagram, newId, newShape, nextZ } from "./diagram.ts";
import type { Point } from "./geometry.ts";

/** The longest side of an image stored, in pixels: a larger picture is reduced. */
export const STORED_SIDE = 1600;

/** The longest side of an image as it is placed, in units of the drawing. */
const PLACED_SIDE = 320;

/** The most an image may cost in the storage, its key and its data URL, once reduced: about 900 KB. */
export const IMAGE_LIMIT = 900 * 1024;

/** The room an image and its caption take in their diagram, kept in the storage before the image is written. */
export const PLACED_BYTES = 2 * 1024;

/** The gap between an image and its caption. */
const CAPTION_GAP = 6;

/** A width and a height, in pixels or in units of the drawing. */
export type Size = { w: number; h: number };

/** A size reduced, keeping its proportions, so that its longest side is at most `side`; a smaller size is kept. */
export function fittedSize({ w, h }: Size, side: number): Size {
  const scale = Math.min(1, side / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** The caption of an image: the name of its file without its extension, or "image" for a picture pasted. */
export function captionOf(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, "").trim() || "image";
}

/**
 * Places an image centered on a point, at most `PLACED_SIDE` wide or high, with its caption in a free text below it:
 * the two form a group, in front of the drawing. Returns their ids, the image first.
 */
export function placeImage(diagram: Diagram, image: { key: string; size: Size; caption: string; at: Point }): [string, string] {
  const { w, h } = fittedSize(image.size, PLACED_SIDE);
  const z = nextZ(diagram);
  const groupId = newId("group");
  const picture = { ...newShape(newId("shape"), image.at, z, "image"), w, h, imageKey: image.key, groupId };
  const caption = newShape(newId("shape"), image.at, z + 1, "text");
  caption.w = Math.max(caption.w, w);
  caption.y = image.at.y + h / 2 + CAPTION_GAP + caption.h / 2;
  caption.text = image.caption;
  caption.groupId = groupId;
  diagram.shapes.push(picture, caption);
  return [picture.id, caption.id];
}

/** The key of an image of this SHA-256 hash, in hexadecimal. */
export const imageKey = (hash: string): string => `image:${hash}`;

const isImageKey = (key: string) => key.startsWith("image:");

/** A reference to an image, in a value as JSON: the field `imageKey`, at any depth, of a shape or of a custom shape. */
const REFERENCE = /"imageKey":"(image:[^"]+)"/g;

/** The images a value as JSON refers to. */
export const imagesIn = (text: string): Set<string> => new Set([...text.matchAll(REFERENCE)].map((match) => match[1]));

/** Whether a value as JSON no longer refers to an image that its previous version referred to. */
export function dropsImage(previous: string, next: string): boolean {
  const kept = imagesIn(next);
  return [...imagesIn(previous)].some((key) => !kept.has(key));
}

/**
 * The images of the storage that nothing refers to: neither a stored value nor one of the `kept` JSON texts, such as
 * the steps of the undo history or a diagram not saved yet.
 */
export function unusedImages(stored: ReadonlyMap<string, unknown>, kept: readonly string[] = []): string[] {
  const texts = [...[...stored].filter(([key]) => !isImageKey(key)).map(([, value]) => JSON.stringify(value)), ...kept];
  const used = new Set(texts.flatMap((text) => [...imagesIn(text)]));
  return [...stored.keys()].filter((key) => isImageKey(key) && !used.has(key));
}
