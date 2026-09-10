import type { InkObject, InkPage, NoteSurface } from "./ink-model";
import { duplicateSurface, objectPath, pagePath, readInk, saveInk, surfacePath, uploadNoteFile } from "./ink-service";
import { openPdf } from "./note-pdf";

export async function replaceNotePdf(userId: string, noteId: string, surface: NoteSurface, file: File, progress: (message: string) => void) {
  const pdf = await openPdf(file);
  try {
    const pages = await readInk<InkPage>(pagePath(noteId, surface.id));
    const count = surface.pageCount ?? Math.max(0, ...pages.map(p => p.pdfPage ?? 0));
    if (pdf.numPages !== count) throw new Error("To preserve your annotations, replacement PDFs must have the same page count. Import this version as a new tab instead.");
    const text = new Map<number, string>();
    for (const page of pages.filter(p => p.pdfPage)) {
      const source = await pdf.getPage(page.pdfPage!), viewport = source.getViewport({ scale: 96 / 72 });
      if (Math.abs(viewport.width - page.paper.width) > 1 || Math.abs(viewport.height - page.paper.height) > 1) throw new Error("The replacement has different page sizes or rotations. Import it as a new tab to keep your existing annotations aligned.");
      if (!text.has(page.pdfPage!)) text.set(page.pdfPage!, (await source.getTextContent()).items.flatMap(item => "str" in item ? [item.str] : []).join(" ").slice(0, 60_000));
    }
    const path = await uploadNoteFile(userId, noteId, file, file.name, percent => progress(`Uploading replacement · ${percent}%`));
    progress("Preserving the previous PDF and annotations…");
    const backup = await duplicateSurface(noteId, { ...surface, name: `${surface.name} · previous ${new Date().toLocaleDateString()}` });
    await saveInk(surfacePath(noteId), { ...backup, hidden: true });
    for (const page of pages.filter(p => p.pdfPage)) {
      const objects = await readInk<InkObject>(objectPath(noteId, surface.id, page.id)), pdfText = text.get(page.pdfPage!) ?? "";
      await saveInk(pagePath(noteId, surface.id), { ...page, pdfText, searchText: [pdfText, ...objects.flatMap(o => o.text ? [o.text] : [])].join("\n").slice(0, 60_000) });
    }
    const next = { ...surface, pdfPath: path, pdfName: file.name, name: file.name, pageCount: pdf.numPages };
    await saveInk(surfacePath(noteId), next); return next;
  } finally { await pdf.loadingTask.destroy(); }
}
