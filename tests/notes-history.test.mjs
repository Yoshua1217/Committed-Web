import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(name) {
  const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}
const { NotesHistory, noteHistoryShortcut } = load("notes-history");
const { changeTable, serializeTable } = load("notes-tables");

test("every table menu action undoes and redoes independently, including deletion", () => {
  const history = new NotesHistory();
  let table = { rows: [["Name", "Value"], ["Keep this", "42"]], alignments: ["left", "right"] };
  const content = () => `Before\n\n${serializeTable(table)}\n\nAfter`;
  const states = [content()];
  for (const action of ["row-before", "row-after", "column-before", "column-after", "remove-row", "remove-column"]) {
    table = changeTable(table, action, 1, 1);
    states.push(content());
  }
  table.alignments[0] = "center";
  states.push(content(), "Before\n\n\n\nAfter");
  for (let index = 1; index < states.length; index++) history.record("note", states[index - 1], states[index], null, index);
  let current = states.at(-1);
  for (let index = states.length - 2; index >= 0; index--) {
    current = history.step("note", current, "undo");
    assert.equal(current, states[index]);
  }
  assert.equal(history.step("note", current, "undo"), null);
  for (let index = 1; index < states.length; index++) {
    current = history.step("note", current, "redo");
    assert.equal(current, states[index]);
  }
});

test("typing groups stay separate from menu actions and undo in chronological order", () => {
  const history = new NotesHistory();
  history.record("note", "", "h", "source", 0);
  history.record("note", "h", "hi", "source", 10);
  history.record("note", "hi", "hi TABLE", null, 20);
  history.record("note", "hi TABLE", "hi TABLE a", "table-1-cell-0-0", 30);
  history.record("note", "hi TABLE a", "hi TABLE ab", "table-1-cell-0-0", 40);
  assert.equal(history.step("note", "hi TABLE ab", "undo"), "hi TABLE");
  assert.equal(history.step("note", "hi TABLE", "undo"), "hi");
  assert.equal(history.step("note", "hi", "undo"), "");
});

test("new edits clear redo, do not merge across undo, and notes remain isolated", () => {
  const history = new NotesHistory();
  history.record("A", "", "one", "source", 0);
  history.record("A", "one", "two", null, 1);
  history.record("B", "original B", "edited B");
  assert.equal(history.step("A", "two", "undo"), "one");
  history.record("A", "one", "new", "source", 2);
  assert.equal(history.step("A", "new", "redo"), null);
  assert.equal(history.step("A", "new", "undo"), "one");
  assert.equal(history.step("B", "edited B", "undo"), "original B");
});

test("external changes cannot be overwritten by stale undo or redo", () => {
  const history = new NotesHistory();
  history.record("note", "before", "after");
  assert.equal(history.step("note", "remote edit", "undo"), null);
  history.record("note", "remote edit", "local edit");
  assert.equal(history.step("note", "local edit", "undo"), "remote edit");
  assert.equal(history.step("note", "another remote edit", "redo"), null);
});

test("completed uploads remain resolved through undo and redo", () => {
  const history = new NotesHistory();
  history.record("note", "before", "before TOKEN");
  history.record("note", "before TOKEN", "before TOKEN TABLE");
  history.resolveText("note", "TOKEN", "image-url");
  assert.equal(history.step("note", "before image-url TABLE", "undo"), "before image-url");
  assert.equal(history.step("note", "before image-url", "undo"), "before");
  assert.equal(history.step("note", "before", "redo"), "before image-url");
});

test("history is bounded and unchanged content creates no step", () => {
  const history = new NotesHistory();
  for (let index = 0; index < 110; index++) history.record("note", String(index), String(index + 1));
  history.record("note", "110", "110");
  let current = "110";
  for (let index = 0; index < 100; index++) current = history.step("note", current, "undo");
  assert.equal(current, "10");
  assert.equal(history.step("note", current, "undo"), null);
});

test("Ctrl/Cmd+Z undo and Ctrl/Cmd+Shift+Z or Ctrl+Y redo", () => {
  const event = { key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false };
  assert.equal(noteHistoryShortcut(event), "undo");
  assert.equal(noteHistoryShortcut({ ...event, ctrlKey: false, metaKey: true }), "undo");
  assert.equal(noteHistoryShortcut({ ...event, shiftKey: true }), "redo");
  assert.equal(noteHistoryShortcut({ ...event, key: "y" }), "redo");
  for (const patch of [{ ctrlKey: false }, { altKey: true }, { isComposing: true }, { key: "x" }]) assert.equal(noteHistoryShortcut({ ...event, ...patch }), null);
});
