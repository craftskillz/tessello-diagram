// The creation defaults, one level of them, kept under the key `defaults`: the style a new arrow takes, and the size,
// text size and color a new shape of each built-in type takes. They change only what is created afterwards. Their
// factory values are the creation values of the model (diagram.ts).

import {
  ARROW_WIDTHS,
  type Arrow,
  BUILT_IN_TYPES,
  type BuiltInType,
  clampArrowWidth,
  clampFontSize,
  COLORS,
  FONT_SIZES,
  HEADS,
  isRecord,
  keepsRatio,
  newArrow,
  newShape,
  oneOf,
  ROUTES,
  type Shape,
  type StoredFields,
} from "./diagram.ts";
import type { Endpoint, Point } from "./geometry.ts";

/** The values a field of the defaults can take, bounds included. */
export interface Range {
  min: number;
  max: number;
}

/** The width and height a default can take. */
export const SIZES: Range = { min: 10, max: 800 };

/** Whether a value is a number within bounds. */
const within = (range: Range, value: unknown): value is number => typeof value === "number" && value >= range.min && value <= range.max;

/** What a new shape of a built-in type takes from the defaults. */
export type ShapeDefaults = Pick<Shape, "w" | "h" | "fontSize" | "color">;
/** What a new arrow takes from the defaults. */
export type ArrowDefaults = Pick<Arrow, "heads" | "dashed" | "labelSize" | "route" | "width" | "color">;

/** The creation defaults, as stored under `defaults`. */
export interface Defaults {
  arrows: ArrowDefaults;
  shapes: Record<BuiltInType, ShapeDefaults>;
}

const shapeDefaultsOf = ({ w, h, fontSize, color }: Shape): ShapeDefaults => ({ w, h, fontSize, color });
const arrowDefaultsOf = ({ heads, dashed, labelSize, route, width, color }: Arrow): ArrowDefaults => ({ heads, dashed, labelSize, route, width, color });

/** The values of a Module just installed, and of "Reset". */
export function factoryDefaults(): Defaults {
  const origin = { x: 0, y: 0 };
  return {
    arrows: arrowDefaultsOf(newArrow("", origin, origin, 0)),
    shapes: Object.fromEntries(BUILT_IN_TYPES.map((type) => [type, shapeDefaultsOf(newShape("", origin, 0, type))])) as Defaults["shapes"],
  };
}

const FACTORY = factoryDefaults();

/**
 * The height of a shape of a built-in type for a width: the circle and the actor keep their proportions; another type
 * has none to keep, and gives null.
 */
export function heightFor(type: BuiltInType, w: number): number | null {
  const factory = FACTORY.shapes[type];
  return keepsRatio(type) ? Math.round(((w * factory.h) / factory.w) * 10) / 10 : null;
}

/** Whether a width can be a default: within bounds, as the height that follows it for a circle or an actor. */
const widthWithin = (type: BuiltInType, w: unknown): w is number => within(SIZES, w) && within(SIZES, heightFor(type, w) ?? w);

/** A new shape of a built-in type, centered on a point, with the defaults of its type. */
export const createShape = (defaults: Defaults, id: string, at: Point, z: number, type: BuiltInType): Shape => ({
  ...newShape(id, at, z, type),
  ...defaults.shapes[type],
});

/** A new arrow between two ends, with the defaults of the arrows. */
export const createArrow = (defaults: Defaults, id: string, from: Endpoint, to: Endpoint, z: number): Arrow => ({
  ...newArrow(id, from, to, z),
  ...defaults.arrows,
});

/**
 * The fields of the "Diagram defaults" dialog out of their bounds, such as `shapes.rect.w` or `arrows.labelSize`: an
 * empty field is out of them. The dialog saves nothing while there is one.
 */
export function outOfBounds(form: Defaults): string[] {
  const out = (path: string, range: Range, value: unknown) => (within(range, value) ? [] : [path]);
  return [
    ...out("arrows.labelSize", FONT_SIZES, form.arrows.labelSize),
    ...out("arrows.width", ARROW_WIDTHS, form.arrows.width),
    ...BUILT_IN_TYPES.flatMap((type) => [
      ...(widthWithin(type, form.shapes[type].w) ? [] : [`shapes.${type}.w`]),
      ...(keepsRatio(type) ? [] : out(`shapes.${type}.h`, SIZES, form.shapes[type].h)),
      ...out(`shapes.${type}.fontSize`, FONT_SIZES, form.shapes[type].fontSize),
    ]),
  ];
}

/** Whether a shape is drawn by a tool of the toolbar, and so has defaults: not an image nor a custom shape. */
export const isBuiltIn = (shape: Shape): shape is Shape & { type: BuiltInType } => (BUILT_IN_TYPES as readonly string[]).includes(shape.type);

/** The nearest value within bounds. */
const clamp = (range: Range, value: number) => Math.min(range.max, Math.max(range.min, value));

/**
 * "Save as default for this shape type": the size, text size and color of a built-in shape become the defaults of its
 * type, a size out of their bounds at the nearest one. Any other shape changes nothing.
 */
export function shapeAsDefault(defaults: Defaults, shape: Shape): Defaults {
  if (!isBuiltIn(shape)) return defaults;
  const values = { ...shapeDefaultsOf(shape), w: clamp(SIZES, shape.w), h: clamp(SIZES, shape.h) };
  return readDefaults({ ...defaults, shapes: { ...defaults.shapes, [shape.type]: values } });
}

/** "Save as default for arrows": the style of an arrow becomes the defaults of the arrows. */
export const arrowAsDefault = (defaults: Defaults, arrow: Arrow): Defaults => readDefaults({ ...defaults, arrows: arrowDefaultsOf(arrow) });

/**
 * The defaults stored under `defaults`, read defensively: a value missing, of another kind or out of its bounds takes
 * its factory value, and the others are kept. The circle and the actor keep their proportions, from their width.
 */
export function readDefaults(value: unknown): Defaults {
  const factory = FACTORY;
  const stored = isRecord(value) ? value : {};
  const arrows = isRecord(stored.arrows) ? stored.arrows : {};
  const shapes = isRecord(stored.shapes) ? stored.shapes : {};
  return {
    arrows: {
      heads: oneOf(HEADS, arrows.heads, factory.arrows.heads),
      dashed: typeof arrows.dashed === "boolean" ? arrows.dashed : factory.arrows.dashed,
      labelSize: within(FONT_SIZES, arrows.labelSize) ? clampFontSize(arrows.labelSize) : factory.arrows.labelSize,
      route: oneOf(ROUTES, arrows.route, factory.arrows.route),
      width: within(ARROW_WIDTHS, arrows.width) ? clampArrowWidth(arrows.width) : factory.arrows.width,
      color: oneOf(COLORS, arrows.color, factory.arrows.color),
    },
    shapes: Object.fromEntries(
      BUILT_IN_TYPES.map((type) => [type, readShapeDefaults(type, isRecord(shapes[type]) ? shapes[type] : {}, factory.shapes[type])]),
    ) as Defaults["shapes"],
  };
}

/** The defaults of a built-in type, read as `readDefaults` does. */
function readShapeDefaults(type: BuiltInType, stored: StoredFields, factory: ShapeDefaults): ShapeDefaults {
  const w = widthWithin(type, stored.w) ? stored.w : factory.w;
  return {
    w,
    h: heightFor(type, w) ?? (within(SIZES, stored.h) ? stored.h : factory.h),
    fontSize: within(FONT_SIZES, stored.fontSize) ? clampFontSize(stored.fontSize) : factory.fontSize,
    color: oneOf(COLORS, stored.color, factory.color),
  };
}
