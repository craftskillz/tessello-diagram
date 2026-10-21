import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { layoutArrows, pointAlong } from "../src/lib/arrows.ts";
import { COLORS, type Diagram, newArrow, newDiagram, newShape } from "../src/lib/diagram.ts";
import { fileNameOf, toDrawio } from "../src/lib/drawio.ts";
import type { ShapeLibrary } from "../src/lib/library.ts";

/** The attributes of the cell of an id, and what it holds, read from the XML with a pattern: Node has no DOMParser. */
function cellOf(xml: string, id: string): { attributes: Record<string, string>; inner: string } {
  const match = xml.match(new RegExp(`<mxCell id="${id}"([^>]*?)(?:/>|>(.*?)</mxCell>)`));
  assert.ok(match, `no cell ${id}`);
  const attributes = Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
  return { attributes, inner: match[2] ?? "" };
}

/** The properties of a draw.io style, `key=value;` by `key`, and its bare words, such as `ellipse`, as `true`. */
const parseStyle = (style: string): Record<string, string | true> =>
  Object.fromEntries(style.split(";").filter(Boolean).map((part) => (part.includes("=") ? [part.slice(0, part.indexOf("=")), part.slice(part.indexOf("=") + 1)] : [part, true])));

const geometryOf = (inner: string) => Object.fromEntries([...(inner.match(/<mxGeometry([^>]*)/)?.[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));

const convert = (diagram: Diagram) => toDrawio(diagram, [], {});

describe("converting a diagram to draw.io", () => {
  test("a rectangle is a vertex at its top-left corner, with its text, its colors and its rotation", () => {
    const diagram = newDiagram("d1", "Checkout", 0);
    diagram.shapes = [{ ...newShape("api", { x: 100, y: 50 }, 0), text: "API & <web>", color: "c-blue", rotation: 30, opacity: 0.5, fontSize: 18 }];
    const { xml } = convert(diagram);
    const { attributes, inner } = cellOf(xml, "api");
    assert.equal(attributes.vertex, "1");
    assert.equal(attributes.parent, "1");
    assert.equal(attributes.value, "API &amp;amp; &amp;lt;web&amp;gt;");
    assert.deepEqual(geometryOf(inner), { x: "40", y: "20", width: "120", height: "60", as: "geometry" });
    const style = parseStyle(attributes.style);
    assert.equal(style.rounded, "1");
    assert.equal(style.fillColor, "#dbeafe");
    assert.equal(style.strokeColor, "#3b82f6");
    assert.equal(style.fontColor, "#1e40af");
    assert.equal(style.fillOpacity, "50");
    assert.equal(style.rotation, "30");
    assert.equal(style.fontSize, "18");
  });

  test("each key of the palette takes the colors of its light variant in base.css", () => {
    const css = readFileSync(new URL("../src/lib/base.css", import.meta.url), "utf8");
    const diagram = newDiagram("d1", "Palette", 0);
    diagram.shapes = COLORS.map((color, z) => ({ ...newShape(color, { x: 0, y: 0 }, z), color }));
    const { xml } = convert(diagram);
    for (const color of COLORS) {
      const light = css.match(new RegExp(`^\\.${color} \\{ --fill: (#\\w+); --stroke: (#\\w+); --text: (#\\w+); \\}`, "m"));
      assert.ok(light, `no light variant of ${color} in base.css`);
      const style = parseStyle(cellOf(xml, color).attributes.style);
      assert.deepEqual([style.fillColor, style.strokeColor, style.fontColor], light.slice(1), color);
    }
  });

  test("each built-in shape takes the draw.io shape that looks like it", () => {
    const diagram = newDiagram("d1", "Shapes", 0);
    diagram.shapes = [
      newShape("ellipse", { x: 0, y: 0 }, 0, "ellipse"),
      { ...newShape("circle", { x: 0, y: 0 }, 1, "circle"), w: 80, h: 60 },
      newShape("database", { x: 0, y: 0 }, 2, "database"),
      newShape("actor", { x: 0, y: 0 }, 3, "actor"),
      newShape("postit", { x: 0, y: 0 }, 4, "postit"),
      newShape("text", { x: 0, y: 0 }, 5, "text"),
    ];
    const { xml } = convert(diagram);
    const style = (id: string) => parseStyle(cellOf(xml, id).attributes.style);
    assert.equal(style("ellipse").ellipse, true);
    // A circle is as wide as the smaller side of its box, around its center.
    assert.equal(style("circle").ellipse, true);
    assert.equal(style("circle").aspect, "fixed");
    assert.deepEqual(geometryOf(cellOf(xml, "circle").inner), { x: "-30", y: "-30", width: "60", height: "60", as: "geometry" });
    assert.equal(style("database").shape, "cylinder3");
    // The lids of a database 80 high are 9.6 high (geometry.ts).
    assert.equal(style("database").size, "9.6");
    assert.equal(style("actor").shape, "umlActor");
    assert.equal(style("actor").verticalLabelPosition, "bottom");
    assert.equal(style("postit").shape, "note");
    assert.equal(style("text").text, true);
    assert.equal(style("text").fillColor, "none");
    assert.equal(style("text").strokeColor, "none");
  });

  test("an arrow joins its shapes at their ports, through its waypoints, and a free end is a point", () => {
    const diagram = newDiagram("d1", "Arrows", 0);
    diagram.shapes = [newShape("api", { x: 0, y: 0 }, 0), newShape("db", { x: 300, y: 0 }, 1, "database"), newShape("web", { x: 0, y: 200 }, 2)];
    diagram.arrows = [
      { ...newArrow("a1", { shapeId: "api", port: "E" }, { shapeId: "db", port: "NW" }, 3), waypoints: [{ x: 150, y: -40 }, { x: 200, y: -40 }], heads: "both", dashed: true, width: 3, color: "c-red" },
      newArrow("a2", { shapeId: "web", port: null }, { x: 400, y: 250 }, 4),
    ];
    const { xml } = convert(diagram);
    const a1 = cellOf(xml, "a1");
    assert.equal(a1.attributes.edge, "1");
    assert.equal(a1.attributes.source, "api");
    assert.equal(a1.attributes.target, "db");
    const style = parseStyle(a1.attributes.style);
    assert.deepEqual([style.exitX, style.exitY, style.exitPerimeter], ["1", "0.5", "0"]);
    // The north-west port of a database 60 × 80 is where its left side meets its upper lid, 9.6 below its top.
    assert.deepEqual([style.entryX, style.entryY, style.entryPerimeter], ["0", "0.12", "0"]);
    assert.deepEqual([style.startArrow, style.endArrow], ["classic", "classic"]);
    assert.equal(style.dashed, "1");
    assert.equal(style.strokeWidth, "3");
    assert.equal(style.strokeColor, "#ef4444");
    assert.match(a1.inner, /<Array as="points"><mxPoint x="150" y="-40"\/><mxPoint x="200" y="-40"\/><\/Array>/);

    const a2 = cellOf(xml, "a2");
    assert.equal(a2.attributes.source, "web");
    assert.equal(a2.attributes.target, undefined);
    // An automatic end leaves from the outline, where draw.io puts it.
    assert.equal(parseStyle(a2.attributes.style).exitX, undefined);
    assert.match(a2.inner, /<mxPoint x="400" y="250" as="targetPoint"\/>/);
    assert.deepEqual([parseStyle(a2.attributes.style).startArrow, parseStyle(a2.attributes.style).endArrow], ["none", "classic"]);
  });

  test("an arrow takes the edge style of its route: straight, elbow or curved", () => {
    const diagram = newDiagram("d1", "Routes", 0);
    diagram.shapes = [newShape("api", { x: 0, y: 0 }, 0), newShape("db", { x: 300, y: 100 }, 1)];
    const between = (id: string, route: "straight" | "curved" | "elbow", z: number) => ({ ...newArrow(id, { shapeId: "api", port: null }, { shapeId: "db", port: null }, z), route });
    diagram.arrows = [between("straight", "straight", 2), between("elbow", "elbow", 3), between("curved", "curved", 4)];
    const { xml } = convert(diagram);
    const style = (id: string) => parseStyle(cellOf(xml, id).attributes.style);
    assert.equal(style("straight").edgeStyle, "none");
    assert.equal(style("straight").curved, undefined);
    assert.equal(style("elbow").edgeStyle, "orthogonalEdgeStyle");
    assert.equal(style("curved").curved, "1");
    assert.match(cellOf(xml, "curved").inner, /<Array as="points"><mxPoint [^>]+\/><\/Array>/);
  });

  test("a curve without waypoints bends in draw.io through the middle of the curve the canvas draws", () => {
    const diagram = newDiagram("d1", "Curve", 0);
    diagram.arrows = [{ ...newArrow("c", { x: 0, y: 0 }, { x: 200, y: 0 }, 0), route: "curved" }];
    const { xml } = convert(diagram);
    const [x, y] = [...cellOf(xml, "c").inner.matchAll(/<mxPoint x="([^"]+)" y="([^"]+)"\/>/g)].map((match) => [Number(match[1]), Number(match[2])])[0];
    // draw.io draws one quadratic piece whose point is its control point: its middle is halfway between that point and the middle of the chord.
    const middle = { x: (x + 100) / 2, y: y / 2 };
    const drawn = pointAlong(layoutArrows(new Map(), diagram.arrows).get("c")!, 0.5);
    assert.ok(Math.abs(middle.x - drawn.x) < 0.01 && Math.abs(middle.y - drawn.y) < 0.01, `${JSON.stringify(middle)} is not ${JSON.stringify(drawn)}`);
    assert.ok(Math.abs(drawn.y) > 10, "the curve bends");
  });

  test("the label of an arrow is a cell on it, at its place along the line and aside, turned and sized as it is", () => {
    const diagram = newDiagram("d1", "Labels", 0);
    diagram.arrows = [
      { ...newArrow("a1", { x: 0, y: 0 }, { x: 200, y: 0 }, 0), label: "reads\nwrites", labelAt: 0.25, labelOffset: 12, labelRotation: 45, labelSize: 16, labelWidth: 80 },
      newArrow("a2", { x: 0, y: 100 }, { x: 200, y: 100 }, 1),
    ];
    const { xml, droppedRotations } = convert(diagram);
    const { attributes, inner } = cellOf(xml, "a1-label");
    assert.equal(attributes.parent, "a1");
    assert.equal(attributes.vertex, "1");
    assert.equal(attributes.value, "reads&lt;br&gt;writes");
    const style = parseStyle(attributes.style);
    assert.equal(style.edgeLabel, true);
    assert.equal(style.rotation, "45");
    assert.equal(style.fontSize, "16");
    assert.equal(style.whiteSpace, "wrap");
    // draw.io places it from −1 at the start of the line to 1 at its end, and aside counterclockwise: 12 below a line going right is −12.
    assert.deepEqual(geometryOf(inner), { x: "-0.5", y: "-12", width: "80", relative: "1", as: "geometry" });
    // An arrow without a label has no label cell.
    assert.doesNotMatch(xml, /id="a2-label"/);
    // A label of an arrow turns in draw.io: nothing is lost.
    assert.equal(droppedRotations, 0);
  });

  test("a group is a cell around its members, which are placed within it", () => {
    const diagram = newDiagram("d1", "Groups", 0);
    diagram.shapes = [
      { ...newShape("api", { x: 0, y: 0 }, 0), groupId: "g1" },
      newShape("alone", { x: 0, y: 300 }, 1),
      { ...newShape("db", { x: 200, y: 100 }, 2), groupId: "g1" },
    ];
    diagram.arrows = [newArrow("a1", { shapeId: "api", port: null }, { shapeId: "db", port: null }, 3)];
    const { xml } = convert(diagram);
    const group = cellOf(xml, "g1");
    assert.equal(parseStyle(group.attributes.style).group, true);
    assert.equal(group.attributes.parent, "1");
    // From the top-left corner of the first member to the bottom-right corner of the last.
    assert.deepEqual(geometryOf(group.inner), { x: "-60", y: "-30", width: "320", height: "160", as: "geometry" });
    assert.equal(cellOf(xml, "api").attributes.parent, "g1");
    assert.deepEqual(geometryOf(cellOf(xml, "db").inner), { x: "200", y: "100", width: "120", height: "60", as: "geometry" });
    assert.equal(cellOf(xml, "alone").attributes.parent, "1");
    // A parent comes before its children, which draw.io draws with it.
    assert.ok(xml.indexOf('id="g1"') < xml.indexOf('id="api"'));
    assert.equal(cellOf(xml, "a1").attributes.parent, "1");
  });

  test("an image embeds its picture as a data URL, and a custom shape that of its definition, with its anchors and where its text goes", () => {
    const diagram = newDiagram("d1", "Images", 0);
    const libraries: ShapeLibrary[] = [
      {
        id: "lib",
        name: "Cloud",
        shapes: [{ id: "bucket", name: "Bucket", imageKey: "image:b", width: 64, height: 64, labelPlacement: "below", showInDiagram: true, anchors: [{ id: "top", x: 0.25, y: 0 }] }],
      },
    ];
    diagram.shapes = [
      { ...newShape("photo", { x: 0, y: 0 }, 0, "image"), imageKey: "image:p", opacity: 0.4 },
      { ...newShape("lost", { x: 0, y: 0 }, 1, "image"), imageKey: "image:gone" },
      { ...newShape("bucket1", { x: 300, y: 0 }, 2, "custom"), text: "Logs", customShapeRef: { libraryId: "lib", shapeId: "bucket", name: "Bucket" }, labelPlacement: "right" },
      { ...newShape("orphan", { x: 600, y: 0 }, 3, "custom"), customShapeRef: { libraryId: "lib", shapeId: "deleted", name: "Queue" }, labelPlacement: "below" },
    ];
    diagram.arrows = [newArrow("a1", { shapeId: "photo", port: null }, { shapeId: "bucket1", port: "top" }, 4)];
    const { xml } = toDrawio(diagram, libraries, { "image:p": "data:image/webp;base64,UklGRg==", "image:b": "data:image/svg+xml;base64,PHN2Zy8+", "image:gone": null });
    const style = (id: string) => parseStyle(cellOf(xml, id).attributes.style);

    // draw.io splits a style at each `;`: the data URL takes its comma form.
    assert.equal(style("photo").shape, "image");
    assert.equal(style("photo").image, "data:image/webp,UklGRg==");
    assert.equal(style("photo").opacity, "40");
    assert.equal(style("bucket1").image, "data:image/svg+xml,PHN2Zy8+");
    assert.deepEqual([style("bucket1").labelPosition, style("bucket1").align], ["right", "left"]);
    assert.deepEqual([parseStyle(cellOf(xml, "a1").attributes.style).entryX, parseStyle(cellOf(xml, "a1").attributes.style).entryY], ["0.25", "0"]);
    // A picture missing from the storage, or a custom shape whose definition is deleted, is a dashed frame, with its name.
    assert.equal(style("lost").shape, undefined);
    assert.equal(style("lost").dashed, "1");
    assert.equal(style("orphan").dashed, "1");
    assert.equal(cellOf(xml, "orphan").attributes.value, "Queue");
  });

  test("counts the texts turned apart from their shape, which draw.io cannot turn", () => {
    const diagram = newDiagram("d1", "Rotations", 0);
    diagram.shapes = [{ ...newShape("a", { x: 0, y: 0 }, 0), textRotation: 90 }, { ...newShape("b", { x: 0, y: 0 }, 1), rotation: 30 }, { ...newShape("c", { x: 0, y: 0 }, 2), textRotation: 360 }];
    assert.equal(convert(diagram).droppedRotations, 1);
  });
});

describe("the name of an exported file", () => {
  test("is the title cleaned of what a file name cannot hold, with its letters and accents kept", () => {
    assert.equal(fileNameOf("Schéma : API / base", "drawio"), "Schéma_API_base.drawio");
    assert.equal(fileNameOf("  checkout v2.1 ", "png"), "checkout_v2.1.png");
  });

  test("is “diagram” for a title with nothing left, and at most 80 characters before its extension", () => {
    assert.equal(fileNameOf("???", "png"), "diagram.png");
    assert.equal(fileNameOf("a".repeat(200), "png"), `${"a".repeat(80)}.png`);
  });
});
