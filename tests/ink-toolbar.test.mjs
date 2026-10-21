import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
function load(file, dependencies) {
  const source = fs.readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }, jsx = (type, props) => ({ type, props });
  new Function("module", "exports", "require", code)(mod, mod.exports, id => id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : dependencies[id] ?? {});
  return mod.exports.default;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => nodes(child, predicate))];
}
const pens = [{ id: "a", name: "Custom purple", color: "#8123ab", width: 3.5, opacity: .8, style: "fountain" }, { id: "b", name: "My marker", color: "#ffcc00", width: 17, opacity: .3, style: "highlighter" }];
test("shared toolbar exposes every tool and uses saved pens unchanged", () => {
  const react = { useRef: value => ({ current: value }), useEffect() {} };
  const Toolbar = load("ink-toolbar", { react, "./pen-preview": { default: "PenPreview" }, "@/lib/ink-model": { uid: () => "new" } });
  const changed = [], chosen = [], editing = [];
  const prefs = { pens, defaultPen: "b", compact: false };
  const tree = Toolbar({ prefs, pen: pens[1], tool: "pen", pensCollapsed: false, setTool: tool => chosen.push(tool), setPenId: id => chosen.push(id), onPreferences: value => changed.push(value), setEditingPen: pen => editing.push(pen), setPensCollapsed() {}, onImage() {}, onSticky() {} });
  assert.deepEqual(nodes(tree, node => node.type === "PenPreview").map(node => node.props.pen), pens);
  const buttons = nodes(tree, node => node.type === "button");
  for (const label of ["Eraser", "Lasso", "Shapes", "Insert image", "Text", "Cover answers for study", "Pan", "Select objects", "Connect shapes", "Sticky note"]) assert.ok(buttons.some(button => button.props["aria-label"] === label), label);
  const custom = buttons.find(button => button.props["aria-label"]?.startsWith("Custom purple"));
  custom.props.onClick(); custom.props.onDoubleClick();
  assert.deepEqual(chosen, ["a", "pen"]); assert.equal(editing[0], pens[0]);
  buttons.find(button => button.props.title === "Add saved pen").props.onClick();
  assert.equal(changed[0].pens.length, 3); assert.equal(changed[0].pens[2].color, pens[1].color);
});
test("canvas passes the full saved preferences and default pen into the shared toolbar", () => {
  const react = { useState: value => [typeof value === "function" ? value() : value, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect() {}, useLayoutEffect() {} };
  const Canvas = load("infinite-canvas", { react, "./ink-toolbar": { default: "InkToolbar" }, "@/lib/ink-model": { DEFAULT_INK_PREFERENCES: { pens } }, "@/lib/ink-history": { InkHistory: class { undo=[]; redo=[]; } } });
  const preferences = { pens, defaultPen: "b", compact: false }, onPreferences = () => {};
  const tree = Canvas({ objects: [], onChange() {}, pens, storageKey: "test", preferences, onPreferences });
  const toolbar = nodes(tree, node => node.type === "InkToolbar")[0];
  assert.equal(toolbar.props.prefs, preferences);
  assert.equal(toolbar.props.pen, pens[1]);
  assert.equal(toolbar.props.pensCollapsed, false);
  assert.equal(toolbar.props.onPreferences, onPreferences);
  assert.equal(typeof toolbar.props.onImage, "function");
  assert.equal("documentTools" in toolbar.props, false);
});
