// The encoding of a picture chosen or pasted, in the browser: reduced to `STORED_SIDE` on its longest side, then
// encoded in WebP, or in PNG when it has transparency; an SVG is kept as it is. Its key is the SHA-256 of what is stored.

import { fittedSize, imageKey, type Size, STORED_SIDE } from "./images.ts";

export interface EncodedImage {
  /** `image:<sha256>` of the data URL. */
  key: string;
  /** The picture as a data URL, as it is stored. */
  dataUrl: string;
  /** Its size in pixels, for its shape to keep its proportions. */
  size: Size;
}

/** The size given to an SVG that does not tell its own. */
const SVG_SIZE: Size = { w: 160, h: 120 };

/** Encodes a picture; throws when the browser cannot read it as an image. */
export async function encodeImage(file: Blob): Promise<EncodedImage> {
  const dataUrl = file.type === "image/svg+xml" ? await readAsDataUrl(file) : await reencode(file);
  const size = await sizeOf(dataUrl);
  return { key: imageKey(await sha256(dataUrl)), dataUrl, size };
}

async function reencode(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fittedSize({ w: bitmap.width, h: bitmap.height }, STORED_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL(hasTransparency(context.getImageData(0, 0, w, h).data) ? "image/png" : "image/webp", 0.85);
}

function hasTransparency(pixels: Uint8ClampedArray): boolean {
  for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] < 255) return true;
  return false;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** The size of a picture as the browser draws it; an SVG without one gets `SVG_SIZE`. */
function sizeOf(dataUrl: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? { w: image.naturalWidth, h: image.naturalHeight } : SVG_SIZE);
    image.onerror = () => reject(new Error("not an image"));
    image.src = dataUrl;
  });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
