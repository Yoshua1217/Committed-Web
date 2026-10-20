import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/ink-scroll.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { preserveInkScroll, preserveInkReadingPosition, inkPageAtViewport } = mod.exports;

test("page tracking finds the visible page with logarithmic layout reads", () => {
  let reads = 0;
  const pages = Array.from({ length: 1000 }, (_, index) => ({ dataset: { pdfPageId: String(index) }, getBoundingClientRect() { reads++; return { bottom: (index + 1) * 1000 - 900_500 }; } }));
  const container = { getBoundingClientRect: () => ({ top: 0 }), querySelectorAll: () => pages };
  assert.equal(inkPageAtViewport(container).dataset.pdfPageId, "900");
  assert.ok(reads <= 10, `expected at most 10 layout reads, got ${reads}`);
  assert.equal(inkPageAtViewport({ ...container, querySelectorAll: () => [] }), undefined);
});

function tabsFixture(reduced = false) {
  const frames = new Map(), listeners = new Map();
  let id = 0, time = 0;
  const instance = { exports: {} };
  new Function("module", "exports", "window", "requestAnimationFrame", "cancelAnimationFrame", compiled)(instance, instance.exports,
    { matchMedia: () => ({ matches: reduced }) }, callback => { frames.set(++id, callback); return id; }, key => frames.delete(key));
  const element = { scrollLeft: 0, scrollWidth: 1500, clientWidth: 500, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const cleanup = instance.exports.bindInkTabScroll(element);
  return {
    element, frames, cleanup,
    wheel(deltaY, options = {}) {
      let prevented = false;
      listeners.get("wheel")({ deltaX: 0, deltaY, deltaMode: 0, preventDefault() { prevented = true; }, ...options });
      return prevented;
    },
    pointerDown() { listeners.get("pointerdown")(); },
    tick() { time += 16.67; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); },
  };
}

test("tab wheel bursts accumulate into one animation and preserve their full distance", () => {
  const f = tabsFixture();
  for (let i = 0; i < 5; i++) assert.equal(f.wheel(60), true);
  assert.equal(f.frames.size, 1);
  assert.equal(f.element.scrollLeft, 0);
  f.tick();
  assert.ok(f.element.scrollLeft > 0 && f.element.scrollLeft < 300);
  for (let i = 0; i < 40; i++) f.tick();
  assert.equal(f.element.scrollLeft, 300);
  assert.equal(f.frames.size, 0);
  assert.equal(f.wheel(80, { deltaX: 50 }), false, "native horizontal trackpad input is untouched");
  assert.equal(f.wheel(80, { ctrlKey: true }), false, "browser zoom is untouched");
  f.cleanup();
});

test("tab scrolling respects reduced motion, wheel units, boundaries, and interruption", () => {
  const reduced = tabsFixture(true);
  assert.equal(reduced.wheel(3, { deltaMode: 1 }), true);
  assert.equal(reduced.element.scrollLeft, 48);
  assert.equal(reduced.frames.size, 0);
  reduced.wheel(10, { deltaMode: 2 });
  assert.equal(reduced.element.scrollLeft, 1000);
  assert.equal(reduced.wheel(100), false, "the document can scroll when the tab strip reaches its end");
  const f = tabsFixture();
  f.wheel(100);
  f.tick();
  const forward = f.element.scrollLeft;
  f.wheel(-20);
  f.tick();
  assert.ok(f.element.scrollLeft < forward, "reversing the wheel responds immediately instead of chasing the old target");
  f.pointerDown();
  const stopped = f.element.scrollLeft;
  f.tick();
  assert.equal(f.element.scrollLeft, stopped);
  f.wheel(100);
  f.cleanup();
  assert.equal(f.frames.size, 0);
});

test("toolbar transitions preserve nested page, horizontal pan, and document scrolling", () => {
  for (const transition of ["eraser to pen", "pen to eraser", "lasso to eraser", "eraser to shape"]) {
    const documentScroll = { scrollTop: 230, scrollLeft: 0, isConnected: true, parentElement: null };
    const root = { scrollTop: 0, scrollLeft: 0, isConnected: true, parentElement: documentScroll, ownerDocument: { scrollingElement: documentScroll } };
    const pages = { scrollTop: 1675, scrollLeft: 120, isConnected: true };
    root.querySelectorAll = () => [pages];
    const restore = preserveInkScroll(root);
    pages.scrollTop = 0; pages.scrollLeft = 0; documentScroll.scrollTop = 0;
    restore();
    assert.equal(pages.scrollTop, 1675, transition);
    assert.equal(pages.scrollLeft, 120, transition);
    assert.equal(documentScroll.scrollTop, 230, transition);
  }
});

test("restoration ignores a page stack removed by navigation", () => {
  const pages = { scrollTop: 900, scrollLeft: 0, isConnected: true };
  const root = { scrollTop: 0, scrollLeft: 0, isConnected: true, parentElement: null, ownerDocument: {}, querySelectorAll: () => [pages] };
  const restore = preserveInkScroll(root);
  pages.isConnected = false; pages.scrollTop = 0;
  restore();
  assert.equal(pages.scrollTop, 0);
});

test("stroke commits preserve ancestor scroll and use the new position after finger navigation", () => {
  const stack = { scrollTop: 1450, scrollLeft: 20, isConnected: true, parentElement: null };
  const page = { scrollTop: 0, scrollLeft: 0, isConnected: true, parentElement: stack, ownerDocument: {}, querySelectorAll: () => [] };
  const firstCommit = preserveInkScroll(page);
  stack.scrollTop = 1474;
  firstCommit();
  assert.equal(stack.scrollTop, 1450);
  // A later stroke must preserve the user's new position, not the first stroke's.
  stack.scrollTop = 1800;
  const nextCommit = preserveInkScroll(page);
  stack.scrollTop = 1776;
  nextCommit();
  assert.equal(stack.scrollTop, 1800);
  assert.equal(stack.scrollLeft, 20);
});

test("annotation mode preserves the point within a page across replacement and delayed ink loading", () => {
  function stack(height, before, scrollTop) {
    const container = { scrollTop, scrollLeft: 35, getBoundingClientRect: () => ({ top: 200 }) };
    const page = { dataset: { pdfPageId: "second" }, getBoundingClientRect: () => ({ top: 200 + before - container.scrollTop, bottom: 200 + before - container.scrollTop + height, height }) };
    container.querySelectorAll = () => [page];
    return container;
  }
  let container = stack(1000, 1100, 1500);
  const root = { querySelector: () => container };
  const restore = preserveInkReadingPosition(root);
  container = stack(1200, 1300, 0);
  restore();
  assert.equal(container.scrollTop, 1780);
  assert.equal(container.scrollLeft, 35);
  // Earlier pages finish loading and move this page farther down the stack.
  container = stack(1200, 1600, 1780);
  restore();
  assert.equal(container.scrollTop, 2080);
  restore();
  assert.equal(container.scrollTop, 2080, "repeated resize callbacks do not drift");
  const returnToReading = preserveInkReadingPosition(root);
  container = stack(1000, 1100, 0);
  returnToReading();
  assert.equal(container.scrollTop, 1500);
});
