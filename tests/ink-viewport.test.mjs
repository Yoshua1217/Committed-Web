import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("../src/lib/ink-viewport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { constrainInkView, fitInkView } = mod.exports;
const paper = { width: 816, height: 1056 }, viewport = { width: 1000, height: 700 };
test("zoomed pages stop at a 36px gutter on all edges", () => {
  assert.deepEqual(constrainInkView({ x: 1e6, y: 1e6, scale: 2 }, paper, viewport), { x: 36, y: 36, scale: 2 });
  assert.deepEqual(constrainInkView({ x: -1e6, y: -1e6, scale: 2 }, paper, viewport), { x: -668, y: -1448, scale: 2 });
});
test("small pages stay fully inside the viewport", () => {
  for (const offset of [-1e6, 1e6]) {
    const view = constrainInkView({ x: offset, y: offset, scale: .5 }, paper, viewport);
    assert.ok(view.x >= 36 && view.x + paper.width * view.scale <= viewport.width - 36);
    assert.ok(view.y >= 36 && view.y + paper.height * view.scale <= viewport.height - 36);
  }
});
test("valid positions are preserved and hidden viewports do not reset navigation", () => {
  const view = { x: -100, y: -200, scale: 2 };
  assert.deepEqual(constrainInkView(view, paper, viewport), view);
  assert.deepEqual(constrainInkView(view, paper, { width: 0, height: 0 }), view);
});
test("portrait fit shows the entire paper with a gutter on every side", () => {
  const portrait = { width: 800, height: 1100 };
  const view = fitInkView(paper, portrait, "page");
  assert.ok(view.x >= 36 && view.y >= 36);
  assert.ok(view.x + paper.width * view.scale <= portrait.width - 36);
  assert.ok(view.y + paper.height * view.scale <= portrait.height - 36);
  assert.deepEqual(constrainInkView(view, paper, portrait), view);
});
test("fitting recalculates for height-only changes and large tablet screens", () => {
  const short = fitInkView(paper, { width: 1600, height: 800 }, "page");
  const tall = fitInkView(paper, { width: 1600, height: 2200 }, "page");
  assert.ok(tall.scale > short.scale);
  assert.ok(tall.scale > 1.6);
  const width = fitInkView(paper, { width: 1200, height: 600 }, "width");
  assert.equal(width.scale, (1200 - 72) / paper.width);
});
