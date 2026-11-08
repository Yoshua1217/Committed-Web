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

function fixture(tool = "pen", raw = false, buttonEraser = "eraser", deferred = false) {
  const handlers = new Map();
  const windowHandlers = new Map();
  let nativeHeld = null;
  let time = 0, committed = [];
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
    onChange: objects => { committed = objects; if (!deferred) options.objects = objects; }, onSelect: noop, onText: noop,
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
      buttons, button: -1, pressure: buttons & 33 ? .5 : 0, timeStamp: ++time,
      target: viewport, preventDefault: noop, ...extra });
  }
  return { options, send, cleanup, scope,
    get committed() { return committed; },
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
    assert.equal(f.options.objects[0].points[0].x, 140);
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

test("fast curved strokes survive when raw input is advertised but only pointermove arrives", () => {
  const f = fixture("pen", true);
  try {
    f.send("pointerdown", 100, 1, { button: 0 });
    f.send("pointermove", 120, 1, { clientY: 80 });
    f.send("pointermove", 140, 1, { clientY: 100 });
    f.send("pointerup", 100, 0);
    assert.deepEqual(f.committed[0].points.map(p => [p.x, p.y]), [[100, 100], [120, 80], [140, 100], [100, 100]]);
  } finally { f.cleanup(); }
});

test("raw and regular coalesced samples are consumed once in time order", () => {
  const f = fixture("pen", true);
  const sample = (x, timeStamp) => ({ clientX: x, clientY: 100, pointerType: "pen", pressure: .5, timeStamp });
  try {
    f.send("pointerdown", 100, 1, { button: 0, timeStamp: 10 });
    f.send("pointerrawupdate", 140, 1, { timeStamp: 30, getCoalescedEvents: () => [sample(120, 20), sample(140, 30)] });
    f.send("pointermove", 160, 1, { timeStamp: 40, getCoalescedEvents: () => [sample(120, 20), sample(140, 30), sample(160, 40)] });
    f.send("pointerup", 160, 0, { timeStamp: 50 });
    assert.deepEqual(f.committed[0].points.map(p => p.x), [100, 120, 140, 160]);
  } finally { f.cleanup(); }
});

test("distinct samples with the same timestamp survive without replaying coalesced ink", () => {
  const f = fixture("pen", true);
  const sample = x => ({ clientX: x, clientY: 100, pointerType: "pen", pressure: .5, timeStamp: 20 });
  try {
    f.send("pointerdown", 100, 1, { button: 0, timeStamp: 10 });
    f.send("pointerrawupdate", 140, 1, { timeStamp: 20, getCoalescedEvents: () => [sample(120), sample(140)] });
    f.send("pointermove", 160, 1, { timeStamp: 20, getCoalescedEvents: () => [sample(120), sample(140), sample(160)] });
    f.send("pointerup", 160, 0, { timeStamp: 30 });
    assert.deepEqual(f.committed[0].points.map(p => p.x), [100, 120, 140, 160]);
  } finally { f.cleanup(); }
});

test("external object updates still replace the local snapshot after rapid commits", () => {
  const f = fixture("pen", false, "eraser", true);
  try {
    f.send("pointerdown", 100, 1, { button: 0 });
    f.send("pointerup", 120, 0);
    f.options.objects = [{ ...f.committed[0], id: "remote" }];
    f.send("pointerdown", 200, 1, { button: 0 });
    f.send("pointerup", 220, 0);
    assert.equal(f.committed.length, 2);
    assert.equal(f.committed[0].id, "remote");
  } finally { f.cleanup(); }
});

test("rapid strokes retain earlier ink before React renders the previous commit", () => {
  const f = fixture("pen", false, "eraser", true);
  try {
    for (const x of [100, 200, 300]) {
      f.send("pointerdown", x, 1, { button: 0 });
      f.send("pointermove", x + 10, 1);
      f.send("pointerup", x + 20, 0);
    }
    assert.equal(f.committed.length, 3);
    assert.deepEqual(f.committed.map(o => o.points[0].x), [100, 200, 300]);
  } finally { f.cleanup(); }
});

test("erased ink stays deleted when button release and writing share one render", () => {
  const f = fixture("pen", false, "eraser", true);
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.send("pointerdown", 100, 3, { button: 0 });
    f.send("pointermove", 300, 1);
    f.send("pointermove", 320, 1);
    f.send("pointerup", 320, 0);
    assert.equal(f.committed.length, 1);
    assert.equal(f.committed[0].points[0].x, 300);
  } finally { f.cleanup(); }
});

test("native button notifications never replay an old contact into hover edits or dots", () => {
  const f = fixture();
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.nativeButton(true);
    f.send("pointerdown", 100, 1, { button: 0 });
    // Native release can arrive before WebView delivers the corresponding lift.
    f.nativeButton(false);
    f.send("pointerup", 100, 0);
    assert.deepEqual(f.committed, [], "release must not begin a pen dot at the eraser position");
  } finally { f.cleanup(); }
});

test("zero-pressure pen hover cannot erase even with a stale contact bit", () => {
  const f = fixture();
  try {
    f.options.objects = [{ id: "ink", kind: "stroke", points: [{ x: 100, y: 100 }], width: 3 }];
    f.nativeButton(true);
    f.send("pointermove", 100, 1, { pressure: 0 });
    f.send("pointerup", 100, 0);
    assert.equal(f.options.objects.length, 1);
  } finally { f.cleanup(); }
});
