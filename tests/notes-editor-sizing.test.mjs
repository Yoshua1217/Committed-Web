import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

test("sizing measures a separate textarea and clears hidden scrolling without moving selection", () => {
  const js = ts.transpileModule(fs.readFileSync(new URL("../src/lib/notes-editor-sizing.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const heights = [];
  let attached = false;
  const measure = { style: { setProperty() {} }, removeAttribute() {}, setAttribute() {},
    get scrollHeight() { assert.equal(attached, true); assert.equal(measure.value, "long note"); return 1400; },
    remove() { attached = false; } };
  const editor = { value: "long note", scrollTop: 180, selectionStart: 5, selectionEnd: 5,
    style: { set height(value) { heights.push(value); } }, cloneNode() { return measure; },
    getBoundingClientRect() { return { width: 600 }; } };
  const computed = { length: 0, cssText: "", borderTopWidth: "0px", borderBottomWidth: "0px" };
  const mod = { exports: {} };
  new Function("module", "exports", "document", "getComputedStyle", js)(mod, mod.exports,
    { body: { appendChild(node) { assert.equal(node, measure); attached = true; } } }, () => computed);
  mod.exports.sizeNoteEditor(editor);
  assert.deepEqual(heights, ["1400px"]);
  assert.equal(editor.scrollTop, 0);
  assert.equal(editor.selectionStart, 5);
  assert.equal(editor.selectionEnd, 5);
  assert.equal(attached, false);
});
