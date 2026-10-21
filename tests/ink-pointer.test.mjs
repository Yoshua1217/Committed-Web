import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(path, globals = {}) {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", ...Object.keys(globals), compiled)(mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}
const model = load("../src/lib/ink-model.ts");
const pointer = load("../src/lib/ink-pointer.ts");
test("native bridge supplies button state and release overrides stale browser barrel bits", () => {
  let held = true;
  const native = load("../src/lib/ink-pointer.ts", { window: { CommittedStylus: { isButtonPressed: () => held } } });
  assert.equal(native.penEraserHeld({ pointerType: "pen", buttons: 1 }, native.nativePenButtonHeld()), true);
  held = false;
  assert.equal(native.penEraserHeld({ pointerType: "pen", buttons: 3 }, native.nativePenButtonHeld()), false);
  assert.equal(native.penEraserHeld({ pointerType: "mouse", buttons: 2 }, true), false);
  assert.equal(pointer.nativePenButtonHeld(), null, "browser/SSR fallback needs no native bridge");
});
const source = fs.readFileSync(new URL("../src/components/ink-canvas.tsx", import.meta.url), "utf8");
const start = source.indexOf("    const viewport = viewportRef.current!, live = liveRef.current!, settled = settledRef.current!;");
const body = source.slice(start, source.indexOf("    // Native handlers read current values", start));
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(tool = "pen", raw = false, buttonEraser = "eraser") {
  const handlers = new Map();
  const windowHandlers = new Map();
  let nativeHeld = null;
  const noop = () => {};
  const context = new Proxy({}, { get: () => noop });
  const canvas = { getContext: () => context, style: {}, width: 816 };
  const viewport = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }), closest: () => null,
    setPointerCapture: noop, addEventListener: (name, handler) => handlers.set(name, handler), removeEventListener: noop,
  };
  const options = {
    tool, buttonEraser, objects: [], selected: [], paper: { width: 816, height: 1056 },
    pen: { ...model.STARTER_PENS[0], style: "pen" }, eraserSize: 30,
    partialEraser: false, enhancer: false, study: false, touch: "pan",
    onChange: objects => { options.objects = objects; }, onSelect: noop, onText: noop,
  };
  const ref = current => ({ current });
  const scope = {
    ...model, ...pointer,
    nativePenButtonHeld: () => nativeHeld,
    diagramLayer: ref({ style: {} }), viewportRef: ref(viewport), liveRef: ref(canvas), settledRef: ref(canvas), cursorRef: ref({ style: {} }),
    latest: ref(options), view: ref({ x: 0, y: 0, scale: 1 }), repaint: ref(noop),
    gestureActive: ref(false), refreshResolution: ref(noop), documentViewRef: ref(null), fitMode: ref("auto"),
    setZoomOpen: noop, setZoomLabel: noop, applyView: noop, zoom: noop,
    drawObject: noop, drawObjects: noop, drawSegment: noop, snapPdfHighlight: stroke => stroke,
    window: { ...(raw ? { onpointerrawupdate: null } : {}),
      addEventListener: (name, handler) => windowHandlers.set(name, handler),
      removeEventListener: name => windowHandlers.delete(name),
    },
  };
  const cleanup = new Function(...Object.keys(scope), compiled)(...Object.values(scope));
  function send(type, x, buttons, extra = {}) {
    handlers.get(type)({ type, pointerType: "pen", pointerId: 1, clientX: x, clientY: 100,
      buttons, button: -1, pressure: buttons & 33 ? .5 : 0, timeStamp: x,
      target: viewport, preventDefault: noop, ...extra });
  }
  return { options, send, cleanup, scope,
    nativeButton(pressed) { nativeHeld = pressed; windowHandlers.get("committed-pen-button")?.(); },
  };
}

for (const raw of [false, true]) test(`button hold splits pen → eraser → pen during contact (raw=${raw})`, () => {
  const f = fixture("pen", raw), move = raw ? "pointerrawupdate" : "pointermove";
  try {
    f.send("pointerdown", 100, 1, { button: 0 });
    f.send(move, 120, 1);
    f.send(move, 300, 3, { button: 2 });
    assert.equal(f.options.objects.length, 1);
    assert.equal(f.options.objects[0].points.at(-1).x, 120, "switch must not connect distant locations");
    f.send(move, 120, 3);
    f.send(move, 400, 1, { button: 2 });
    f.send(move, 420, 1);
    f.send("pointerup", 420, 0, { button: 0 });
    assert.equal(f.options.tool, "pen");
    assert.equal(f.options.objects.length, 1, "erased stroke stays deleted");
    assert.equal(f.options.objects[0].points[0].x, 400);
  } finally { f.cleanup(); }
});

for (const tool of ["pan", "text", "lasso", "shape"]) test(`held button overrides ${tool} and preserves selection`, () => {
  const f = fixture(tool);
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.send("pointerdown", 100, 3, { button: 0 });
    f.send("pointerup", 100, 0);
    assert.deepEqual(f.options.objects, []);
    assert.equal(f.options.tool, tool);
  } finally { f.cleanup(); }
});

test("hover button does not erase; tip contact and lift work while button stays held", () => {
  const f = fixture();
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.send("pointerdown", 100, 2, { button: 2 });
    assert.equal(f.options.objects.length, 1);
    f.send("pointermove", 100, 3, { button: 0 });
    f.send("pointermove", 100, 2, { button: 0 });
    assert.deepEqual(f.options.objects, []);
    f.send("pointermove", 400, 2);
    f.send("pointerup", 400, 0, { button: 2 });
    assert.deepEqual(f.options.objects, []);
  } finally { f.cleanup(); }
});

for (const raw of [false, true]) test(`native button switches tools when WebView omits browser button bits (raw=${raw})`, () => {
  const f = fixture("pen", raw), move = raw ? "pointerrawupdate" : "pointermove";
  try {
    f.send("pointerdown", 100, 1, { button: 0 });
    f.send(move, 120, 1);
    f.nativeButton(true);
    f.send(move, 100, 1);
    f.nativeButton(false);
    f.send(move, 140, 1);
    f.send("pointerup", 140, 0);
    assert.equal(f.options.tool, "pen");
    assert.equal(f.options.objects.length, 1);
    assert.equal(f.options.objects[0].points[0].x, 100);
    assert.equal(f.options.objects[0].points.at(-1).x, 140);
  } finally { f.cleanup(); }
});

for (const native of [false, true]) test(`whiteboard hold uses drawer's 70-screen-pixel partial eraser (native=${native})`, () => {
  const f = fixture("pen", false, "whiteboard-eraser");
  try {
    f.scope.view.current.scale = 2;
    // Width and partial settings differ deliberately from the drawer eraser.
    f.options.eraserSize = 2;
    f.options.partialEraser = false;
    f.options.objects = [{ id: "ink", kind: "stroke", color: "#000000", width: 2,
      points: Array.from({ length: 21 }, (_, i) => ({ x: 50 + i * 5, y: 50, p: .5 })) }];
    if (native) f.nativeButton(true);
    f.send("pointerdown", 200, native ? 1 : 3, { button: 0 });
    assert.equal(f.scope.cursorRef.current.style.width, "70px");
    f.send("pointerup", 200, 0);
    assert.equal(f.options.objects.length, 2, "partial eraser keeps both ends of the stroke");
    assert.ok(f.options.objects[0].points.at(-1).x < 90, "drawer footprint exceeds the regular eraser size");
    if (native) f.nativeButton(false);
    f.send("pointerdown", 400, 1, { button: 0 });
    f.send("pointerup", 400, 0);
    assert.equal(f.options.objects.length, 3, "release restores the selected pen");
    assert.equal(f.options.tool, "pen");
  } finally { f.cleanup(); }
});

test("native held button before contact erases on handwritten pages without hover edits", () => {
  const f = fixture();
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.send("pointermove", 100, 0);
    f.nativeButton(true);
    assert.equal(f.options.objects.length, 1);
    f.send("pointerdown", 100, 1, { button: 0 });
    f.send("pointerup", 100, 0);
    assert.deepEqual(f.options.objects, []);
    f.nativeButton(false);
    assert.deepEqual(f.options.objects, []);
  } finally { f.cleanup(); }
});

for (const raw of [false, true]) test(`contact reported only as movement starts erasing without a changed-button flag (raw=${raw})`, () => {
  const f = fixture("pen", raw, "whiteboard-eraser");
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.nativeButton(true);
    f.send("pointermove", 100, 0);
    assert.equal(f.options.objects.length, 1, "hover remains non-destructive");
    // No pointerdown: tip contact arrives after a button-held hover, with
    // Chromium's text-selection buttons removed by the Android input adapter.
    f.send(raw ? "pointerrawupdate" : "pointermove", 100, 1, { button: -1 });
    f.send("pointerup", 100, 0);
    assert.deepEqual(f.options.objects, []);
    f.send("pointermove", 200, 0);
    assert.deepEqual(f.options.objects, [], "remaining hover does not start a stroke");
    f.nativeButton(false);
    f.send("pointerdown", 300, 1, { button: 0 });
    f.send("pointerup", 300, 0);
    assert.equal(f.options.objects.length, 1, "button release restores pen input");
  } finally { f.cleanup(); }
});
