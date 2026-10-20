import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

// Run the real viewport component against a deterministic display-frame queue.
function fixture() {
  const slots = [], effects = [], cleanups = [], frames = new Map();
  let cursor = 0, id = 0, reads = 0, scrollCalls = 0, lastScrollTop = 0, scrollHandler;
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useContext: () => null,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useLayoutEffect(callback, deps) {
      const index = cursor++;
      if (!deps || !slots[index] || deps.some((value, i) => value !== slots[index][i])) {
        slots[index] = deps;
        effects.push(callback);
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const source = fs.readFileSync(new URL("../src/components/ink-document-viewport.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", compiled)(
    mod, mod.exports, name => name === "react" ? react : { jsx, jsxs: jsx },
    callback => { frames.set(++id, callback); return id; }, key => frames.delete(key),
    class { observe() {} disconnect() {} },
  );
  const element = {
    clientWidth: 1000, clientHeight: 700, scrollLeft: 100, scrollTop: 200,
    getBoundingClientRect() { reads++; return { left: 0, top: 0 }; },
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  function render() {
    cursor = 0;
    const tree = mod.exports.default({ pages: [{ paper: { width: 816, height: 1056 } }], reading: true, onScroll(element) { scrollCalls++; lastScrollTop = element.scrollTop; }, children: null });
    scrollHandler = tree.props.children.props.children[1].props.onScroll;
    slots[0].current = element;
    effects.splice(0).forEach(callback => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); });
    return tree.props.value;
  }
  return {
    render, element, frames, get reads() { return reads; }, get scrollCalls() { return scrollCalls; }, get lastScrollTop() { return lastScrollTop; },
    scroll() { scrollHandler(); },
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    unmount() { cleanups.forEach(cleanup => cleanup()); },
  };
}

test("scroll tracking batches bursts and reads the final position once per frame", () => {
  const f = fixture();
  f.render();
  for (let i = 0; i < 30; i++) { f.element.scrollTop = i * 10; f.scroll(); }
  assert.equal(f.frames.size, 1);
  assert.equal(f.scrollCalls, 0);
  f.flush();
  assert.equal(f.scrollCalls, 1);
  assert.equal(f.lastScrollTop, 290);
  f.scroll();
  f.unmount();
  assert.equal(f.frames.size, 0);
});

test("a wheel burst commits once per display frame and retains every zoom increment", () => {
  const f = fixture();
  let view = f.render();
  for (let i = 0; i < 20; i++) view.zoom(1.01, 250, 300);
  assert.equal(f.frames.size, 1);
  assert.equal(f.reads, 0, "input handlers must not repeatedly force layout");
  f.flush();
  view = f.render();
  const expected = 1.01 ** 20;
  assert.ok(Math.abs(view.scale - expected) < 1e-12);
  assert.equal(f.reads, 1);
  assert.ok(Math.abs(f.element.scrollLeft - ((100 + 250) * expected - 250)) < 1e-9);
  assert.ok(Math.abs(f.element.scrollTop - ((200 + 300) * expected - 300)) < 1e-9);

  view.zoom(.5, 250, 300);
  f.flush();
  view = f.render();
  assert.ok(Math.abs(view.scale - expected * .5) < 1e-12);
  assert.ok(Math.abs(f.element.scrollTop - ((200 + 300) * expected * .5 - 300)) < 1e-9, "successive frames anchor against the committed scale");
});

test("zoom clamps at both limits and cancels a queued frame on unmount", () => {
  const f = fixture();
  let view = f.render();
  view.zoom(100);
  f.flush();
  view = f.render();
  assert.equal(view.scale, 6);
  view.zoom(.0001);
  f.flush();
  view = f.render();
  assert.equal(view.scale, .1);
  view.zoom(2);
  assert.equal(f.frames.size, 1);
  f.unmount();
  assert.equal(f.frames.size, 0);
});
