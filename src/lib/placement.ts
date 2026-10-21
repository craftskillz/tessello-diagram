// Where shapes land when they are moved, and what the view shows: the grid they snap to, the guides that line them up
// with the other shapes, and the zoom that fits the drawing in the canvas. Pure functions, in units of the drawing.

import { type Box, cornersOf, type Point } from "./geometry.ts";

/** The step of the grid, in units of the drawing. */
export const GRID = 20;

/** The nearest crossing of the grid. */
export const snapToGrid = ({ x, y }: Point): Point => ({ x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID });

/** An upright rectangle, by its top-left corner and its size. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The upright rectangle that holds every box, turned as it is; none for no box. */
export function boundsOf(boxes: readonly Box[]): Bounds | null {
  return pointsBounds(boxes.flatMap(cornersOf));
}

/** The upright rectangle that holds every point; none for no point. */
export function pointsBounds(points: readonly Point[]): Bounds | null {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The boxes of a group resized from bounds `from` to bounds `to`: each keeps its place and its size within the bounds,
 * its width and height scaled along its own sides.
 */
export function scaleBoxes<B extends Box>(boxes: readonly B[], from: Bounds, to: Bounds): B[] {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  return boxes.map((box) => {
    // A box turned by a quarter turn has its width along the height of the group.
    const across = Math.abs(Math.sin((box.rotation * Math.PI) / 180)) > Math.SQRT1_2;
    return {
      ...box,
      x: to.x + (box.x - from.x) * sx,
      y: to.y + (box.y - from.y) * sy,
      w: box.w * (across ? sy : sx),
      h: box.h * (across ? sx : sy),
    };
  });
}

/** A guide drawn while a shape lines up with another: a line across `axis` at `at`, from `from` to `to` along the other axis. */
export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/** The edges and the center of a rectangle along an axis. */
const linesOf = (bounds: Bounds, axis: "x" | "y"): number[] => {
  const [start, size] = axis === "x" ? [bounds.x, bounds.w] : [bounds.y, bounds.h];
  return [start, start + size / 2, start + size];
};

/**
 * How far the moving rectangle shifts, on each axis, to line one of its edges or its center up with an edge or the
 * center of another shape within `reach`, the nearest winning; null on an axis where none is within reach. A guide
 * shows each alignment, across both rectangles.
 */
export function alignment(moving: Bounds, others: readonly Bounds[], reach: number): { dx: number | null; dy: number | null; guides: Guide[] } {
  const guides: Guide[] = [];
  const shiftOn = (axis: "x" | "y"): number | null => {
    let best: { shift: number; other: Bounds; at: number } | null = null;
    for (const other of others)
      for (const target of linesOf(other, axis))
        for (const line of linesOf(moving, axis)) {
          const shift = target - line;
          if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, other, at: target };
        }
    if (!best) return null;
    const across = axis === "x" ? "y" : "x";
    const size = across === "x" ? "w" : "h";
    const ends = [moving[across], moving[across] + moving[size], best.other[across], best.other[across] + best.other[size]];
    guides.push({ axis, at: best.at, from: Math.min(...ends), to: Math.max(...ends) });
    return best.shift;
  };
  return { dx: shiftOn("x"), dy: shiftOn("y"), guides };
}

/** The zoom at which a drawing fits the canvas, at most its real size. */
const FIT_MAX = 1;

/**
 * The zoom and the pan (in pixels of the screen) that show the whole content in a canvas of `viewport` pixels, within
 * `margin` pixels of its edges, and centered. Small content stays at its real size.
 */
export function fitView(content: Bounds, viewport: { w: number; h: number }, margin: number): { zoom: number; pan: Point } {
  const zoom = Math.min(FIT_MAX, (viewport.w - margin * 2) / (content.w || 1), (viewport.h - margin * 2) / (content.h || 1));
  return {
    zoom,
    pan: { x: viewport.w / 2 - (content.x + content.w / 2) * zoom, y: viewport.h / 2 - (content.y + content.h / 2) * zoom },
  };
}
