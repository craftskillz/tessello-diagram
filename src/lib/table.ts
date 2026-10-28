// The cells of a table: a grid of text, as a pure function of its shape (diagram.ts). Its rows are all as high as one
// another, its columns have their own widths, kept as parts of the width of the table, so that resizing the table keeps
// their proportions. What each function computes is the new box of the table, the center, the size and the widths of its
// columns, to be applied to the shape. The coordinates "in the frame" are those from its center, without its rotation.

import { clampFontSize, type Shape } from "./diagram.ts";
import { type Corner, cornerSign, type Point, rotate } from "./geometry.ts";

/** The smallest width of a column, in units of the drawing. */
export const MIN_COLUMN = 24;

/** The most rows or columns a table has. */
export const MAX_CELLS = 50;

/** The lowest a row can be, in units of the drawing. */
export const MIN_ROW = 12;

/** The x of each boundary between the columns, from the left side of the table to its right side, in its frame. */
export function columnEdges(shape: Shape): number[] {
  const { columns } = tableOf(shape);
  let x = -shape.w / 2;
  return [x, ...columns.map((part) => (x += part * shape.w))].map((edge, i, edges) => (i === edges.length - 1 ? shape.w / 2 : edge));
}

/** The cells and the column widths of a table; those a shape without them would have, one cell, for safety. */
export function tableOf(shape: Shape): { cells: string[][]; columns: number[] } {
  const cells = shape.cells?.length && shape.cells[0].length ? shape.cells : [[""]];
  const count = cells[0].length;
  const columns = shape.columns?.length === count ? shape.columns : Array.from({ length: count }, () => 1 / count);
  return { cells, columns };
}

/** The box of a cell around its own center, in the frame of the table. */
export function cellBox(shape: Shape, row: number, col: number): { x: number; y: number; w: number; h: number } {
  const edges = columnEdges(shape);
  const h = shape.h / tableOf(shape).cells.length;
  return { x: (edges[col] + edges[col + 1]) / 2, y: -shape.h / 2 + (row + 0.5) * h, w: edges[col + 1] - edges[col], h };
}

/** The cell a point of the drawing is in, whatever the rotation of the table; none outside it. */
export function cellAt(shape: Shape, point: Point): { row: number; col: number } | undefined {
  const local = rotate({ x: point.x - shape.x, y: point.y - shape.y }, -shape.rotation);
  if (Math.abs(local.x) > shape.w / 2 || Math.abs(local.y) > shape.h / 2) return undefined;
  const edges = columnEdges(shape);
  const rows = tableOf(shape).cells.length;
  const col = Math.max(0, edges.findIndex((edge, i) => i > 0 && local.x <= edge) - 1);
  const row = Math.min(rows - 1, Math.floor(((local.y + shape.h / 2) / shape.h) * rows));
  return { row, col };
}

/** The box of a table, the widths of its columns, and when its cells change, its cells: what a change of the table sets on its shape. */
export interface TableChange {
  x: number;
  y: number;
  w: number;
  h: number;
  columns: number[];
  cells: string[][];
}

const countWithin = (count: number): number => Math.min(MAX_CELLS, Math.max(1, Math.round(count)));

/** The center of a table whose box grows by (`dx`, `dy`) in its frame with its top-left corner fixed. */
function growFromCorner(shape: Shape, dx: number, dy: number): Point {
  const shift = rotate({ x: dx / 2, y: dy / 2 }, shape.rotation);
  return { x: shape.x + shift.x, y: shape.y + shift.y };
}

/**
 * The table with `count` columns. The columns added are each as wide as the average one and are empty, the columns
 * removed are the last; the table widens or narrows by their width, its left side fixed.
 */
export function setColumnCount(shape: Shape, count: number): TableChange {
  const { cells, columns } = tableOf(shape);
  const next = countWithin(count);
  const widths = columns.map((part) => part * shape.w);
  const average = shape.w / columns.length;
  const kept = [...widths.slice(0, next), ...Array.from({ length: Math.max(0, next - widths.length) }, () => average)];
  const w = kept.reduce((sum, width) => sum + width, 0);
  return {
    ...growFromCorner(shape, w - shape.w, 0),
    w,
    h: shape.h,
    columns: kept.map((width) => width / w),
    cells: cells.map((row) => Array.from({ length: next }, (_, col) => row[col] ?? "")),
  };
}

/**
 * The table with `count` rows. The rows added are empty and as high as the current ones, the rows removed are the last;
 * the table grows or shrinks by their height, its top side fixed.
 */
export function setRowCount(shape: Shape, count: number): TableChange {
  const { cells, columns } = tableOf(shape);
  const next = countWithin(count);
  const h = (shape.h / cells.length) * next;
  return {
    ...growFromCorner(shape, 0, h - shape.h),
    w: shape.w,
    h,
    columns,
    cells: Array.from({ length: next }, (_, row) => cells[row] ?? columns.map(() => "")),
  };
}

/**
 * The table whose separator after column `index` is dragged by `dx` along its own x axis (in the frame, not on the
 * screen): only that column changes, by as much as the minimum width allows, and the table widens or narrows by the
 * same, its left side fixed. The last column's separator is the right side of the table.
 */
export function dragSeparator(shape: Shape, index: number, dx: number): TableChange {
  const { cells, columns } = tableOf(shape);
  const widths = columns.map((part) => part * shape.w);
  const applied = Math.max(MIN_COLUMN, widths[index] + dx) - widths[index];
  widths[index] += applied;
  const w = shape.w + applied;
  return { ...growFromCorner(shape, applied, 0), w, h: shape.h, columns: widths.map((width) => width / w), cells };
}

/** The smallest width of a table: its narrowest column at its minimum width. */
const minWidth = (shape: Shape): number => MIN_COLUMN / Math.min(...tableOf(shape).columns);
/** The smallest height of a table: all its rows at their minimum height. */
const minHeight = (shape: Shape): number => tableOf(shape).cells.length * MIN_ROW;

/** What resizing sets on a table shape: its box, and its font size when the resizing scales it. */
export type TableResize = Omit<TableChange, "cells"> & { fontSize?: number };

/** The box of a table `w` × `h`, whose side or corner of the signs (`sx`, `sy`) was dragged: the opposite one stays, or the center. */
function resized(shape: Shape, w: number, h: number, sx: number, sy: number, fromCenter: boolean): Omit<TableResize, "fontSize"> {
  const columns = tableOf(shape).columns;
  if (fromCenter) return { x: shape.x, y: shape.y, w, h, columns };
  const shift = rotate({ x: (sx * (w - shape.w)) / 2, y: (sy * (h - shape.h)) / 2 }, shape.rotation);
  return { x: shape.x + shift.x, y: shape.y + shift.y, w, h, columns };
}

/**
 * The table whose side is dragged by `delta` (on screen, in units of the drawing): the opposite side stays, or the
 * center in the fixed center mode. The font size is unchanged, and the columns keep their relative widths.
 */
export function resizeSide(shape: Shape, side: "n" | "e" | "s" | "w", delta: Point, { fromCenter = false } = {}): TableResize {
  const local = rotate(delta, -shape.rotation);
  const grow = fromCenter ? 2 : 1;
  const sx = side === "e" ? 1 : side === "w" ? -1 : 0;
  const sy = side === "s" ? 1 : side === "n" ? -1 : 0;
  const w = Math.max(minWidth(shape), shape.w + sx * local.x * grow);
  const h = Math.max(minHeight(shape), shape.h + sy * local.y * grow);
  return resized(shape, w, h, sx, sy, fromCenter);
}

/**
 * The table whose corner is dragged by `delta`: it keeps its ratio, the larger change winning, and its font size is
 * scaled by the same factor from the one it had. The opposite corner stays, or the center in the fixed center mode.
 */
export function resizeCorner(shape: Shape, corner: Corner, delta: Point, { fromCenter = false } = {}): TableResize {
  const local = rotate(delta, -shape.rotation);
  const { x: sx, y: sy } = cornerSign(corner);
  const grow = fromCenter ? 2 : 1;
  const scale = Math.max(
    (shape.w + sx * local.x * grow) / shape.w,
    (shape.h + sy * local.y * grow) / shape.h,
    minWidth(shape) / shape.w,
    minHeight(shape) / shape.h,
  );
  return { ...resized(shape, shape.w * scale, shape.h * scale, sx, sy, fromCenter), fontSize: clampFontSize(shape.fontSize * scale) };
}
