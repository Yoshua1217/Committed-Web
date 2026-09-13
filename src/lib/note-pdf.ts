import { InkObject, InkPage, NoteSurface } from "./ink-model";
import { objectPath, readInk, readNoteFile } from "./ink-service";
import { objectsPng } from "./ink-renderer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfTextLine } from "./pdf-highlight";
export type { PdfTextLine } from "./pdf-highlight";

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  // Next assets expose the deployment prefix, including GitHub Pages subpaths.
  const script = document.querySelector<HTMLScriptElement>('script[src*="/_next/"]');
  const base = script ? new URL(script.src).pathname.split("/_next/")[0] : "";
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
  return pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: `${base}/pdf-cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}/pdf-fonts/`, wasmUrl: `${base}/pdf-wasm/` }).promise;
}
export async function renderPdfPage(pdf: PDFDocumentProxy, pageNumber: number, width: number, scale = 1.5) {
  const page = await pdf.getPage(pageNumber), natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / natural.width });
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width * scale); canvas.height = Math.ceil(viewport.height * scale);
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas, canvasContext: ctx, viewport, transform: [scale, 0, 0, scale, 0, 0] }).promise;
  const text = await page.getTextContent();
  const lines: PdfTextLine[] = text.items.flatMap(item => {
    if (!("str" in item)) return [];
    const [a, b, c, d, x, y] = item.transform, length = Math.hypot(a, b) || 1;
    const dx = a / length * item.width, dy = b / length * item.width;
    const corners = [[x, y], [x + dx, y + dy], [x + c, y + d], [x + dx + c, y + dy + d]].map(([px, py]) => viewport.convertToViewportPoint(px, py));
    const left = Math.min(...corners.map(p => p[0])), top = Math.min(...corners.map(p => p[1]));
    const [sx, sy] = viewport.convertToViewportPoint(x + c / 2, y + d / 2);
    const [ex, ey] = viewport.convertToViewportPoint(x + dx + c / 2, y + dy + d / 2);
    const runLength = Math.hypot(ex - sx, ey - sy);
    const ux = runLength ? (ex - sx) / runLength : 1, uy = runLength ? (ey - sy) / runLength : 0;
    const height = Math.abs((corners[2][0] - corners[0][0]) * -uy + (corners[2][1] - corners[0][1]) * ux);
    return [{ text: item.str, x: left, y: top, w: Math.max(1, Math.max(...corners.map(p => p[0])) - left), h: Math.max(1, Math.max(...corners.map(p => p[1])) - top), baseline: { x: sx, y: sy, ux, uy, length: runLength, height: Math.max(1, height) } }];
  });
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PDF page could not be rendered.")), "image/png"));
  return { url: URL.createObjectURL(blob), lines, width: viewport.width, height: viewport.height };
}
export async function downloadBlob(blob: Blob, name: string) {
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (Capacitor.getPlatform() === "android") {
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const files = registerPlugin<{ saveFile: (options: { name: string; mimeType: string; data: string }) => Promise<void> }>("NoteFiles");
    await files.saveFile({ name, mimeType: blob.type, data: dataUrl.split(",")[1] }); return;
  }
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export async function exportSurfacePdf(noteId: string, surface: NoteSurface, pages: InkPage[], progress: (message: string) => void) {
  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create();
  const source = surface.pdfPath ? await PDFDocument.load(await (await readNoteFile(surface.pdfPath)).arrayBuffer()) : null;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]; progress(`Exporting page ${i + 1} of ${pages.length}…`);
    const objects = await readInk<InkObject>(objectPath(noteId, surface.id, page.id));
    const hasPdf = source && page.pdfPage !== undefined;
    // Flatten source rotation into a new page so annotations use the same visual
    // coordinate system as PDF.js, including rotated lecture slides.
    const destination = output.addPage([page.paper.width * .75, page.paper.height * .75]);
    if (hasPdf) {
      const original = source.getPage(page.pdfPage! - 1), angle = ((original.getRotation().angle % 360) + 360) % 360;
      const embedded = await output.embedPage(original);
      const { degrees } = await import("pdf-lib");
      const w = destination.getWidth(), h = destination.getHeight();
      destination.drawPage(embedded, { x: angle === 180 || angle === 270 ? w : 0, y: angle === 90 || angle === 180 ? h : 0, width: angle % 180 ? h : w, height: angle % 180 ? w : h, rotate: degrees(-angle) });
    }
    const png = await objectsPng(objects, page.paper, Boolean(hasPdf));
    const overlay = await output.embedPng(await png.arrayBuffer());
    destination.drawImage(overlay, { x: 0, y: 0, width: destination.getWidth(), height: destination.getHeight() });
  }
  await downloadBlob(new Blob([new Uint8Array(await output.save())], { type: "application/pdf" }), `${surface.name.replace(/\.pdf$/i, "")}-annotated.pdf`);
}
