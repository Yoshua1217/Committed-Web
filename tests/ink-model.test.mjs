import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
function load(name) { const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; const mod = { exports: {} }; new Function("module", "exports", js)(mod, mod.exports); return mod.exports; }
const { lassoObjects, eraseObjects, transformObjects, objectBounds, enhancePoints, courseForNotebook, recognizeHeldShape, shapePoints } = load("ink-model");
const { InkHistory } = load("ink-history");
const p = (x, y) => ({ x, y, p: .5, t: 1 });
const stroke = (id = "ink", points = [p(0, 50), p(100, 50)]) => ({ id, kind: "stroke", points, width: 2, color: "#111111", opacity: 1, style: "pen", pressure: 0, order: 1 });
const polygon = [p(30, 20), p(70, 20), p(70, 80), p(30, 80)];

test("lasso selects only the middle of a sparse connected stroke and preserves both tails", () => {
  const source = stroke(), result = lassoObjects([source], polygon);
  assert.equal(result.objects.length, 3); assert.equal(result.selected.length, 1);
  const selected = result.objects.find(o => result.selected.includes(o.id));
  assert.ok(selected.points[0].x >= 28 && selected.points.at(-1).x <= 72);
  assert.equal(result.objects[0].points[0].x, 0); assert.equal(result.objects.at(-1).points.at(-1).x, 100);
  assert.deepEqual(source.points, [p(0, 50), p(100, 50)]);
});
test("lasso leaves excluded strokes unchanged and selects an image by its center", () => {
  const source = stroke("outside", [p(0, 0), p(100, 0)]), image = { ...stroke("image"), kind: "image", points: [], x: 40, y: 40, w: 20, h: 20 };
  const result = lassoObjects([source, image], polygon); assert.equal(result.objects[0], source); assert.deepEqual(result.selected, ["image"]);
});
test("partial eraser splits a sparse stroke without connecting the erased gap", () => {
  const source = stroke(), result = eraseObjects([source], p(50, 0), p(50, 100), 5, true);
  assert.equal(result.length, 2); assert.ok(result[0].points.at(-1).x < 45); assert.ok(result[1].points[0].x > 55); assert.notEqual(result[0].id, result[1].id);
});
test("stroke eraser detects crossings even when neither endpoint touches the eraser", () => assert.deepEqual(eraseObjects([stroke()], p(50, 0), p(50, 100), 2, false), []));
test("eraser keeps image objects and unrelated ink intact", () => { const image = { ...stroke("image"), kind: "image" }, safe = stroke("safe", [p(200, 200)]); assert.deepEqual(eraseObjects([image, safe], p(50, 0), p(50, 100), 2, true), [image, safe]); });
test("transform preserves vector points and supports scale, rotation, and translation", () => {
  const source = stroke(), rotated = transformObjects([source], 10, 20, 2, 90)[0];
  assert.ok(Math.abs(rotated.points[0].x - 60) < .001); assert.ok(Math.abs(rotated.points.at(-1).x - 60) < .001); assert.equal(rotated.width, 4);
  assert.equal(source.width, 2); assert.equal(rotated.points[0].p, .5);
});
test("rotated image bounds include all corners", () => { const b = objectBounds([{ ...stroke(), kind: "image", points: [], x: 0, y: 0, w: 100, h: 50, rotation: 90 }]); assert.ok(Math.abs(b.w - 50) < .001); assert.ok(Math.abs(b.h - 100) < .001); });
test("enhancement preserves endpoints, pressure, timing, and raw source", () => {
  const points = [p(0, 0), p(4, 8), p(8, 0)], result = enhancePoints(points, 1); assert.equal(result[0], points[0]); assert.equal(result[2], points[2]); assert.equal(result[1].y, 4); assert.equal(points[1].y, 8); assert.equal(result[1].p, .5); assert.equal(result[1].t, 1);
});
test("explicit notebook course overrides calendar association", () => { const courses = [{ id: "calendar", notebookIds: [], calendarIds: ["layer"] }, { id: "notebook", notebookIds: ["book"], calendarIds: [] }]; assert.equal(courseForNotebook(courses, "book", "layer").id, "notebook"); assert.equal(courseForNotebook(courses, "other", "layer").id, "calendar"); assert.equal(courseForNotebook(courses, "other"), undefined); });
test("ink undo preserves unrelated additions from another device", () => { const history = new InkHistory(), a = stroke("a"), b = stroke("b"); history.record([], [a]); const undone = history.step([a, b], true); assert.deepEqual(undone, [b]); assert.deepEqual(history.step(undone, false), [b, a]); });
test("undo never replaces an object subsequently edited on another device", () => { const history = new InkHistory(), a = stroke("a"), changed = { ...a, color: "#ff0000" }; history.record([], [a]); assert.deepEqual(history.step([changed], true), [changed]); assert.equal(history.redo.length, 0); });
test("partial lasso splitting and deletion are recoverable as one action each", () => { const history = new InkHistory(), a = stroke(), result = lassoObjects([a], polygon); history.record([a], result.objects); const remaining = result.objects.filter(o => !result.selected.includes(o.id)); history.record(result.objects, remaining); assert.deepEqual(history.step(history.step(remaining, true), true), [a]); });
test("hold recognition distinguishes lines, rectangles, ellipses, and small writing", () => {
  assert.equal(recognizeHeldShape([p(0, 0), p(50, 2), p(100, 0)]).kind, "line");
  assert.equal(recognizeHeldShape(shapePoints("rectangle", p(0, 0), p(100, 80))).kind, "rectangle");
  assert.equal(recognizeHeldShape(shapePoints("ellipse", p(0, 0), p(100, 80))).kind, "ellipse");
  assert.equal(recognizeHeldShape(shapePoints("ellipse", p(0, 0), p(15, 20))), null);
  assert.equal(recognizeHeldShape([p(0, 0), p(30, 90), p(70, 5), p(100, 80)]), null);
});
test("recovery journal merges local edits without dropping unrelated server strokes", () => {
  const { mergeInkDraft } = load("notes-local-drafts"), original = stroke("original"), remote = stroke("remote"), edited = { ...original, color: "#0000ff" };
  assert.deepEqual(mergeInkDraft([original, remote], { before: [original], after: [edited], revision: 1 }), [edited, remote]);
  assert.deepEqual(mergeInkDraft([original, remote], { before: [original], after: [], revision: 2 }), [remote]);
});
test("recovery journal stores one new stroke without serializing a long unchanged lecture", () => {
  const { makeInkDraft } = load("notes-local-drafts"), existing = Array.from({ length: 2000 }, (_, i) => stroke(`old-${i}`)), fresh = stroke("fresh");
  existing.forEach(o => { o.toJSON = () => { throw new Error("Unchanged ink must not be serialized"); }; });
  const draft = makeInkDraft(existing, [...existing, fresh], null, 1);
  assert.deepEqual(draft.before, []); assert.deepEqual(draft.after, [fresh]);
});
test("queued addition followed by deletion retains a server tombstone", () => {
  const { makeInkDraft, mergeInkDraft } = load("notes-local-drafts"), a = stroke("a"), b = stroke("b");
  const first = makeInkDraft([], [a], null, 1), second = makeInkDraft([a], [a, b], first, 2), third = makeInkDraft([a, b], [b], second, 3);
  assert.deepEqual(third.before, [a]); assert.deepEqual(third.after, [b]); assert.deepEqual(mergeInkDraft([a], third), [b]);
});
test("reverting an unsynced edit still writes the restored object", () => {
  const { makeInkDraft, mergeInkDraft } = load("notes-local-drafts"), original = stroke(), changed = { ...original, color: "#ff0000" };
  const edit = makeInkDraft([original], [changed], null, 1), revert = makeInkDraft([changed], [original], edit, 2);
  assert.deepEqual(mergeInkDraft([changed], revert), [original]); assert.deepEqual(revert.before, [changed]); assert.deepEqual(revert.after, [original]);
});

 test("stylus holds tolerate jitter in screen pixels but reject cumulative drift at every zoom", () => {
  const { withinInkHold, fountainPool } = load("ink-model");
  for (const scale of [.25, 1, 4]) {
    const anchor = p(100, 100);
    for (const offset of [1, -2, 4, -3, 5]) assert.ok(withinInkHold(anchor, p(100 + offset / scale, 100), scale, true));
    assert.equal(withinInkHold(anchor, p(100 + 7 / scale, 100), scale, true), false);
    assert.equal(withinInkHold(anchor, p(100 + 3 / scale, 100), scale, false), false);
  }
  assert.equal(fountainPool(0), 1);
  assert.ok(fountainPool(900) > fountainPool(300));
  assert.equal(fountainPool(10000), 3);
});
test("pooled ink survives smoothing, selection resampling, and transforms", () => {
  const { samplePoints } = load("ink-model");
  const points = [p(0, 0), { ...p(20, 3), pool: 2.5 }, p(40, 0)];
  assert.deepEqual(enhancePoints(points, 1)[1], points[1]);
  assert.ok(samplePoints(points).some(point => point.pool === 2.5));
  assert.equal(transformObjects([stroke("pool", points)], 5, 5, 2)[0].points[1].pool, 2.5);
});

test("fountain speed controls width within saved limits independently of sample frequency", () => {
  const { fountainSpeedWidth, fountainWidths } = load("ink-model");
  const pen = { width: 2, minWidth: 1, maxWidth: 8 };
  const a = { ...p(0, 0), t: 0 };
  const slow = fountainSpeedWidth(pen, a, { ...p(10, 0), t: 100 });
  const fast = fountainSpeedWidth(pen, a, { ...p(100, 0), t: 100 });
  assert.ok(slow > fast && slow <= 8 && fast >= 1);
  assert.equal(fountainSpeedWidth(pen, a, { ...p(50, 0), t: 50 }), fast);
  assert.equal(fountainSpeedWidth(pen, a, { ...a, t: 500 }), 8);
  assert.deepEqual(fountainWidths({ width: 2 }), { min: .8, max: 6 });
  assert.equal(fountainWidths({ ...pen, minWidth: 9 }).max, 9);
  const scaled = transformObjects([{ ...stroke(), ...pen }], 0, 0, 2)[0];
  assert.equal(scaled.minWidth, 2); assert.equal(scaled.maxWidth, 16);
});

test("fountain smoothing limits sudden speed changes and tapers held buildup", () => {
  const { smoothFountainWidth, spreadFountainPool } = load("ink-model");
  const pen = { width: 2, minWidth: 1, maxWidth: 12 };
  const a = { ...p(0, 0), t: 0, pool: .5 }, b = { ...p(1, 0), t: 100 };
  const smooth = smoothFountainWidth(pen, a, b, 1);
  assert.ok(smooth > 1 && smooth <= 1.15);
  assert.ok(smoothFountainWidth(pen, a, b, 0) > smooth);
  const points = Array.from({ length: 101 }, (_, x) => ({ ...p(x, 0), pool: .5 }));
  spreadFountainPool(points, points[80], 6, 2, 1);
  assert.equal(points[80].pool, 6);
  assert.equal(points[0].pool, .5);
  for (let i = 1; i < points.length; i++) assert.ok(Math.abs(points[i].pool - points[i - 1].pool) * 2 <= .150001);
});
