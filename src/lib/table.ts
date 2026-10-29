// The cells of a table: a grid of text, as a pure function of its shape (diagram.ts). Its columns have their own
// widths and its rows their own heights, kept as parts of the width and height of the table, so that resizing the table
// keeps their proportions. What each function computes is the new box of the table, the center, the size and the widths
// and heights of its columns and rows, to be applied to the shape. The coordinates "in the frame" are those from its
// center, without its rotation.

import { type CellStyle, clampFontSize, type Shape } from "./diagram.ts";
import { type Anchor, type Corner, cornerSign, PORTS, type Point, rotate } from "./geometry.ts";

/** The smallest width of a column, in units of the drawing. */
export const MIN_COLUMN = 24;

/** The most rows or columns a table has. */
export const MAX_CELLS = 50;

/** The lowest a row can be, in units of the drawing. */
export const MIN_ROW = 12;

/** The boundaries of parts laid end to end along a side of `size` centered on 0, from one end to the other, the last exactly at the end. */
function edgesAlong(parts: number[], size: number): number[] {
  let at = -size / 2;
  return [at, ...parts.map((part) => (at += part * size))].map((edge, i, edges) => (i === edges.length - 1 ? size / 2 : edge));
}

/** The x of each boundary between the columns, from the left side of the table to its right side, in its frame. */
export const columnEdges = (shape: Shape): number[] => edgesAlong(tableOf(shape).columns, shape.w);

/** The y of each boundary between the rows, from the top side of the table to its bottom side, in its frame. */
export const rowEdges = (shape: Shape): number[] => edgesAlong(tableOf(shape).rows, shape.h);

/** The cells, the column widths, the row heights and the cell styles of a table; those a shape without them would have, one cell, for safety. */
export function tableOf(shape: Shape): { cells: string[][]; columns: number[]; rows: number[]; cellStyles: CellStyle[][] } {
  const cells = shape.cells?.length && shape.cells[0].length ? shape.cells : [[""]];
  const count = cells[0].length;
  const columns = shape.columns?.length === count ? shape.columns : Array.from({ length: count }, () => 1 / count);
  const rows = shape.rows?.length === cells.length ? shape.rows : Array.from({ length: cells.length }, () => 1 / cells.length);
  const cellStyles = cells.map((row, r) => row.map((_, c) => shape.cellStyles?.[r]?.[c] ?? {}));
  return { cells, columns, rows, cellStyles };
}

/** The style a cell shows: its own keys over those of the table. */
export function cellStyleOf(shape: Shape, row: number, col: number): Required<CellStyle> {
  const own = tableOf(shape).cellStyles[row]?.[col] ?? {};
  return {
    color: own.color ?? shape.color,
    fontSize: own.fontSize ?? shape.fontSize,
    bold: own.bold ?? shape.bold ?? false,
    italic: own.italic ?? shape.italic ?? false,
    underline: own.underline ?? shape.underline ?? false,
    textAlign: own.textAlign ?? shape.textAlign,
    textValign: own.textValign ?? shape.textValign,
  };
}

/** A rectangle of cells, by their indexes, the last ones included. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** The rectangle of cells spanning two cells, given in any order. */
export const rangeBetween = (a: { row: number; col: number }, b: { row: number; col: number }): CellRange => ({
  top: Math.min(a.row, b.row),
  left: Math.min(a.col, b.col),
  bottom: Math.max(a.row, b.row),
  right: Math.max(a.col, b.col),
});

/** All the cells of a table. */
export const wholeRange = (shape: Shape): CellRange => ({ top: 0, left: 0, bottom: tableOf(shape).cells.length - 1, right: tableOf(shape).columns.length - 1 });

/** All the cells of a row. */
export const rowRange = (shape: Shape, row: number): CellRange => ({ top: row, left: 0, bottom: row, right: tableOf(shape).columns.length - 1 });

/** All the cells of a column. */
export const columnRange = (shape: Shape, col: number): CellRange => ({ top: 0, left: col, bottom: tableOf(shape).cells.length - 1, right: col });

/** The part of a range that is in the table, or undefined when the table (after losing rows or columns) no longer has any of it. */
export function clipRange(shape: Shape, range: CellRange): CellRange | undefined {
  const { cells, columns } = tableOf(shape);
  const clipped = { top: range.top, left: range.left, bottom: Math.min(range.bottom, cells.length - 1), right: Math.min(range.right, columns.length - 1) };
  return clipped.top > clipped.bottom || clipped.left > clipped.right ? undefined : clipped;
}

/** Whether a cell is in a range. */
export const inRange = (range: CellRange, row: number, col: number): boolean =>
  row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;

/** The change with its font size, if any, within the limits of font sizes. */
const clampedChange = (change: CellStyle): CellStyle => (change.fontSize === undefined ? change : { ...change, fontSize: clampFontSize(change.fontSize) });

/** The styles of the cells once `change` is written over the own style of each cell of the range (clipped to the table); a new array, the shape is left as it is. */
export function styleCells(shape: Shape, range: CellRange, change: CellStyle): CellStyle[][] {
  const applied = clampedChange(change);
  return tableOf(shape).cellStyles.map((row, r) => row.map((style, c) => (inRange(range, r, c) ? { ...style, ...applied } : { ...style })));
}

/** What to assign on a table shape to style it as a whole: the change as its own style, and no own style left on any cell. */
export function styleTable(shape: Shape, change: CellStyle): Partial<Shape> {
  return { ...clampedChange(change), cellStyles: tableOf(shape).cellStyles.map((row) => row.map(() => ({}))) };
}

/** The value of a style key that every cell of the range shows, or undefined when they differ. */
export function sharedCellStyle<K extends keyof CellStyle>(shape: Shape, range: CellRange, key: K): Required<CellStyle>[K] | undefined {
  const { cells } = tableOf(shape);
  const values = new Set<Required<CellStyle>[K]>();
  cells.forEach((row, r) => row.forEach((_, c) => inRange(range, r, c) && values.add(cellStyleOf(shape, r, c)[key])));
  return values.size === 1 ? [...values][0] : undefined;
}

/** The box of a cell around its own center, in the frame of the table. */
export function cellBox(shape: Shape, row: number, col: number): { x: number; y: number; w: number; h: number } {
  const edges = columnEdges(shape);
  const tops = rowEdges(shape);
  return { x: (edges[col] + edges[col + 1]) / 2, y: (tops[row] + tops[row + 1]) / 2, w: edges[col + 1] - edges[col], h: tops[row + 1] - tops[row] };
}

/** The cell a point of the drawing is in, whatever the rotation of the table; none outside it. */
export function cellAt(shape: Shape, point: Point): { row: number; col: number } | undefined {
  const local = rotate({ x: point.x - shape.x, y: point.y - shape.y }, -shape.rotation);
  if (Math.abs(local.x) > shape.w / 2 || Math.abs(local.y) > shape.h / 2) return undefined;
  const edges = columnEdges(shape);
  const tops = rowEdges(shape);
  const col = Math.max(0, edges.findIndex((edge, i) => i > 0 && local.x <= edge) - 1);
  const row = Math.max(0, tops.findIndex((edge, i) => i > 0 && local.y <= edge) - 1);
  return { row, col };
}

/** An attachment point of a table: its cell, and its direction within the cell, are kept for the handles that offer it. */
export interface TableAnchor extends Anchor {
  facing: Point;
  row: number;
  col: number;
  direction: (typeof PORTS)[number];
}

/** The attachment points of one cell of a table: none for a cell inside it. */
export const cellAnchors = (shape: Shape, row: number, col: number): TableAnchor[] =>
  tableAnchors(shape).filter((anchor) => anchor.row === row && anchor.col === col);

/**
 * The attachment points of a table: those of each cell that lie on the outer border of the table, from north
 * clockwise in each cell, named `r1c2-NE` (row, column, direction within the cell, counted from 0). Neighbouring cells
 * have their own points where they meet, so that an arrow is attached to a cell, and an inner cell has none. They are
 * computed from the columns and rows as they are now, as parts of the width and height from the top-left corner, so that an
 * arrow follows its cell when a column or a row is resized, and from the box of the table, when it is moved, resized or turned. Each
 * faces outward from the side it lies on, diagonally at a corner of the table (its frame, before the rotation).
 */
export function tableAnchors(shape: Shape): TableAnchor[] {
  const { cells, columns, rows } = tableOf(shape);
  // Parts of the width and height from the top-left corner: the edges of a side of 1, shifted by a half.
  const edges = edgesAlong(columns, 1).map((edge) => edge + 0.5);
  const tops = edgesAlong(rows, 1).map((edge) => edge + 0.5);
  const anchors: TableAnchor[] = [];
  cells.forEach((_, row) => {
    columns.forEach((_, col) => {
      for (const port of PORTS) {
        const dx = port.includes("E") ? 1 : port.includes("W") ? -1 : 0;
        const dy = port.includes("S") ? 1 : port.includes("N") ? -1 : 0;
        const facing = {
          x: dx === 1 && col === columns.length - 1 ? 1 : dx === -1 && col === 0 ? -1 : 0,
          y: dy === 1 && row === rows.length - 1 ? 1 : dy === -1 && row === 0 ? -1 : 0,
        };
        if (facing.x === 0 && facing.y === 0) continue;
        const x = dx === 0 ? (edges[col] + edges[col + 1]) / 2 : edges[dx === 1 ? col + 1 : col];
        const y = dy === 0 ? (tops[row] + tops[row + 1]) / 2 : tops[dy === 1 ? row + 1 : row];
        anchors.push({ id: `r${row}c${col}-${port}`, x, y, facing, row, col, direction: port });
      }
    });
  });
  return anchors;
}

/** The box of a table, the widths of its columns, the heights of its rows, and when its cells change, its cells: what a change of the table sets on its shape. */
export interface TableChange {
  x: number;
  y: number;
  w: number;
  h: number;
  columns: number[];
  rows: number[];
  cells: string[][];
  cellStyles: CellStyle[][];
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
  const { cells, columns, rows, cellStyles } = tableOf(shape);
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
    rows,
    cells: cells.map((row) => Array.from({ length: next }, (_, col) => row[col] ?? "")),
    cellStyles: cellStyles.map((row) => Array.from({ length: next }, (_, col) => ({ ...row[Math.min(col, row.length - 1)] }))),
  };
}

/**
 * The table with `count` rows. The rows added are each as high as the average one and are empty, the rows removed are
 * the last; the table grows or shrinks by their height, its top side fixed.
 */
export function setRowCount(shape: Shape, count: number): TableChange {
  const { cells, columns, rows, cellStyles } = tableOf(shape);
  const next = countWithin(count);
  const heights = rows.map((part) => part * shape.h);
  const average = shape.h / rows.length;
  const kept = [...heights.slice(0, next), ...Array.from({ length: Math.max(0, next - heights.length) }, () => average)];
  const h = kept.reduce((sum, height) => sum + height, 0);
  return {
    ...growFromCorner(shape, 0, h - shape.h),
    w: shape.w,
    h,
    columns,
    rows: kept.map((height) => height / h),
    cells: Array.from({ length: next }, (_, row) => cells[row] ?? columns.map(() => "")),
    cellStyles: Array.from({ length: next }, (_, row) => cellStyles[Math.min(row, cellStyles.length - 1)].map((style) => ({ ...style }))),
  };
}

/**
 * The table whose separator after column `index` is dragged by `dx` along its own x axis (in the frame, not on the
 * screen): only that column changes, by as much as the minimum width allows, and the table widens or narrows by the
 * same, its left side fixed. The last column's separator is the right side of the table.
 */
export function dragSeparator(shape: Shape, index: number, dx: number): TableChange {
  const { cells, columns, rows, cellStyles } = tableOf(shape);
  const widths = columns.map((part) => part * shape.w);
  const applied = Math.max(MIN_COLUMN, widths[index] + dx) - widths[index];
  widths[index] += applied;
  const w = shape.w + applied;
  return { ...growFromCorner(shape, applied, 0), w, h: shape.h, columns: widths.map((width) => width / w), rows, cells, cellStyles };
}

/**
 * The table whose separator after row `index` is dragged by `dy` along its own y axis (in the frame, not on the
 * screen): only that row changes, by as much as the minimum height allows, and the table grows or shrinks by the same,
 * its top side fixed. The last row's separator is the bottom side of the table.
 */
export function dragRowSeparator(shape: Shape, index: number, dy: number): TableChange {
  const { cells, columns, rows, cellStyles } = tableOf(shape);
  const heights = rows.map((part) => part * shape.h);
  const applied = Math.max(MIN_ROW, heights[index] + dy) - heights[index];
  heights[index] += applied;
  const h = shape.h + applied;
  return { ...growFromCorner(shape, 0, applied), w: shape.w, h, columns, rows: heights.map((height) => height / h), cells, cellStyles };
}

/** The smallest width of a table: its narrowest column at its minimum width. */
const minWidth = (shape: Shape): number => MIN_COLUMN / Math.min(...tableOf(shape).columns);
/** The smallest height of a table: its lowest row at its minimum height. */
const minHeight = (shape: Shape): number => MIN_ROW / Math.min(...tableOf(shape).rows);

/** What resizing sets on a table shape: its box, and its font size and the own font sizes of its cells when the resizing scales them. */
export type TableResize = Omit<TableChange, "cells" | "cellStyles"> & { fontSize?: number; cellStyles?: CellStyle[][] };

/** The box of a table `w` × `h`, whose side or corner of the signs (`sx`, `sy`) was dragged: the opposite one stays, or the center. */
function resized(shape: Shape, w: number, h: number, sx: number, sy: number, fromCenter: boolean): Omit<TableResize, "fontSize" | "cellStyles"> {
  const { columns, rows } = tableOf(shape);
  if (fromCenter) return { x: shape.x, y: shape.y, w, h, columns, rows };
  const shift = rotate({ x: (sx * (w - shape.w)) / 2, y: (sy * (h - shape.h)) / 2 }, shape.rotation);
  return { x: shape.x + shift.x, y: shape.y + shift.y, w, h, columns, rows };
}

/**
 * The table whose side is dragged by `delta` (on screen, in units of the drawing): the opposite side stays, or the
 * center in the fixed center mode. The font size is unchanged, and the columns and rows keep their relative sizes.
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
  const cellStyles = tableOf(shape).cellStyles.map((row) =>
    row.map((style) => (style.fontSize === undefined ? { ...style } : { ...style, fontSize: clampFontSize(style.fontSize * scale) })),
  );
  return { ...resized(shape, shape.w * scale, shape.h * scale, sx, sy, fromCenter), fontSize: clampFontSize(shape.fontSize * scale), cellStyles };
}
