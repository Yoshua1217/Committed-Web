import { getBlob, getDownloadURL, listAll, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { MarkdownNote, saveMarkdownNote } from "./notes-service";
import { InkObject, InkPage, NoteSurface, uid } from "./ink-model";
import { objectPath, pagePath, readInk, saveInk, saveInkChanges, surfacePath } from "./ink-service";

/** Copy owned files as well as metadata, so deleting the source cannot break the copy. */
export async function copyNoteWorkspace(source: MarkdownNote, progress: (text: string) => void): Promise<MarkdownNote> {
  const now = Date.now(), copy: MarkdownNote = { ...source, id: uid(), title: `${source.title || "Untitled note"} copy`, createdAt: now, updatedAt: now, sortOrder: now };
  const paths = new Map<string, string>(), urls = new Map<string, string>(), imagePaths = new Map<string, string>();
  const rewriteUrl = (url: string) => { try { return imagePaths.get(ref(storage, url).fullPath) ?? urls.get(url) ?? url; } catch { return url; } };
  const rewriteText = (text: string) => {
    for (const [before, after] of urls) text = text.split(before).join(after);
    // Self-references should open the corresponding page in the copied note.
    return text.replace(/https:\/\/firebasestorage\.googleapis\.com\/[^\s<>)"\]]+/g, rewriteUrl).split(`?note=${source.id}&`).join(`?note=${copy.id}&`);
  };
  await saveMarkdownNote({ ...copy, title: `${copy.title} (copying…)` });
  try {
    for (const folder of ["note-images", "note-files"]) {
      const assets = await listAll(ref(storage, `${folder}/${source.userId}/${source.id}`));
      for (let i = 0; i < assets.items.length; i++) {
        const item = assets.items[i]; progress(`Copying ${folder === "note-images" ? "images" : "files"} · ${i + 1}/${assets.items.length}`);
        const blob = await getBlob(item), target = ref(storage, `${folder}/${source.userId}/${copy.id}/${item.name}`);
        await uploadBytes(target, blob, { contentType: blob.type }); paths.set(item.fullPath, target.fullPath);
        if (folder === "note-images") { const url = await getDownloadURL(target); urls.set(await getDownloadURL(item), url); imagePaths.set(item.fullPath, url); }
      }
    }
    const surfaces = await readInk<NoteSurface>(surfacePath(source.id));
    for (const surface of surfaces) {
      progress(`Copying ${surface.name}…`);
      await saveInk(surfacePath(copy.id), { ...surface, ...(surface.content !== undefined ? { content: rewriteText(surface.content) } : {}), ...(surface.pdfPath ? { pdfPath: paths.get(surface.pdfPath) ?? surface.pdfPath } : {}) });
      const pages = await readInk<InkPage>(pagePath(source.id, surface.id));
      for (const page of pages) {
        await saveInk(pagePath(copy.id, surface.id), page);
        const objects = await readInk<InkObject>(objectPath(source.id, surface.id, page.id));
        await saveInkChanges(objectPath(copy.id, surface.id, page.id), [], objects.map(o => ({ ...o, ...(o.url ? { url: rewriteUrl(o.url) } : {}) })));
      }
    }
    for (const group of ["recordings", "surfaces/_study/cards"]) {
      const records = await readInk<{ id: string; path?: string }>(`notes/${source.id}/${group}`);
      for (const record of records) await saveInk(`notes/${copy.id}/${group}`, { ...record, ...(record.path ? { path: paths.get(record.path) ?? record.path } : {}) });
    }
    copy.content = rewriteText(source.content); await saveMarkdownNote(copy); return copy;
  } catch (error) {
    await saveMarkdownNote({ ...copy, title: `${copy.title} (incomplete)`, content: rewriteText(source.content) }).catch(() => {});
    throw new Error(`The copy could not finish. Its completed pages are retained in an “incomplete” copy. ${error instanceof Error ? error.message : String(error)}`);
  }
}
