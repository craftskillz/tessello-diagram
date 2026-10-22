import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { imagesReferenced, planImport, readImportFile } from "../src/lib/import.ts";

describe("the files of living-documentation, read", () => {
  test("a JSON array is a .diagrams.json, the kind told by the content and not by the name", () => {
    assert.deepEqual(readImportFile("whatever.txt", "[]"), { kind: "diagrams", name: "whatever.txt", diagrams: [] });
  });

  test("an object with a list of libraries is a .shape-libraries.json", () => {
    assert.deepEqual(readImportFile(".shape-libraries.json", '{"libraries":[{"id":"l"}]}'), { kind: "libraries", name: ".shape-libraries.json", libraries: [{ id: "l" }] });
  });

  test("text that is not JSON, or JSON that is neither, is refused", () => {
    assert.deepEqual(readImportFile("a.json", "{nope"), { kind: "refused", name: "a.json", reason: "not_json" });
    for (const text of ['{"libraries":"x"}', '{"a":1}', "42", "null", '"text"']) {
      assert.deepEqual(readImportFile("a.json", text), { kind: "refused", name: "a.json", reason: "not_living_documentation" });
    }
  });
});

const ids = (prefix: string) => `${prefix}-new`;
const NO_IMAGES = new Map<string, string>();

/** The conversion of one `.diagrams.json` text, with deterministic ids. */
const planOf = (diagrams: unknown, images: ReadonlyMap<string, string> = NO_IMAGES) =>
  planImport([readImportFile("d.json", JSON.stringify(diagrams))], images, ids);

describe("the import of the living-documentation fixture", () => {
  // tests/fixtures/with-diagrams/testdocs/.diagrams.json of living-documentation
  const fixture = `[
    {
      "id": "diag-1",
      "title": "Sample Diagram",
      "nodes": [
        { "id": "n1", "label": "Start", "shapeType": "box", "colorKey": "c-blue", "x": 0, "y": 0 },
        { "id": "n2", "label": "End", "shapeType": "ellipse", "colorKey": "c-green", "x": 200, "y": 0 }
      ],
      "edges": [
        { "id": "e1", "from": "n1", "to": "n2" }
      ],
      "edgesStraight": false,
      "gridEnabled": true,
      "alignGuides": true
    }
  ]`;

  test("a rectangle and an ellipse of the original sizes, joined by a curved arrow with automatic ends", () => {
    const plan = planImport([readImportFile(".diagrams.json", fixture)], NO_IMAGES, ids);
    assert.equal(plan.diagrams.length, 1);
    const [diagram] = plan.diagrams;
    assert.equal(diagram.id, "diagram-new");
    assert.equal(diagram.title, "Sample Diagram");
    assert.deepEqual(diagram.shapes.map(({ id, type, text, color, x, y, w, h }) => ({ id, type, text, color, x, y, w, h })), [
      { id: "n1", type: "rect", text: "Start", color: "c-blue", x: 0, y: 0, w: 100, h: 40 },
      { id: "n2", type: "ellipse", text: "End", color: "c-green", x: 200, y: 0, w: 110, h: 50 },
    ]);
    assert.equal(diagram.arrows.length, 1);
    const [arrow] = diagram.arrows;
    assert.deepEqual([arrow.from, arrow.to, arrow.route, arrow.heads], [{ shapeId: "n1", port: null }, { shapeId: "n2", port: null }, "curved", "end"]);
    assert.deepEqual([diagram.grid, diagram.guides, plan.libraries, plan.shapes, plan.images, plan.missingImages], [true, true, [], 0, [], []]);
  });
});

const node = (id: string, fields: Record<string, unknown> = {}) => ({ id, label: id, shapeType: "box", colorKey: "c-gray", x: 0, y: 0, ...fields });
const diagramOf = (nodes: unknown[], edges: unknown[] = [], fields: Record<string, unknown> = {}) => ({ id: "d1", title: "T", nodes, edges, ...fields });

describe("the ends, the links and the unreadable elements", () => {
  test("an anchor node is a free end, a port is kept, and no port is automatic", () => {
    const { diagrams } = planOf([
      diagramOf(
        [node("a"), node("b", { x: 100 }), node("pin", { shapeType: "anchor", x: 50, y: 70 })],
        [
          { id: "e1", from: "a", to: "pin" },
          { id: "e2", from: "pin", to: "b", toPort: "W" },
          { id: "e3", from: "a", fromPort: "E", to: "b" },
        ],
      ),
    ]);
    const [diagram] = diagrams;
    assert.deepEqual(diagram.shapes.map((shape) => shape.id), ["a", "b"]);
    assert.deepEqual(diagram.arrows.map((arrow) => [arrow.from, arrow.to]), [
      [{ shapeId: "a", port: null }, { x: 50, y: 70 }],
      [{ x: 50, y: 70 }, { shapeId: "b", port: "W" }],
      [{ shapeId: "a", port: "E" }, { shapeId: "b", port: null }],
    ]);
  });

  test("a link to an imported diagram follows it to its new id, one to another diagram is kept, a URL gets its scheme", () => {
    const link = (type: string, value: string) => ({ nodeLink: { type, value } });
    const { diagrams } = planOf([
      diagramOf([node("a", link("diagram", "d2")), node("b", link("diagram", "elsewhere")), node("c", link("url", "example.com"))], [], { id: "d1" }),
      diagramOf([], [], { id: "d2" }),
    ]);
    assert.deepEqual(diagrams.map((diagram) => diagram.id), ["diagram-new", "diagram-new"]);
    assert.deepEqual(diagrams[0].shapes.map((shape) => shape.link), [
      { type: "diagram", value: "diagram-new" },
      { type: "diagram", value: "elsewhere" },
      { type: "url", value: "https://example.com" },
    ]);
  });

  test("the new ids are those of idOf, one per diagram, and a link points to the right one", () => {
    let count = 0;
    const plan = planImport([readImportFile("d", JSON.stringify([diagramOf([node("a", { nodeLink: { type: "diagram", value: "d2" } })]), diagramOf([], [], { id: "d2" })]))], NO_IMAGES, (prefix) => `${prefix}-${++count}`);
    assert.deepEqual(plan.diagrams.map((diagram) => diagram.id), ["diagram-1", "diagram-2"]);
    assert.deepEqual(plan.diagrams[0].shapes[0].link, { type: "diagram", value: "diagram-2" });
  });

  test("two diagrams with the same id, in two files, are two diagrams, and a link to that id leads to the first", () => {
    let count = 0;
    const file = JSON.stringify([diagramOf([node("a", { nodeLink: { type: "diagram", value: "d2" } })], [], { id: "d2" })]);
    const plan = planImport([readImportFile("one", file), readImportFile("two", file)], NO_IMAGES, (prefix) => `${prefix}-${++count}`);
    assert.deepEqual(plan.diagrams.map((diagram) => diagram.id), ["diagram-1", "diagram-2"]);
    assert.deepEqual(plan.diagrams.map((diagram) => diagram.shapes[0].link), [{ type: "diagram", value: "diagram-1" }, { type: "diagram", value: "diagram-1" }]);
  });

  test("unreadable nodes, edges and diagrams are skipped, and bad values take their default", () => {
    const { diagrams } = planOf([
      "nothing",
      { title: "no id", nodes: [] },
      diagramOf(
        [null, 3, { id: "nox", y: 0 }, { label: "noid", x: 0, y: 0 }, node("ok", { shapeType: "weird", nodeWidth: -5, bgOpacity: 7, textAlign: "diagonal", colorKey: 4 }), node("b")],
        [{ id: "e1", from: "ok", to: "gone" }, { from: "ok", to: "b" }, "edge", { id: "e2", from: "ok", to: "b", arrowDir: "sideways" }],
        { gridEnabled: false, alignGuides: false },
      ),
    ]);
    assert.equal(diagrams.length, 1);
    const [diagram] = diagrams;
    assert.deepEqual([diagram.grid, diagram.guides], [false, false]);
    assert.deepEqual(diagram.shapes.map(({ id, type, w, opacity, textAlign, color }) => ({ id, type, w, opacity, textAlign, color })), [
      { id: "ok", type: "rect", w: 100, opacity: 1, textAlign: "center", color: "c-gray" },
      { id: "b", type: "rect", w: 100, opacity: 1, textAlign: "center", color: "c-gray" },
    ]);
    assert.deepEqual(diagram.arrows.map((arrow) => [arrow.id, arrow.heads]), [["e2", "end"]]);
  });

  test("an untitled diagram has an empty title", () => {
    assert.equal(planOf([{ id: "d", nodes: [] }]).diagrams[0].title, "");
  });
});

describe("the values converted", () => {
  test("the angles go from radians to degrees, and the label rotation is added to that of the shape on its own", () => {
    const { diagrams } = planOf([diagramOf([node("a", { rotation: Math.PI / 2, labelRotation: Math.PI / 4 }), node("b")], [{ id: "e", from: "a", to: "b", labelRotation: Math.PI }])]);
    assert.deepEqual([diagrams[0].shapes[0].rotation, diagrams[0].shapes[0].textRotation, diagrams[0].arrows[0].labelRotation], [90, 45, 180]);
  });

  test("the arrow direction, dashes, color, width, font size and lock of an edge", () => {
    const edge = (id: string, fields: Record<string, unknown>) => ({ id, from: "a", to: "b", ...fields });
    const { diagrams } = planOf([
      diagramOf([node("a"), node("b")], [
        edge("to", { arrowDir: "to" }),
        edge("from", { arrowDir: "from" }),
        edge("both", { arrowDir: "both" }),
        edge("none", { arrowDir: "none", dashes: true, edgeColor: "#ff0000", edgeWidth: 3, fontSize: 20, edgeLocked: true, edgeLabelWidth: 90, label: "L" }),
      ]),
    ]);
    const arrows = diagrams[0].arrows;
    assert.deepEqual(arrows.map((arrow) => arrow.heads), ["end", "start", "both", "none"]);
    const { dashed, color, width, labelSize, locked, labelWidth, label } = arrows[3];
    assert.deepEqual({ dashed, color, width, labelSize, locked, labelWidth, label }, { dashed: true, color: "#ff0000", width: 3, labelSize: 20, locked: true, labelWidth: 90, label: "L" });
    assert.deepEqual([arrows[0].dashed, arrows[0].color, arrows[0].width, arrows[0].labelWidth], [false, "c-slate", 2, null]);
  });

  test("edgesStraight makes every arrow straight", () => {
    const edges = [{ id: "e", from: "a", to: "b" }];
    assert.equal(planOf([diagramOf([node("a"), node("b", { x: 100 })], edges, { edgesStraight: true })]).diagrams[0].arrows[0].route, "straight");
    assert.equal(planOf([diagramOf([node("a"), node("b", { x: 100 })], edges)]).diagrams[0].arrows[0].route, "curved");
  });

  test("a node saved without a size has that of the original editor, and a circle is as high as it is wide", () => {
    const types = ["box", "ellipse", "circle", "database", "actor", "post-it", "text-free", "image", "custom-shape"];
    const { diagrams } = planOf([diagramOf(types.map((shapeType) => node(shapeType, { shapeType })))]);
    assert.deepEqual(diagrams[0].shapes.map((shape) => [shape.type, shape.w, shape.h, shape.fontSize]), [
      ["rect", 100, 40, 13],
      ["ellipse", 110, 50, 13],
      ["circle", 55, 55, 13],
      ["database", 50, 70, 13],
      ["actor", 30, 52, 13],
      ["postit", 120, 100, 13],
      ["text", 80, 30, 13],
      ["image", 160, 120, 13],
      ["custom", 65, 65, 13],
    ]);
    const [circle] = planOf([diagramOf([node("c", { shapeType: "circle", nodeWidth: 80, nodeHeight: 20 })])]).diagrams[0].shapes;
    assert.deepEqual([circle.w, circle.h], [80, 80]);
  });

  test("the style of a node is kept, and the order of the nodes is the drawing order, the edges in front", () => {
    const { diagrams } = planOf([
      diagramOf(
        [node("a", { fontSize: 20, textAlign: "left", textValign: "top", bgOpacity: 0.5, groupId: "g", locked: true, shapeType: "post-it" }), node("b")],
        [{ id: "e", from: "a", to: "b" }],
      ),
    ]);
    const [a, b] = diagrams[0].shapes;
    assert.deepEqual([a.fontSize, a.textAlign, a.textValign, a.opacity, a.groupId, a.locked, a.z, b.z, b.groupId, b.locked, diagrams[0].arrows[0].z], [20, "left", "top", 0.5, "g", true, 0, 1, null, false, 2]);
  });

  test("a label offset becomes a place along the line and a distance aside, on the side the original draws it", () => {
    const edge = (id: string, offset: Record<string, number>) => ({ id, from: "a", to: "b", ...offset });
    const { diagrams } = planOf([
      diagramOf([node("a"), node("b", { x: 300 })], [edge("none", {}), edge("up", { edgeLabelOffsetX: 0, edgeLabelOffsetY: -20 }), edge("along", { edgeLabelOffsetX: 40, edgeLabelOffsetY: 0 })], { edgesStraight: true }),
    ]);
    const [none, up, along] = diagrams[0].arrows;
    assert.deepEqual([none.labelAt, none.labelOffset], [0.5, 0]);
    // The offset is a quarter turn clockwise from the way the line goes, below a line that goes right: up is negative.
    assert.deepEqual([up.labelAt, up.labelOffset], [0.5, -20]);
    // The line goes from the edge of a (50) to the edge of b (250): 200 long, its middle at 150.
    assert.deepEqual([along.labelAt, along.labelOffset], [0.7, 0]);
  });
});

describe("the libraries, the custom shapes and the images", () => {
  const libraries = JSON.stringify({
    libraries: [
      {
        id: "lib-1",
        name: "Icons",
        shapes: [
          { id: "srv", name: "Server", imageSrc: "/images/server.png", width: 80, height: 40, labelPlacement: "right", showInDiagram: false, anchors: [{ id: "in", x: 0, y: 0.5 }] },
          { id: "bare", name: "Bare", imageSrc: "/images/bare.png" },
          { id: "noimage", name: "No picture" },
        ],
      },
    ],
  });
  const diagrams = JSON.stringify([
    diagramOf([
      node("s", { shapeType: "custom-shape", customShapeId: "srv", label: "Prod" }),
      node("t", { shapeType: "custom-shape", customShapeId: "bare", labelPlacement: "above", nodeWidth: 30 }),
      node("u", { shapeType: "custom-shape", customShapeId: "deleted", label: "Gone" }),
      node("p", { shapeType: "image", imageSrc: "/images/photo.png" }),
      node("q", { shapeType: "image", imageSrc: "/images/lost.png" }),
      node("r", { shapeType: "image", imageSrc: "data:image/png;base64,AAAA" }),
    ]),
  ]);
  const files = [readImportFile(".shape-libraries.json", libraries), readImportFile(".diagrams.json", diagrams)];
  const keys = new Map([["server.png", `image:${"1".repeat(64)}`], ["photo.png", `image:${"2".repeat(64)}`]]);

  test("the images the files refer to are named by their file", () => {
    assert.deepEqual([...imagesReferenced(files)].sort(), ["bare.png", "lost.png", "photo.png", "server.png"]);
  });

  test("a library is added with a new id, its definitions with their picture, anchors and style", () => {
    const plan = planImport(files, keys, ids);
    assert.equal(plan.libraries.length, 1);
    assert.equal(plan.libraries[0].id, "library-new");
    assert.equal(plan.shapes, 2);
    const [server, bare] = plan.libraries[0].shapes;
    assert.deepEqual(server, { id: "srv", name: "Server", imageKey: keys.get("server.png"), width: 80, height: 40, labelPlacement: "right", showInDiagram: false, anchors: [{ id: "in", x: 0, y: 0.5 }] });
    assert.equal(bare.imageKey, "image:missing:bare.png");
    assert.deepEqual([bare.width, bare.height, bare.anchors.length], [65, 65, 8]);
  });

  test("a custom shape refers to its definition in the new library, at its size, with its placement", () => {
    const [shapes] = planImport(files, keys, ids).diagrams.map((diagram) => diagram.shapes);
    const [s, t, u] = shapes;
    assert.deepEqual([s.type, s.w, s.h, s.labelPlacement, s.customShapeRef], ["custom", 80, 40, "right", { libraryId: "library-new", shapeId: "srv", name: "Server" }]);
    assert.deepEqual([t.w, t.h, t.labelPlacement, t.customShapeRef?.shapeId], [30, 65, "above", "bare"]);
    assert.deepEqual([u.labelPlacement, u.customShapeRef], ["below", { libraryId: "", shapeId: "", name: "Gone" }]);
  });

  test("an image provided has its key, one that is not has a key no storage holds, and is reported", () => {
    const plan = planImport(files, keys, ids);
    const images = plan.diagrams[0].shapes.filter((shape) => shape.type === "image");
    assert.deepEqual(images.map((shape) => shape.imageKey), [keys.get("photo.png"), "image:missing:lost.png", undefined]);
    assert.deepEqual(plan.images, ["photo.png", "server.png"]);
    assert.deepEqual(plan.missingImages, ["bare.png", "lost.png"]);
  });

  test("an arrow ends at the anchors of the definition of a custom shape", () => {
    const withArrow = [
      files[0],
      readImportFile("d", JSON.stringify([diagramOf([node("s", { shapeType: "custom-shape", customShapeId: "srv", nodeWidth: 80, nodeHeight: 40 }), node("b", { x: 300 })], [{ id: "e", from: "s", to: "b", edgeLabelOffsetY: 10 }], { edgesStraight: true })])),
    ];
    const [arrow] = planImport(withArrow, keys, ids).diagrams[0].arrows;
    assert.deepEqual([arrow.labelAt > 0 && arrow.labelAt < 1, arrow.labelOffset], [true, 10]);
  });
});
