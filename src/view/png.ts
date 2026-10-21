// The PNG of shapes and arrows, rendered from the model and not captured from the canvas: what is off the screen is
// drawn too. They are drawn apart, by Drawing.svelte, in the colors of the current theme; the SVG they make is given
// the styles the page computed for it, since an image does not see the stylesheets of the page, then drawn on a canvas,
// twice as large for sharpness.

import { type ComponentProps, flushSync, mount, unmount } from "svelte";
import Drawing from "./Drawing.svelte";

/** How many pixels of the PNG make one unit of the drawing. */
const SCALE = 2;
/** The longest side of a PNG in pixels, below what a canvas of the browser can hold: a larger drawing is scaled down. */
const MAX_SIDE = 16000;
/** The space around the drawing, in units of the drawing. */
const MARGIN = 20;
const SVG_NS = "http://www.w3.org/2000/svg";

/** The properties of the styles that paint an SVG, given to each of its elements as the page computed them. */
const PAINT_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
];

/** What a PNG shows: the shapes and arrows of a diagram, with what draws them, as Drawing.svelte takes them. */
export type PngContent = ComponentProps<typeof Drawing>;

/** The PNG of shapes and arrows of a diagram, on a background color, or transparent without one. */
export async function renderPng(content: PngContent, background: string | null): Promise<Blob> {
  const svg = drawnSvg(content, background);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.text)}`;
  await image.decode();
  const scale = Math.min(SCALE, MAX_SIDE / Math.max(svg.w, svg.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(svg.w * scale);
  canvas.height = Math.ceil(svg.h * scale);
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, svg.w, svg.h);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the image could not be made"))), "image/png"));
}

/** The SVG text of the drawing, with its styles, framed around what it draws, and its size in units of the drawing. */
function drawnSvg(content: PngContent, background: string | null): { text: string; w: number; h: number } {
  // Out of sight, but in the page, so that its stylesheets apply and its text can be measured.
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: -100000px; top: 0;";
  document.body.append(host);
  const drawing = mount(Drawing, { target: host, props: content });
  try {
    flushSync();
    const svg = host.querySelector("svg")!;
    // All the styles are read before any is written: the colors of an element come from the classes of its parents.
    const elements = [...svg.querySelectorAll<SVGElement>("*")];
    const styles = elements.map((element) => {
      const computed = getComputedStyle(element);
      return PAINT_PROPERTIES.map((property) => [property, computed.getPropertyValue(property)]);
    });
    elements.forEach((element, index) => {
      for (const [property, value] of styles[index]) element.style.setProperty(property, value);
      element.removeAttribute("class");
    });
    const box = svg.querySelector("g")!.getBBox();
    const frame = { x: box.x - MARGIN, y: box.y - MARGIN, w: box.width + MARGIN * 2, h: box.height + MARGIN * 2 };
    svg.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.w} ${frame.h}`);
    svg.setAttribute("width", String(frame.w));
    svg.setAttribute("height", String(frame.h));
    if (background) {
      const fill = document.createElementNS(SVG_NS, "rect");
      for (const [name, value] of Object.entries({ x: frame.x, y: frame.y, width: frame.w, height: frame.h, fill: background })) fill.setAttribute(name, String(value));
      svg.prepend(fill);
    }
    return { text: new XMLSerializer().serializeToString(svg), w: frame.w, h: frame.h };
  } finally {
    void unmount(drawing);
    host.remove();
  }
}
