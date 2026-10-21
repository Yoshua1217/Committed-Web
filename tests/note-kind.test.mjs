import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(readInk = async () => []) {
  const source = fs.readFileSync(new URL("../src/lib/note-kind.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(mod, mod.exports, () => ({ readInk, surfacePath: id => `notes/${id}/surfaces` }));
  return mod.exports;
}

test("legacy PDF notes use the PDF icon even when originally marked typed", () => {
  const { noteKind, noteKindIcon } = load();
  for (const initialSurface of [undefined, "typed", "ink", "pdf"]) {
    assert.equal(noteKindIcon(noteKind({ initialSurface }, [{ kind: "pdf" }])), "picture_as_pdf");
  }
  assert.equal(noteKindIcon(noteKind({ initialSurface: "typed" }, [{ kind: "typed" }, { kind: "pdf", hidden: true }])), "picture_as_pdf", "closing a PDF tab does not remove the PDF from the note");
});

test("deleted PDFs do not mislabel handwriting or typed notes", () => {
  const { noteKind, noteKindIcon } = load();
  assert.equal(noteKindIcon(noteKind({ initialSurface: "typed" }, [{ kind: "pdf", deleted: true }, { kind: "ink" }])), "draw");
  assert.equal(noteKindIcon(noteKind({}, [{ kind: "pdf", deleted: true }, { kind: "typed" }])), "description");
  assert.equal(noteKindIcon(noteKind({ initialSurface: "pdf" })), "picture_as_pdf");
});

test("type lookup reads only metadata with bounded concurrency and skips declared PDFs", async () => {
  const paths = [];
  let active = 0, maximum = 0;
  const { loadNoteKinds } = load(async path => {
    paths.push(path); active++; maximum = Math.max(active, maximum);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return [{ kind: path.includes("old-pdf") ? "pdf" : "ink" }];
  });
  const notes = Array.from({ length: 12 }, (_, index) => ({ id: `old-pdf-${index}`, initialSurface: "typed" }));
  const result = await loadNoteKinds([...notes, { id: "new-pdf", initialSurface: "pdf" }]);
  assert.equal(maximum, 4);
  assert.equal(paths.length, 12);
  assert.ok(paths.every(path => /^notes\/[^/]+\/surfaces$/.test(path)));
  assert.ok(Object.values(result).every(kind => kind === "pdf"));
});

test("failed metadata reads do not invent a type and canceled loads stop queuing reads", async () => {
  const { loadNoteKinds } = load(async () => { throw new Error("Offline"); });
  assert.deepEqual(await loadNoteKinds([{ id: "old", initialSurface: "typed" }]), {});
  assert.deepEqual(await loadNoteKinds([{ id: "old" }], () => true), {});
});

test("canvas and whiteboard retain separate types and embedded drawings keep typed notes typed", async () => {
  const { noteKind, loadNoteKinds } = load();
  assert.equal(noteKind({ initialSurface: "whiteboard" }), "whiteboard");
  assert.equal(noteKind({ initialSurface: "canvas" }), "canvas");
  assert.equal(noteKind({ initialSurface: "typed" }, [{ kind: "canvas", hidden: true }]), "typed");
  assert.deepEqual(await loadNoteKinds([{ id: "board", initialSurface: "whiteboard" }, { id: "canvas", initialSurface: "canvas" }]), { board: "whiteboard", canvas: "canvas" });
});
