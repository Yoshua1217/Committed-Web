import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
function load(name, dependencies) { const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; const mod = { exports: {} }; new Function("module", "exports", "require", js)(mod, mod.exports, id => { if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`); return dependencies[id]; }); return mod.exports; }
const surfacePath = n => `notes/${n}/surfaces`, pagePath = (n, s) => `${surfacePath(n)}/${s}/pages`, objectPath = (n, s, p) => `${pagePath(n, s)}/${p}/objects`;
const url = path => `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(path)}?alt=media&token=live`;

function copyFixture(failFile = false) {
  const image = "note-images/user/original/image.webp", pdf = "note-files/user/original/slides.pdf", audio = "note-files/user/original/lecture.webm";
  const files = new Map([[image, new Blob(["image"], { type: "image/webp" })], [pdf, new Blob(["pdf"], { type: "application/pdf" })], [audio, new Blob(["audio"], { type: "audio/webm" })]]), writes = new Map(), notes = [];
  const records = new Map([
    [surfacePath("original"), [{ id: "pdf", name: "Slides", kind: "pdf", pdfPath: pdf }, { id: "typed", kind: "typed", name: "Extra", content: `![image](${url(image)})` }]],
    [pagePath("original", "pdf"), [{ id: "page", paper: {}, order: 0, pdfPage: 1 }]],
    [objectPath("original", "pdf", "page"), [{ id: "object", kind: "image", url: url(image), audioRecordingId: "recording", audioTime: 12 }]],
    ["notes/original/recordings", [{ id: "recording", path: audio }]],
    ["notes/original/surfaces/_study/cards", [{ id: "card", question: "Question", answer: "Answer" }]],
  ]);
  const storage = {
    ref: (_, path) => { const fullPath = path.startsWith("https:") ? decodeURIComponent(new URL(path).pathname.split("/o/")[1]) : path; return { fullPath, name: fullPath.split("/").at(-1) }; },
    listAll: async r => ({ items: [...files.keys()].filter(p => p.startsWith(`${r.fullPath}/`)).map(p => storage.ref(null, p)) }),
    getBlob: async r => { if (failFile) throw new Error("Network unavailable"); return files.get(r.fullPath); },
    uploadBytes: async (r, blob) => { files.set(r.fullPath, blob); }, getDownloadURL: async r => url(r.fullPath),
  };
  const service = { surfacePath, pagePath, objectPath, readInk: async p => records.get(p) ?? [], saveInk: async (p, value) => writes.set(`${p}/${value.id}`, value), saveInkChanges: async (p, _, values) => values.forEach(value => writes.set(`${p}/${value.id}`, value)) };
  const { copyNoteWorkspace } = load("note-workspace-copy", { "firebase/storage": storage, "./firebase": { storage: {} }, "./notes-service": { saveMarkdownNote: async note => notes.push(structuredClone(note)) }, "./ink-model": { uid: () => "copy" }, "./ink-service": service });
  return { copyNoteWorkspace, writes, notes, files, source: { id: "original", userId: "user", title: "Lecture", content: `![earlier token](${url(image).replace("token=live", "token=old")})\n[Page](/dashboard/notes/?note=original&surface=pdf&page=page)`, notebookId: "chem", folderId: "chem" } };
}
test("whole-note duplication copies files and retargets image, PDF, recording, and page references", async () => {
  const f = copyFixture(), copy = await f.copyNoteWorkspace(f.source, () => {});
  assert.equal(copy.id, "copy"); assert.equal(copy.notebookId, "chem"); assert.match(copy.content, /note-images%2Fuser%2Fcopy/); assert.match(copy.content, /note=copy&surface=pdf/);
  assert.equal(f.writes.get("notes/copy/surfaces/pdf").pdfPath, "note-files/user/copy/slides.pdf");
  assert.equal(f.writes.get("notes/copy/recordings/recording").path, "note-files/user/copy/lecture.webm");
  assert.match(f.writes.get("notes/copy/surfaces/pdf/pages/page/objects/object").url, /note-images%2Fuser%2Fcopy/);
  assert.equal(f.writes.get("notes/copy/surfaces/pdf/pages/page/objects/object").audioTime, 12);
  assert.equal(f.writes.get("notes/copy/surfaces/_study/cards/card").answer, "Answer");
  f.files.delete("note-files/user/original/slides.pdf"); assert.equal(await f.files.get("note-files/user/copy/slides.pdf").text(), "pdf");
  assert.ok(f.notes.every(n => n.id === "copy"));
});
test("failed duplication retains an explicitly incomplete copy and never modifies its source", async () => {
  const f = copyFixture(true); await assert.rejects(f.copyNoteWorkspace(f.source, () => {}), /incomplete/);
  assert.match(f.notes.at(-1).title, /incomplete/); assert.ok(f.notes.every(n => n.id === "copy")); assert.ok(f.files.has("note-files/user/original/slides.pdf"));
});
test("global page search loads text metadata without drawing objects or deleted surfaces", async () => {
  const reads = [], data = new Map([[surfacePath("n"), [{ id: "pdf", kind: "pdf", name: "Slides" }, { id: "gone", kind: "ink", deleted: true }, { id: "typed", kind: "typed", name: "Summary", content: "Catalyst" }]], [pagePath("n", "pdf"), [{ id: "p", order: 0, label: "Mechanism", searchText: "Reaction rate" }, { id: "deleted", deleted: true }]]]);
  const { loadWorkspaceSearch } = load("note-workspace-search", { "./ink-service": { surfacePath, pagePath, readInk: async path => { reads.push(path); return data.get(path) ?? []; } } });
  const progress = [], entries = await loadWorkspaceSearch([{ id: "n", title: "Chemistry" }], count => progress.push(count));
  assert.equal(entries.length, 2); assert.ok(entries.some(e => e.pageId === "p" && e.text === "Reaction rate")); assert.deepEqual(progress, [1]); assert.deepEqual(reads, [surfacePath("n"), pagePath("n", "pdf")]);
});
test("PDF replacement rejects incompatible pages before uploading or changing the note", async () => {
  let changed = false, destroyed = false;
  const { replaceNotePdf } = load("note-pdf-replacement", { "./note-pdf": { openPdf: async () => ({ numPages: 2, loadingTask: { destroy: async () => { destroyed = true; } } }) }, "./ink-service": { pagePath, readInk: async () => [{ id: "p", pdfPage: 1 }], uploadNoteFile: async () => { changed = true; }, saveInk: async () => { changed = true; } } });
  await assert.rejects(replaceNotePdf("user", "n", { id: "pdf", pageCount: 1 }, new Blob(), () => {}), /same page count/); assert.equal(changed, false); assert.equal(destroyed, true);
});
test("compatible PDF replacement keeps an archived version and leaves annotation objects untouched", async () => {
  const writes = [], page = { id: "p", pdfPage: 1, paper: { width: 816, height: 1056 }, label: "Lecture" };
  const { replaceNotePdf } = load("note-pdf-replacement", {
    "./note-pdf": { openPdf: async () => ({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 816, height: 1056 }), getTextContent: async () => ({ items: [{ str: "Revised PDF text" }] }) }), loadingTask: { destroy: async () => {} } }) },
    "./ink-service": { pagePath, objectPath, surfacePath, readInk: async p => p.endsWith("/objects") ? [{ id: "ink", text: "Reviewed ink" }] : [page], uploadNoteFile: async () => "new.pdf", duplicateSurface: async (_, surface) => ({ ...surface, id: "backup" }), saveInk: async (path, value) => writes.push({ path, value }) },
  });
  const result = await replaceNotePdf("user", "n", { id: "pdf", name: "old.pdf", pdfPath: "old.pdf", pageCount: 1 }, { name: "new.pdf" }, () => {});
  assert.equal(result.pdfPath, "new.pdf"); assert.equal(writes[0].value.id, "backup"); assert.equal(writes[0].value.hidden, true); assert.equal(writes[0].value.pdfPath, "old.pdf");
  assert.match(writes.find(w => w.value.id === "p").value.searchText, /Revised PDF text\nReviewed ink/); assert.ok(writes.every(w => !w.path.endsWith("/objects")));
});
