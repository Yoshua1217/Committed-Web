import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";

test("cloud acknowledgements do not rewind typing before the next frame", () => {
  const source = fs.readFileSync(new URL("../src/app/dashboard/notes/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "subscribeToMarkdownNotes") callback = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, "notes subscription exists");
  const js = ts.transpileModule(`const receive = ${callback.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const frames = [];
  const note = { id: "note", title: "Typing", content: "committe", updatedAt: 1 };
  const editor = {
    value: note.content, selectionStart: 8, selectionEnd: 8, scrollTop: 0,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  };
  const notesRef = { current: [note] };
  const dependencies = {
    editorRef: { current: editor }, document: { activeElement: editor },
    notesRef, saveTimersRef: { current: new Map() },
    inFlightSaveCountsRef: { current: new Map() },
    locallyDirtyNoteIdsRef: { current: new Set() },
    setNotes(notes) { assert.equal(notes[0].content, editor.value); },
    setNotesLoaded() {}, requestAnimationFrame(fn) { frames.push(fn); },
  };
  const receive = new Function(...Object.keys(dependencies), `${js}\nreturn receive;`)(...Object.values(dependencies));
  receive([{ ...note }]);
  // A keystroke arrives after the acknowledgement but before queued frames run.
  editor.value += "d";
  editor.selectionStart = editor.selectionEnd = 9;
  frames.forEach(fn => fn());
  assert.equal(editor.selectionStart, 9);
  assert.equal(editor.selectionEnd, 9);
  assert.equal(editor.value, "committed");
});
