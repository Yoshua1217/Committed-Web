import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("../src/lib/ink-viewport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { constrainInkView, fitInkView, inkRasterSize, inkRasterRegion, inkRegionCovers } = mod.exports;
const paper = { width: 816, height: 1056 }, viewport = { width: 1000, height: 700 };
test("interactive buffers stay within 16 MB per layer on large pages and high-DPI devices", () => {
  for (const size of [paper, { width: 2400, height: 3200 }, { width: 20000, height: 1000 }]) {
    for (const dpr of [1, 1.25, 2, 3, 4]) {
      const pixels = inkRasterSize(size, dpr);
      assert.ok(pixels.width * pixels.height <= 4_000_000);
      assert.ok(Math.max(pixels.width, pixels.height) <= 4096);
      assert.ok(pixels.width > 0 && pixels.height > 0);
      // The transform maps the full page to the bounded raster without clipping.
      assert.equal(size.width * (pixels.width / size.width), pixels.width);
      assert.equal(size.height * (pixels.height / size.height), pixels.height);
    }
  }
  assert.deepEqual(inkRasterSize(paper, 2), { width: 1632, height: 2112 });
  assert.deepEqual(inkRasterSize(paper, 4), inkRasterSize(paper, 2));
});
test("zoomed ink keeps screen resolution while allocating only the visible region", () => {
  const clip = { left: 0, top: 0, right: 1000, bottom: 700 };
  for (const scale of [.25, 1, 2, 6]) {
    const region = inkRasterRegion(paper, scale, 1, { left: -100, top: -200 }, clip);
    assert.ok(region);
    assert.ok(region.pixelWidth * region.pixelHeight <= 4_000_000);
    assert.ok(Math.abs(region.pixelWidth / region.width - scale) < .01);
    assert.ok(Math.abs(region.pixelHeight / region.height - scale) < .01);
    assert.ok(region.x <= 100 / scale && region.y <= 200 / scale);
    assert.ok(region.x + region.width >= Math.min(paper.width, 1000 / scale));
    assert.ok(region.y + region.height >= Math.min(paper.height, 700 / scale));
  }
  const region = inkRasterRegion(paper, 6, 2, { left: -100, top: -200 }, clip);
  assert.ok(region.pixelWidth * region.pixelHeight <= 4_000_000);
  assert.ok(Math.max(region.pixelWidth, region.pixelHeight) <= 4096);
  assert.ok(region.pixelWidth / region.width > 6, "high-DPI ink retains at least native screen resolution");
});

test("scroll crops track page coordinates and skip offscreen pages", () => {
  const clip = { left: 100, top: 200, right: 800, bottom: 900 };
  const first = inkRasterRegion(paper, 6, 1, { left: -500, top: -1000 }, clip);
  const next = inkRasterRegion(paper, 6, 1, { left: -800, top: -1600 }, clip);
  assert.ok(Math.abs(next.x - first.x - 50) < 1e-9);
  assert.ok(Math.abs(next.y - first.y - 100) < 1e-9);
  assert.ok(Math.abs(next.pixelWidth - first.pixelWidth) <= 1);
  assert.ok(Math.abs(next.pixelHeight - first.pixelHeight) <= 1);
  assert.equal(inkRasterRegion(paper, 2, 2, { left: 100, top: 1000 }, clip), null);
  assert.equal(inkRasterRegion(paper, 2, 2, { left: -2000, top: 200 }, clip), null);
});

test("scroll gutters reuse sharp buffers across small movements and refill before their edge", () => {
  const clip = { left: 0, top: 0, right: 1000, bottom: 700 };
  const largePaper = { width: 3000, height: 4000 };
  for (const scale of [1, 2, 6]) {
    const page = { left: -200, top: -500 };
    const region = inkRasterRegion(largePaper, scale, 1, page, clip);
    for (let pixels = 0; pixels <= 90; pixels++) {
      assert.equal(inkRegionCovers(region, largePaper, scale, { ...page, top: page.top - pixels }, clip), true);
    }
    assert.equal(inkRegionCovers(region, largePaper, scale, { ...page, top: page.top - 110 }, clip), false);
    assert.equal(inkRegionCovers(region, largePaper, scale, { ...page, left: page.left - 110 }, clip), false);
  }
  const fullPage = inkRasterRegion(paper, .25, 1, { left: 20, top: 20 }, clip);
  assert.equal(inkRegionCovers(fullPage, paper, .25, { left: 20, top: 20 }, clip), true, "page edges do not force repeated redraws");
});
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
