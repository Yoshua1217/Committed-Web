import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function fixture(kind, initialSurfaces = [], content = "", remembered) {
  const slots = [], effects = [], writes = [], changes = [], inserted = [];
  const storage = new Map(remembered ? [["ink-surface:u:n", remembered]] : []);
  const records = new Map(initialSurfaces.map(surface => [surface.id, surface]));
  let cursor = 0, sequence = 0, receive;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback) { const index = cursor++; return slots[index] ??= callback; },
    useEffect(callback, deps) { const index = cursor++; if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) { slots[index] = deps; effects.push(callback); } },
  };
  const paper = { width: 816, height: 1056 };
  const dependencies = {
    react,
    "react-dom": { createPortal: value => value },
    "next/dynamic": { default: () => "InkEditor" },
    "@/lib/ink-model": { DEFAULT_INK_PREFERENCES: { paper }, courseForNotebook: () => null, uid: () => `id-${++sequence}`, newPage: (paper, order) => ({ id: `page-${++sequence}`, paper, order }) },
    "@/lib/ink-service": {
      surfacePath: () => "surfaces", pagePath: (_, id) => `pages/${id}`, coursesPath: () => "courses",
      listenInk(path, callback) { if (path === "surfaces") { receive = callback; callback([...records.values()]); } else callback([]); return () => {}; },
      subscribeInkPreferences(_, callback) { callback({ paper }); return () => {}; },
      async saveInk(path, value) { writes.push({ path, value }); if (path === "surfaces") { records.set(value.id, value); receive([...records.values()]); } },
      uploadNoteFile: async () => "file.pdf",
    },
    "@/lib/notes-local-drafts": { readSurfaceDrafts: () => [], storeSurfaceDrafts: () => true },
    "@/lib/note-pdf": { openPdf: async () => ({ numPages: 1, getPage: async () => ({ getViewport: () => paper, getTextContent: async () => ({ items: [] }), cleanup() {} }), loadingTask: { destroy: async () => {} } }) },
  };
  const jsx = (type, props) => ({ type, props });
  dependencies["react/jsx-runtime"] = { jsx, jsxs: jsx };
  const source = fs.readFileSync(new URL("../src/components/note-workspace.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", "localStorage", "location", compiled)(mod, mod.exports, id => dependencies[id] ?? {}, { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, { search: "" });
  const onSurfaceChange = value => changes.push(value);
  return {
    writes, changes, inserted,
    render() {
      let tree;
      for (let i = 0; i < 4; i++) {
        cursor = 0;
        tree = mod.exports.default({ note: { id: "n", userId: "u", initialSurface: kind, content }, children: "MAIN_TEXT_EDITOR", onSurfaceChange, onInsert: value => inserted.push(value) });
        effects.splice(0).forEach(effect => effect());
      }
      return tree;
    },
  };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => nodes(child, predicate))];
}
const tabs = tree => nodes(tree, node => node.props?.role === "tab");
const button = (tree, text) => nodes(tree, node => node.type === "button" && [node.props.children].flat(Infinity).includes(text))[0];

test("new handwriting notes open handwriting directly with no implicit text page", () => {
  const f = fixture("ink"), tree = f.render();
  assert.deepEqual(tabs(tree).map(tab => tab.props.children[1]), ["Handwriting"]);
  assert.equal(nodes(tree, node => node.type === "InkEditor")[0].props.surface.kind, "ink");
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 0);
  assert.equal(f.changes.at(-1), false);
  assert.equal(f.writes.filter(write => write.path === "surfaces" && write.value.kind === "typed").length, 0);
  assert.equal(f.writes.filter(write => write.path === "pages/handwriting").length, 1, "bootstrap creates one first page");
});

test("new PDF notes show a direct importer, then the imported PDF without a text page", async () => {
  const f = fixture("pdf");
  let tree = f.render();
  assert.equal(tabs(tree).length, 0);
  assert.ok(button(tree, "Choose PDF"));
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 0);
  const input = nodes(tree, node => node.type === "input" && node.props.type === "file")[0];
  input.props.onChange({ target: { files: [{ name: "Lecture.pdf" }], value: "file" } });
  // Flush the asynchronous PDF upload and metadata preparation.
  await new Promise(resolve => setImmediate(resolve));
  tree = f.render();
  assert.deepEqual(tabs(tree).map(tab => tab.props.children[1]), ["Lecture.pdf"]);
  assert.equal(nodes(tree, node => node.type === "InkEditor")[0].props.surface.kind, "pdf");
  assert.equal(f.writes.filter(write => write.value.kind === "typed").length, 0);
});

test("reopening a PDF note ignores an obsolete remembered main text tab", () => {
  const f = fixture("pdf", [{ id: "pdf", kind: "pdf", name: "Slides", order: 0 }], "", "main");
  const tree = f.render();
  assert.equal(tabs(tree).length, 1);
  assert.equal(tabs(tree)[0].props["aria-selected"], true);
  assert.equal(nodes(tree, node => node.type === "InkEditor")[0].props.surface.id, "pdf");
});

test("legacy notes with an empty default text page open their existing document", () => {
  for (const initialKind of [undefined, "typed"]) {
    for (const documentKind of ["ink", "pdf"]) {
      const document = { id: "existing", kind: documentKind, name: "Existing content", order: 0 };
      const f = fixture(initialKind, [document], " \n\t", "main");
      const tree = f.render();
      assert.deepEqual(tabs(tree).map(tab => tab.props.children[1]), ["Existing content"]);
      assert.equal(nodes(tree, node => node.type === "InkEditor")[0].props.surface.id, "existing");
      assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 0);
      assert.equal(f.writes.length, 0, "opening the old note never deletes or rewrites its contents");
    }
  }
});

test("legacy mixed notes retain real text and ignore closed or deleted documents", () => {
  const document = { id: "pdf", kind: "pdf", name: "Slides", order: 0 };
  for (const [content, surfaces] of [["Keep my text", [document]], ["", [{ ...document, hidden: true }]], ["", [{ ...document, deleted: true }]]]) {
    const tree = fixture("typed", surfaces, content, "main").render();
    assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 1);
  }
});

test("a legacy document can still receive an explicitly added text page", async () => {
  const f = fixture("typed", [{ id: "pdf", kind: "pdf", name: "Slides", order: 0 }]);
  let tree = f.render();
  nodes(tree, node => node.props?.["aria-label"] === "Add a surface")[0].props.onClick();
  tree = f.render();
  await button(tree, "T Typed note").props.onClick();
  tree = f.render();
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 1);
  assert.equal(tabs(tree).length, 2);
});

test("text pages appear only when explicitly added to a non-text note", async () => {
  const f = fixture("ink");
  let tree = f.render();
  nodes(tree, node => node.props?.["aria-label"] === "Add a surface")[0].props.onClick();
  tree = f.render();
  await button(tree, "T Typed note").props.onClick();
  tree = f.render();
  assert.equal(tabs(tree).length, 2);
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 1);
  assert.equal(f.changes.at(-1), true);
  assert.ok(f.writes.some(write => write.path === "surfaces" && write.value.id === "main"));
});

test("sending ink to text creates the text destination explicitly", () => {
  const f = fixture("ink");
  let tree = f.render();
  nodes(tree, node => node.type === "InkEditor")[0].props.onSend("Converted handwriting");
  tree = f.render();
  assert.ok(nodes(tree, node => node.type === "option" && node.props.children === "New typed notes").length);
  button(tree, "Insert").props.onClick();
  tree = f.render();
  assert.deepEqual(f.inserted, ["Converted handwriting"]);
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 1);
});

test("typed notes and existing text remain available", () => {
  for (const [kind, content] of [["typed", ""], [undefined, "Legacy content"], ["ink", "Existing typed text"], ["pdf", "Existing PDF notes"]]) {
    const tree = fixture(kind, [], content).render();
    assert.ok(tabs(tree).some(tab => tab.props.children[1] === "Notes"));
  }
});

test("an explicitly added empty text page survives reopening a PDF note", () => {
  const f = fixture("pdf", [{ id: "main", kind: "typed", name: "Notes", order: -1 }, { id: "pdf", kind: "pdf", name: "Slides", order: 0 }], "", "main");
  const tree = f.render();
  assert.equal(tabs(tree).length, 2);
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 1);
});

test("closing the last handwritten page does not fall back to a phantom text page", () => {
  const f = fixture("ink");
  let tree = f.render();
  nodes(tree, node => node.props?.["aria-label"] === "Handwriting options")[0].props.onClick();
  tree = f.render();
  button(tree, "Close tab").props.onClick();
  tree = f.render();
  assert.equal(tabs(tree).length, 0);
  assert.equal(nodes(tree, node => node.props?.className === "ink-main-typed").length, 0);
  assert.ok(nodes(tree, node => node.props?.children === "No pages open. Use + to add or restore a page.").length);
});
