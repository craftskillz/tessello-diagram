import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyStyle, CLIP_TYPE, copyItems, copyStyle, imageToPaste, markClipboard, pasteItems } from "../src/lib/clipboard.ts";
import { type Diagram, newArrow, newDiagram, newShape } from "../src/lib/diagram.ts";

/** Two grouped shapes joined by an arrow, a third shape, an arrow toward it and a free arrow. */
function sample(): Diagram {
  const diagram = newDiagram("d1", "Checkout", 0);
  const api = { ...newShape("api", { x: 0, y: 0 }, 0), text: "API", groupId: "g1" };
  const db = { ...newShape("db", { x: 200, y: 0 }, 1, "database"), groupId: "g1" };
  const web = newShape("web", { x: 0, y: 200 }, 2);
  diagram.shapes = [api, db, web];
  diagram.arrows = [
    { ...newArrow("a1", { shapeId: "api", port: "E" }, { shapeId: "db", port: null }, 3), waypoints: [{ x: 100, y: -50 }], label: "reads" },
    newArrow("a2", { shapeId: "web", port: null }, { shapeId: "api", port: null }, 4),
    newArrow("a3", { x: 400, y: 400 }, { x: 500, y: 400 }, 5),
  ];
  return diagram;
}

let counter = 0;
const ids = (prefix: string) => `${prefix}-new${++counter}`;

describe("copying a selection", () => {
  test("takes the selected shapes and the arrows whose two ends are in it", () => {
    const clip = copyItems(sample(), ["api", "db"]);
    assert.deepEqual(clip.shapes.map((shape) => shape.id), ["api", "db"]);
    assert.deepEqual(clip.arrows.map((arrow) => arrow.id), ["a1"]);
  });

  test("takes a selected free arrow, but not a selected arrow toward a shape left out", () => {
    const clip = copyItems(sample(), ["api", "a2", "a3"]);
    assert.deepEqual(clip.arrows.map((arrow) => arrow.id), ["a3"]);
  });

  test("keeps what it copied as it was, whatever happens to the diagram after", () => {
    const diagram = sample();
    const clip = copyItems(diagram, ["api"]);
    diagram.shapes[0].text = "changed";
    assert.equal(clip.shapes[0].text, "API");
  });
});

describe("pasting", () => {
  test("adds new shapes, moved by the offset, and arrows joining the new shapes", () => {
    const diagram = sample();
    const pasted = pasteItems(diagram, copyItems(diagram, ["api", "db"]), 40, ids);
    assert.equal(diagram.shapes.length, 5);
    const [api, db] = diagram.shapes.slice(3);
    assert.deepEqual([api.text, api.x, api.y, db.type, db.x, db.y], ["API", 40, 40, "database", 240, 40]);
    const arrow = diagram.arrows[3];
    assert.deepEqual(arrow.from, { shapeId: api.id, port: "E" });
    assert.deepEqual(arrow.to, { shapeId: db.id, port: null });
    assert.deepEqual(arrow.waypoints, [{ x: 140, y: -10 }]);
    assert.equal(arrow.label, "reads");
    assert.deepEqual(pasted, [api.id, db.id, arrow.id]);
    assert.ok(![...pasted].some((id) => ["api", "db", "a1"].includes(id)));
  });

  test("a pasted group is a new group, apart from the original", () => {
    const diagram = sample();
    pasteItems(diagram, copyItems(diagram, ["api", "db"]), 40, ids);
    const [api, db] = diagram.shapes.slice(3);
    assert.equal(api.groupId, db.groupId);
    assert.notEqual(api.groupId, null);
    assert.notEqual(api.groupId, "g1");
  });

  test("each paste makes another new group", () => {
    const diagram = sample();
    const clip = copyItems(diagram, ["api", "db"]);
    pasteItems(diagram, clip, 40, ids);
    pasteItems(diagram, clip, 80, ids);
    assert.notEqual(diagram.shapes[3].groupId, diagram.shapes[5].groupId);
  });

  test("a member of a group copied alone is pasted out of any group, and a locked copy is pasted unlocked", async () => {
    const diagram = sample();
    diagram.shapes[0].locked = true;
    pasteItems(diagram, copyItems(diagram, ["api"]), 40, ids);
    assert.deepEqual([diagram.shapes[3].groupId, diagram.shapes[3].locked], [null, false]);
  });

  test("moves a free arrow by the offset, and puts what is pasted in front, in its order", () => {
    const diagram = sample();
    pasteItems(diagram, copyItems(diagram, ["a3", "web"]), 40, ids);
    const arrow = diagram.arrows[3];
    assert.deepEqual([arrow.from, arrow.to], [{ x: 440, y: 440 }, { x: 540, y: 440 }]);
    assert.deepEqual([diagram.shapes[3].z, arrow.z], [6, 7]);
    assert.equal(diagram.shapes[3].groupId, null);
  });
});

describe("copying a style", () => {
  test("a shape gives its color, opacity, text size and alignment, and its size when asked", () => {
    const source = { ...newShape("s", { x: 0, y: 0 }, 0), color: "c-blue", opacity: 0.5, fontSize: 20, textAlign: "left" as const, textValign: "top" as const, w: 300, h: 90 };
    const target = { ...newShape("t", { x: 500, y: 0 }, 1, "ellipse"), text: "kept" };
    applyStyle(copyStyle(source, false), [target], []);
    assert.deepEqual(
      [target.color, target.opacity, target.fontSize, target.textAlign, target.textValign, target.w, target.h, target.x, target.text],
      ["c-blue", 0.5, 20, "left", "top", 120, 60, 500, "kept"],
    );
    applyStyle(copyStyle(source, true), [target], []);
    assert.deepEqual([target.w, target.h, target.x], [300, 90, 500]);
  });

  test("an arrow gives its heads, line, width, color, label size and route", () => {
    const source = { ...newArrow("a", { x: 0, y: 0 }, { x: 10, y: 0 }, 0), heads: "both" as const, dashed: true, width: 4, color: "c-red", labelSize: 18, route: "elbow" as const };
    const target = { ...newArrow("b", { x: 0, y: 50 }, { x: 10, y: 50 }, 1), label: "kept", waypoints: [{ x: 5, y: 80 }] };
    applyStyle(copyStyle(source, false), [], [target]);
    assert.deepEqual(
      [target.heads, target.dashed, target.width, target.color, target.labelSize, target.route, target.label, target.waypoints],
      ["both", true, 4, "c-red", 18, "elbow", "kept", [{ x: 5, y: 80 }]],
    );
  });

  test("a shape gives its bold, italic and underline to every shape it is pasted on, whatever its type", () => {
    const source = { ...newShape("s", { x: 0, y: 0 }, 0, "table"), bold: true, underline: true };
    const target = { ...newShape("t", { x: 500, y: 0 }, 1, "table"), italic: true };
    const rect = { ...newShape("r", { x: 0, y: 200 }, 2), italic: true };
    applyStyle(copyStyle(source, false), [target, rect], []);
    assert.deepEqual([target.bold, target.italic, target.underline], [true, false, true]);
    assert.deepEqual([rect.bold, rect.italic, rect.underline], [true, false, true]);
  });

  test("a plain shape clears the text style of the shapes it is pasted on", () => {
    const text = { ...newShape("t", { x: 0, y: 0 }, 0, "text"), bold: true, italic: true, underline: true };
    applyStyle(copyStyle(newShape("r", { x: 0, y: 200 }, 1), false), [text], []);
    assert.deepEqual([text.bold, text.italic, text.underline], [false, false, false]);
  });

  test("applies only to what is of the same kind", () => {
    const arrowStyle = copyStyle({ ...newArrow("a", { x: 0, y: 0 }, { x: 10, y: 0 }, 0), color: "c-red" }, false);
    const shape = newShape("s", { x: 0, y: 0 }, 0);
    applyStyle(arrowStyle, [shape], []);
    assert.equal(shape.color, "c-gray");
  });

  test("keeps the style it copied, whatever happens to its source after", () => {
    const source = { ...newShape("s", { x: 0, y: 0 }, 0), color: "c-blue" };
    const style = copyStyle(source, false);
    source.color = "c-red";
    const target = newShape("t", { x: 0, y: 0 }, 0);
    applyStyle(style, [target], []);
    assert.equal(target.color, "c-blue");
  });
});

describe("a copied table", () => {
  test("is pasted with its own cells and column widths, apart from the original", () => {
    const diagram = newDiagram("d1", "Tables", 0);
    const table = { ...newShape("t1", { x: 0, y: 0 }, 0, "table"), cells: [["a", "b"], ["c", "d"]], columns: [0.25, 0.75] };
    diagram.shapes = [table];
    const [pasted] = pasteItems(diagram, copyItems(diagram, ["t1"]), 20, ids);
    const copy = diagram.shapes.find((shape) => shape.id === pasted)!;
    assert.deepEqual([copy.cells, copy.columns], [[["a", "b"], ["c", "d"]], [0.25, 0.75]]);
    copy.cells![0][0] = "changed";
    assert.equal(table.cells[0][0], "a");
  });

  test("is pasted with the styles of its cells, apart from the original", () => {
    const diagram = newDiagram("d1", "Tables", 0);
    const table = { ...newShape("t1", { x: 0, y: 0 }, 0, "table"), cells: [["a", "b"]], columns: [0.5, 0.5], cellStyles: [[{ color: "c-blue", bold: true }, {}]] };
    diagram.shapes = [table];
    const [pasted] = pasteItems(diagram, copyItems(diagram, ["t1"]), 20, ids);
    const copy = diagram.shapes.find((shape) => shape.id === pasted)!;
    assert.deepEqual(copy.cellStyles, [[{ color: "c-blue", bold: true }, {}]]);
    copy.cellStyles![0][0].color = "c-red";
    assert.equal(table.cellStyles[0][0].color, "c-blue");
  });
});

describe("the system clipboard", () => {
  const png = { type: "image/png" } as File;

  test("an internal copy marks it, with the texts of its shapes as plain text", () => {
    const written = new Map<string, string>();
    const diagram = sample();
    diagram.shapes[2].text = "Web";
    markClipboard({ setData: (type, value) => void written.set(type, value) }, copyItems(diagram, ["api", "db", "web"]));
    assert.ok(written.get(CLIP_TYPE));
    assert.equal(written.get("text/plain"), "API\nWeb");
  });

  test("an image without the marker is pasted", () => {
    assert.equal(imageToPaste({ types: ["Files"], files: [png] }), png);
  });

  test("the marker wins over an image, which the internal copy came after", () => {
    assert.equal(imageToPaste({ types: ["Files", CLIP_TYPE], files: [png] }), undefined);
  });

  test("a file that is not an image, or no clipboard data, gives none", () => {
    assert.equal(imageToPaste({ types: ["Files"], files: [{ type: "text/plain" } as File] }), undefined);
    assert.equal(imageToPaste(null), undefined);
    assert.equal(imageToPaste(undefined), undefined);
  });
});
