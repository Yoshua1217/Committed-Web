import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/ink-scroll.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { preserveInkScroll, preserveInkReadingPosition } = mod.exports;

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
