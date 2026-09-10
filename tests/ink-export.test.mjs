import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { PDFDocument, degrees, rgb } from "pdf-lib";
const nodeRequire = createRequire(import.meta.url);
globalThis.DOMMatrix = DOMMatrix; globalThis.ImageData = ImageData; globalThis.Path2D = Path2D;
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const urls = new Map(); let downloaded;
const browserDocument = { createElement(kind) {
  if (kind === "a") return { href: "", click() { downloaded = urls.get(this.href); } };
  const canvas = createCanvas(1, 1); canvas.toBlob = cb => cb(new Blob([canvas.toBuffer("image/png")], { type: "image/png" })); return canvas;
} };
const fakeUrl = { createObjectURL(blob) { const id = String(urls.size); urls.set(id, blob); return id; }, revokeObjectURL() {} };
function load(name, dependencies = {}) { const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; const mod = { exports: {} }; new Function("module", "exports", "require", "document", "URL", "setTimeout", js)(mod, mod.exports, id => dependencies[id] ?? nodeRequire(id), browserDocument, fakeUrl, () => 0); return mod.exports; }
const model = load("ink-model"), renderer = load("ink-renderer", { "./ink-model": model });
async function render(bytes, number) { const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise; const page = await pdf.getPage(number); const viewport = page.getViewport({ scale: 1 }); const canvas = createCanvas(viewport.width, viewport.height); await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise; await pdf.loadingTask.destroy(); return canvas; }
test("PDF export keeps page geometry and visible content at all four rotations", async () => {
  const source = await PDFDocument.create(), pages = [];
  for (const [i, angle] of [0, 90, 180, 270].entries()) { const page = source.addPage([240, 320]); page.setRotation(degrees(angle)); page.drawRectangle({ x: 20, y: 230, width: 70, height: 40, color: rgb(.9, .1, .2) }); page.drawRectangle({ x: 130, y: 30, width: 20, height: 80, color: rgb(.1, .2, .9) }); pages.push({ id: `page${i}`, order: i, paper: { ...model.DEFAULT_PAPER, width: (angle % 180 ? 320 : 240) / .75, height: (angle % 180 ? 240 : 320) / .75 }, pdfPage: i + 1 }); }
  const bytes = await source.save();
  const service = { readNoteFile: async () => new Blob([bytes]), readInk: async () => [], objectPath: () => "objects" };
  const pdfExport = load("note-pdf", { "./ink-service": service, "./ink-renderer": renderer, "@capacitor/core": { Capacitor: { getPlatform: () => "web" } } });
  await pdfExport.exportSurfacePdf("note", { id: "pdf", name: "lecture.pdf", pdfPath: "source" }, pages, () => {});
  assert.ok(downloaded instanceof Blob);
  const exported = new Uint8Array(await downloaded.arrayBuffer()), parsed = await PDFDocument.load(exported); assert.equal(parsed.getPageCount(), 4);
  for (let i = 0; i < 4; i++) {
    const original = await render(bytes, i + 1), output = await render(exported, i + 1);
    assert.equal(output.width, original.width); assert.equal(output.height, original.height);
    const a = original.getContext("2d").getImageData(0, 0, original.width, original.height).data, b = output.getContext("2d").getImageData(0, 0, output.width, output.height).data;
    let difference = 0; for (let pixel = 0; pixel < a.length; pixel++) difference += Math.abs(a[pixel] - b[pixel]);
    assert.ok(difference / a.length < .2, `rotation ${i * 90}: average pixel difference ${difference / a.length}`);
  }
});
test("exported handwriting remains visible and blank inserted pages retain paper dimensions", async () => {
  const ink = { id: "stroke", kind: "stroke", points: [{ x: 30, y: 50, p: .5, t: 0 }, { x: 220, y: 50, p: .5, t: 10 }], color: "#ff0000", width: 8, opacity: 1, style: "pen", pressure: 0, order: 1 };
  const pdfExport = load("note-pdf", { "./ink-service": { readInk: async () => [ink], objectPath: () => "objects" }, "./ink-renderer": renderer, "@capacitor/core": { Capacitor: { getPlatform: () => "web" } } });
  await pdfExport.exportSurfacePdf("note", { id: "ink", name: "Handwriting" }, [{ id: "page", paper: { ...model.DEFAULT_PAPER, kind: "blank", margin: false, width: 320, height: 400 } }], () => {});
  const canvas = await render(new Uint8Array(await downloaded.arrayBuffer()), 1); assert.equal(canvas.width, 240); assert.equal(canvas.height, 300);
  const pixel = canvas.getContext("2d").getImageData(80, 37, 1, 1).data; assert.ok(pixel[0] > 220 && pixel[1] < 50 && pixel[2] < 50, `expected red ink, got ${pixel}`);
});
test("PDF text selection follows the page rotation", async () => {
  const source = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) { const page = source.addPage([240, 320]); page.setRotation(degrees(angle)); page.drawText("Catalyst", { x: 30, y: 200, size: 20 }); }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await source.save()), disableFontFace: true, standardFontDataUrl: fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)).replaceAll("\\", "/") }).promise;
  const reader = load("note-pdf", { "./ink-service": {}, "./ink-renderer": renderer });
  try { for (let i = 1; i <= 4; i++) {
    const result = await reader.renderPdfPage(pdf, i, i % 2 ? 240 : 320, 1), line = result.lines.find(l => l.text === "Catalyst");
    assert.ok(line); assert.ok(line.x >= 0 && line.y >= 0 && line.x + line.w <= result.width && line.y + line.h <= result.height);
    assert.equal(line.w > line.h, i % 2 === 1, `rotation ${(i - 1) * 90} must orient the selection with the text`);
  } } finally { await pdf.loadingTask.destroy(); }
});

test("stationary fountain pooling renders wider ink after save and reload", () => {
  const renderDot = pool => {
    const canvas = createCanvas(60, 60);
    const object = { id: "pool", kind: "stroke", points: [{ x: 30, y: 30, p: .5, t: 0, pool }], width: 6, color: "#000000", opacity: 1, style: "fountain", pressure: 0, order: 1 };
    renderer.drawObject(canvas.getContext("2d"), JSON.parse(JSON.stringify(object)));
    return canvas.getContext("2d").getImageData(36, 30, 1, 1).data[3];
  };
  assert.equal(renderDot(1), 0);
  assert.ok(renderDot(3) > 200);
});

test("fountain ribbons taper continuously and apply opacity once across joins", () => {
  const canvas = createCanvas(140, 80), ctx = canvas.getContext("2d");
  renderer.drawObject(ctx, { id: "ribbon", kind: "stroke", points: [
    { x: 20, y: 40, p: .5, t: 0, pool: 1 },
    { x: 70, y: 40, p: .5, t: 50, pool: 3 },
    { x: 120, y: 40, p: .5, t: 100, pool: 5 },
  ], width: 4, minWidth: 4, maxWidth: 20, color: "#000000", opacity: .5, style: "fountain", pressure: 0, order: 1 });
  let previous = 0;
  for (let x = 25; x < 116; x++) {
    let height = 0;
    for (let y = 0; y < 80; y++) if (ctx.getImageData(x, y, 1, 1).data[3] > 64) height++;
    assert.ok(height >= previous && height <= previous + 2 || previous === 0);
    previous = height;
    assert.ok(Math.abs(ctx.getImageData(x, 40, 1, 1).data[3] - 128) <= 1);
  }
});
