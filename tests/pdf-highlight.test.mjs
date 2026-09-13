import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { createCanvas } from "@napi-rs/canvas";

function load(name) {
  const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, () => ({}));
  return mod.exports;
}
const { snapPdfHighlight } = load("pdf-highlight");
const { drawObject } = load("ink-renderer");
const line = { text: "Example text", x: 20, y: 30, w: 160, h: 16 };
const stroke = (coords, extra = {}) => ({ id: "ink", kind: "stroke", style: "highlighter", color: "#ffff00", opacity: .3, width: 20, pressure: 0, order: 1, points: coords.map(([x, y], t) => ({ x, y, t, p: .5 })), ...extra });

test("snaps wobbly partial highlighting in either direction without highlighting the whole block", () => {
  for (const coords of [[[40, 39], [70, 35], [105, 40]], [[105, 40], [70, 35], [40, 39]]]) {
    const source = stroke(coords), result = snapPdfHighlight(source, [line]);
    assert.deepEqual(result.points.map(p => [p.x, p.y]), [[coords[0][0], 40.4], [coords[2][0], 40.4]]);
    assert.equal(result.width, 16 * 1.15);
    assert.equal(result.opacity, source.opacity);
    assert.equal(source.points.length, 3);
  }
});
test("joins adjacent text fragments but avoids bridging columns or adjacent rows", () => {
  const fragments = [{ ...line, w: 65 }, { ...line, x: 90, w: 80 }, { ...line, y: 55 }];
  assert.equal(snapPdfHighlight(stroke([[30, 38], [160, 39]]), fragments).points[1].y, 40.4);
  const crossing = stroke([[30, 38], [340, 38]]);
  assert.equal(snapPdfHighlight(crossing, [line, { ...line, x: 300 }]), crossing);
  const rows = stroke([[30, 38], [70, 65]]);
  assert.equal(snapPdfHighlight(rows, fragments), rows);
});
test("preserves freehand marks, scanned pages, taps, and regular pen strokes", () => {
  for (const source of [stroke([[30, 90], [140, 92]]), stroke([[40, 38]]), stroke([[40, 38], [100, 38]], { style: "pen" }), stroke([[30, 38], [70, 70], [140, 38]])]) {
    assert.equal(snapPdfHighlight(source, [line]), source);
  }
  const source = stroke([[30, 38], [140, 39]]);
  assert.equal(snapPdfHighlight(source, []), source);
});
test("uses rotated text centerlines in page coordinates", () => {
  const rotated = { ...line, baseline: { x: 100, y: 20, ux: 0, uy: 1, length: 160, height: 16 } };
  const result = snapPdfHighlight(stroke([[102, 40], [98, 70], [101, 130]]), [rotated]);
  assert.deepEqual(result.points.map(p => [p.x, p.y]), [[97.6, 40], [97.6, 130]]);
});
test("saved highlighters have round caps and consistent opacity; taps render as circles", () => {
  const canvas = createCanvas(200, 100), ctx = canvas.getContext("2d");
  drawObject(ctx, stroke([[40, 50], [90, 50], [140, 50]]));
  const alpha = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  assert.ok(alpha(34, 50) > 0);
  assert.equal(alpha(31, 41), 0);
  assert.equal(alpha(90, 50), alpha(60, 50));
  ctx.clearRect(0, 0, 200, 100);
  drawObject(ctx, stroke([[40, 50]]));
  assert.ok(alpha(40, 50) > 0);
  assert.equal(alpha(25, 50), 0);
});
