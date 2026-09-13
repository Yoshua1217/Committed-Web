import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

// Exercise the component's loading and insertion behavior with browser/service boundaries stubbed.
function fixture(initialPages = []) {
  const slots = [], observers = [], effects = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = index === 0 && Array.isArray(initial) ? initialPages : typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) { slots[index] = deps; effects.push(callback); }
    },
    useCallback(callback) { return callback; },
  };
  react.useLayoutEffect = react.useEffect;
  const source = fs.readFileSync(new URL("../src/components/ink-editor.tsx", import.meta.url), "utf8") + "\nexport { StackedPage, ScrollingPdfPage };";
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  const jsx = (type, props, key) => ({ type, props, key });
  const dependencies = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/lib/ink-model": { newPage: (paper, order) => ({ id: "inserted", paper, order }), uid: () => "new" },
    "@/lib/ink-service": { saveInk: async () => {}, pagePath: () => "pages" },
  };
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  new Function("module", "exports", "require", "IntersectionObserver", "requestAnimationFrame", "localStorage", compiled)(mod, mod.exports, id => dependencies[id] ?? {}, Observer, () => 1, { getItem: () => null, setItem() {} });
  return {
    components: mod.exports, observers,
    render(Component, props, runEffects = false) {
      cursor = 0;
      const tree = Component(props);
      if (runEffects) effects.splice(0).forEach(effect => effect());
      return tree;
    },
  };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
}
const paper = { width: 816, height: 1056, color: "#fff" };

test("reader preloads nearby pages and retains them after scrolling away and back", () => {
  const f = fixture(), Component = f.components.ScrollingPdfPage;
  const props = { page: { id: "p", paper, pdfPage: 1 }, pdf: {}, number: 1 };
  f.render(Component, props, true);
  assert.equal(f.observers[0].options.rootMargin, "0px");
  f.observers[0].callback([{ isIntersecting: true }]);
  const loaded = f.render(Component, props);
  const image = loaded.props.children[1].props.children;
  assert.equal(image.props.width, 1600);
  f.observers[0].callback([{ isIntersecting: false }]);
  assert.equal(f.render(Component, props).props.children[1].props.children.type, image.type);
  assert.equal(f.observers[0].disconnected, true);
});

test("editable pages keep their canvas mounted after leaving the preload region", () => {
  const f = fixture(), Component = f.components.StackedPage;
  const editor = { type: "editor" }, props = { page: { id: "p", paper }, number: 1, active: false, children: editor };
  f.render(Component, props, true);
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(f.render(Component, props).props.children[1], editor);
  f.observers[0].callback([{ isIntersecting: false }]);
  assert.equal(f.render(Component, props).props.children[1], editor);
});

test("adding a page inserts it between its neighbors immediately and retains the full editable stack", async () => {
  const f = fixture([{ id: "first", order: 0, paper }, { id: "second", order: 1000, paper }]);
  const props = { userId: "u", noteId: "n", surface: { id: "s" }, preferences: { defaultPen: "pen" }, defaultPaper: paper };
  let tree = f.render(f.components.default, props);
  await find(tree, node => node.props?.["aria-label"] === "Add page").props.onClick();
  tree = f.render(f.components.default, props);
  const stack = find(tree, node => node.props?.["aria-label"] === "Editing pages");
  assert.deepEqual(stack.props.children.map(child => child.props.page.id), ["first", "inserted", "second"]);
  assert.equal(stack.props.children[1].props.active, true);
  assert.equal(stack.props.children[1].props.page.order, 500);
  const tools = stack.props.children.map(child => child.props.children.props.writingTools);
  assert.ok(tools.every(value => value === tools[0]), "all pages share the current editing tool");
});


test("the next page preloads before it intersects the viewport in both modes", () => {
  const reader = fixture();
  const reading = reader.render(reader.components.ScrollingPdfPage, { page: { id: "next", paper, pdfPage: 2 }, pdf: {}, number: 2, preload: true });
  assert.equal(reading.props.children[1].props.children.props.width, 1600);
  const editor = fixture(), canvas = { type: "canvas" };
  const editing = editor.render(editor.components.StackedPage, { page: { id: "next", paper }, number: 2, active: false, preload: true, children: canvas });
  assert.equal(editing.props.children[1], canvas);
});

test("only one page below the current editing page is requested ahead of visibility", () => {
  const f = fixture([0, 1, 2, 3].map(index => ({ id: `p${index}`, order: index * 1000, paper })));
  const tree = f.render(f.components.default, { userId: "u", noteId: "n", surface: { id: "s" }, preferences: { defaultPen: "pen" }, defaultPaper: paper });
  const stack = find(tree, node => node.props?.["aria-label"] === "Editing pages");
  assert.deepEqual(stack.props.children.map(child => child.props.preload), [false, true, false, false]);
});
