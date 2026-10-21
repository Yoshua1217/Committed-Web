import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("../src/lib/canvas-model.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { zoomAt, worldPoint, snapAnchor, connection, moveObjects, removeObjects, cloneObjects, resizeBox } = mod.exports;
const a = { id: "a", kind: "shape", x: 100, y: 200, w: 200, h: 100, points: [] };
const b = { id: "b", kind: "shape", x: 600, y: 400, w: 200, h: 100, points: [] };
const edge = { id: "edge", kind: "connector", points: [], board: { from: { id: "a", side: "right" }, to: { id: "b", side: "left" }, route: "curve" } };
test("zoom retains cursor world position even at limits and negative coordinates", () => {
  for (const scale of [.05, .4, 1, 8]) for (const factor of [.01, .9, 1.2, 100]) {
    const camera = { x: -17000, y: 9000, scale }, cursor = { x: 433, y: 281 };
    const before = worldPoint(camera, cursor), next = zoomAt(camera, cursor, factor), after = worldPoint(next, cursor);
    assert.ok(Math.abs(before.x - after.x) < 1e-7 && Math.abs(before.y - after.y) < 1e-7);
    assert.ok(next.scale >= .05 && next.scale <= 8);
  }
});
test("snap distance stays constant on screen at every zoom", () => {
  for (const scale of [.1, 1, 8]) {
    assert.equal(snapAnchor([a], { x: 300 + 15 / scale, y: 250 }, scale)?.anchor.side, "right");
    assert.equal(snapAnchor([a], { x: 300 + 25 / scale, y: 250 }, scale), null);
    assert.equal(snapAnchor([a], { x: 300, y: 250 }, scale, "a"), null);
  }
});
test("attached connectors follow both moved and resized nodes without rewriting endpoints", () => {
  const moved = moveObjects([a, b, edge], new Set(["a"]), -500, 70);
  assert.deepEqual(connection(edge, moved).start, { x: -200, y: 320 });
  assert.deepEqual(connection(edge, moved).end, { x: 600, y: 450 });
  const resized = [{ ...a, w: 400, h: 200 }, b, edge];
  assert.deepEqual(connection(edge, resized).start, { x: 500, y: 300 });
  for (const route of ["straight", "curve", "elbow"]) assert.ok(!connection({ ...edge, board: { ...edge.board, route } }, resized).path.includes("NaN"));
});
test("deleting a node detaches its connector at its last world position", () => {
  const result = removeObjects([a, b, edge], new Set(["a"])), next = result.find(o => o.id === "edge");
  assert.equal(next.board.from, undefined);
  assert.deepEqual(connection(next, result).start, { x: 300, y: 250 });
  assert.equal(next.board.to.id, "b");
});
test("duplicated diagrams rebind to their copied nodes and retain group independence", () => {
  let id = 0; const copies = cloneObjects([{ ...a, group: "g" }, { ...b, group: "g" }, edge], new Set(["a", "b", "edge"]), () => `copy${++id}`);
  const connector = copies.find(o => o.kind === "connector");
  assert.equal(connector.board.from.id, "copy1"); assert.equal(connector.board.to.id, "copy2");
  assert.deepEqual(connection(connector, copies).start, { x: 324, y: 274 });
  assert.notEqual(copies[0].group, "g"); assert.equal(copies[0].group, copies[1].group);
});
test("resize retains the opposite corner, supports aspect lock and clamps inversions", () => {
  assert.deepEqual(resizeBox(a, "nw", { x: -50, y: -25 }), { x: 50, y: 175, w: 250, h: 125 });
  const resized = resizeBox(a, "se", { x: 100, y: 12 }, true); assert.equal(resized.w / resized.h, 2);
  const inverted = resizeBox(a, "nw", { x: 10000, y: 10000 }); assert.equal(inverted.w, 40); assert.equal(inverted.h, 32);
});
test("locked objects remain fixed while free ink translates with a selection", () => {
  const locked = { ...a, board: { locked: true } }, stroke = { id: "ink", kind: "stroke", points: [{ x: -10, y: 20, p: .5, t: 0 }] };
  const next = moveObjects([locked, stroke], new Set(["a", "ink"]), 20, -10);
  assert.equal(next[0], locked); assert.deepEqual(next[1].points[0], { x: 10, y: 10, p: .5, t: 0 });
});
