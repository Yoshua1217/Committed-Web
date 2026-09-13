import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
const js = ts.transpileModule(fs.readFileSync(new URL("../src/lib/notes-markdown-export.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { markdownPages } = mod.exports;
test("mixed workspaces export separate typed pages, including closed tabs, without PDF or ink content", () => {
  const pages = markdownPages({ title: "Lecture", content: "Latest main draft" }, [
    { id: "pdf", kind: "pdf", name: "Slides", content: "PDF text", order: 0 },
    { id: "ink", kind: "ink", name: "Writing", order: 1 },
    { id: "later", kind: "typed", name: "Examples", content: "$$x^2$$", order: 3 },
    { id: "closed", kind: "typed", name: "Summary", content: "Latest typed draft", hidden: true, order: 2 },
    { id: "deleted", kind: "typed", name: "Deleted", content: "Omit", deleted: true, order: 4 },
    { id: "main", kind: "typed", name: "Notes", content: "Stale main", order: -1 },
  ]);
  assert.deepEqual(pages, [
    { filename: "Lecture.md", body: "# Lecture\n\nLatest main draft" },
    { filename: "Summary.md", body: "# Summary\n\nLatest typed draft" },
    { filename: "Examples.md", body: "# Examples\n\n$$x^2$$" },
  ]);
});
test("filenames are safe and distinct even with duplicate titles", () => {
  const pages = markdownPages({ title: "Notes", content: "" }, [
    { id: "a", kind: "typed", name: "notes", order: 0 },
    { id: "b", kind: "typed", name: "notes (2)", order: 1 },
    { id: "c", kind: "typed", name: "a/b:c", order: 2 },
  ]);
  assert.deepEqual(pages.map(p => p.filename), ["Notes.md", "notes (2).md", "notes (2) (2).md", "a-b-c.md"]);
});
