import { db, storage } from "./firebase";
import { collection, doc, onSnapshot, setDoc, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { deleteObject, getBlob, listAll, ref, uploadBytesResumable } from "firebase/storage";
import { Course, DEFAULT_INK_PREFERENCES, InkObject, InkPage, InkPreferences, NoteSurface, uid } from "./ink-model";
import { removeWorkspaceDrafts } from "./notes-local-drafts";

export const surfacePath = (noteId: string) => `notes/${noteId}/surfaces`;
export const pagePath = (noteId: string, surfaceId: string) => `${surfacePath(noteId)}/${surfaceId}/pages`;
export const objectPath = (noteId: string, surfaceId: string, pageId: string) => `${pagePath(noteId, surfaceId)}/${pageId}/objects`;
export function listenInk<T>(path: string, callback: (values: T[], pending: boolean, cached: boolean) => void, error: (e: Error) => void) {
  const values = new Map<string, T>();
  let stopped = false, retry: ReturnType<typeof setTimeout> | undefined, unsubscribe = () => {};
  const listen = () => { let first = true; unsubscribe = onSnapshot(collection(db, path), { includeMetadataChanges: true }, snapshot => {
    // Preserve object identities for unchanged strokes. A metadata acknowledgement
    // must not make a page with thousands of strokes redraw from scratch.
    if (first) { const ids = new Set(snapshot.docs.map(d => d.id)); for (const id of values.keys()) if (!ids.has(id)) values.delete(id); first = false; }
    for (const change of snapshot.docChanges()) {
      if (change.type === "removed") values.delete(change.doc.id);
      else values.set(change.doc.id, { ...change.doc.data(), id: change.doc.id } as T);
    }
    callback([...values.values()], snapshot.metadata.hasPendingWrites, snapshot.metadata.fromCache);
  }, e => { error(e); if (!stopped) retry = setTimeout(listen, 2000); }); };
  listen();
  return () => { stopped = true; clearTimeout(retry); unsubscribe(); };
}
export function saveInk<T extends { id: string }>(path: string, value: T) { return setDoc(doc(db, path, value.id), JSON.parse(JSON.stringify(value)), { merge: true }); }
export async function readInk<T>(path: string): Promise<T[]> { return (await getDocs(collection(db, path))).docs.map(d => ({ ...d.data(), id: d.id }) as T); }
/** Only changed objects are written. Two devices adding ink never replace the page. */
export async function saveInkChanges(path: string, before: InkObject[], after: InkObject[]) {
  const previous = new Map(before.map(o => [o.id, o])); const next = new Map(after.map(o => [o.id, o]));
  const changes: { id: string; value?: InkObject }[] = [];
  previous.forEach((_, id) => { if (!next.has(id)) changes.push({ id }); });
  next.forEach((value, id) => { if (previous.get(id) !== value && JSON.stringify(previous.get(id)) !== JSON.stringify(value)) changes.push({ id, value }); });
  for (let i = 0; i < changes.length; i += 400) {
    const batch = writeBatch(db);
    changes.slice(i, i + 400).forEach(c => { const target = doc(db, path, c.id); if (c.value) batch.set(target, JSON.parse(JSON.stringify(c.value))); else batch.delete(target); });
    await batch.commit();
  }
}
export function subscribeInkPreferences(userId: string, callback: (preferences: InkPreferences) => void, error: (e: Error) => void) {
  return onSnapshot(doc(db, "userSettings", userId), snapshot => { const data = snapshot.data()?.inkPreferences; callback({ ...DEFAULT_INK_PREFERENCES, ...data, pens: data?.pens?.length ? data.pens : DEFAULT_INK_PREFERENCES.pens }); }, error);
}
export function saveInkPreferences(userId: string, preferences: InkPreferences) { return setDoc(doc(db, "userSettings", userId), { inkPreferences: preferences }, { merge: true }); }
export const coursesPath = (userId: string) => `userSettings/${userId}/courses`;
export const templatesPath = (userId: string) => `userSettings/${userId}/inkTemplates`;
export async function deleteInkTemplate(userId: string, id: string) { await deleteInkCollection(`${templatesPath(userId)}/${id}/objects`); await deleteDoc(doc(db, templatesPath(userId), id)); }
export function deleteCourse(userId: string, id: string) { return deleteDoc(doc(db, coursesPath(userId), id)); }

// PDFs are cached as Blobs in IndexedDB, never as base64 inside Firestore.
function fileDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open("committed-note-files", 1); request.onupgradeneeded = () => request.result.createObjectStore("files"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function cacheNoteFile(path: string, blob: Blob) {
  const database = await fileDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = database.transaction("files", "readwrite"); tx.objectStore("files").put(blob, path); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { database.close(); }
}
export async function readNoteFile(path: string): Promise<Blob> {
  try { const database = await fileDatabase(); const cached = await new Promise<Blob | undefined>((resolve, reject) => { const request = database.transaction("files").objectStore("files").get(path); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); database.close(); if (cached) return cached; } catch { /* Storage can be unavailable in private browsing. */ }
  const blob = await getBlob(ref(storage, path)); await cacheNoteFile(path, blob).catch(() => {}); return blob;
}
export async function uploadNoteFile(userId: string, noteId: string, file: Blob, name: string, progress: (percent: number) => void) {
  const max = 100;
  if (file.size > max * 1024 * 1024) throw new Error(`Files must be ${max} MB or smaller.`);
  if (!(await file.slice(0, 1024).text()).includes("%PDF-")) throw new Error("This file is not a valid PDF.");
  const path = `note-files/${userId}/${noteId}/${uid()}.pdf`;
  const upload = uploadBytesResumable(ref(storage, path), file, { contentType: "application/pdf", customMetadata: { originalName: name } });
  await new Promise<void>((resolve, reject) => upload.on("state_changed", s => progress(Math.round(s.bytesTransferred / s.totalBytes * 100)), reject, resolve));
  await cacheNoteFile(path, file).catch(() => {}); return path;
}
export async function duplicateSurface(noteId: string, surface: NoteSurface) {
  const copy = { ...surface, id: uid(), name: `${surface.name} copy`, order: Date.now(), hidden: false, deleted: false };
  if (surface.kind !== "typed") {
    const pages = await readInk<InkPage>(pagePath(noteId, surface.id));
    for (const page of pages.filter(p => !p.deleted)) {
      const nextPage = { ...page, id: uid() };
      await saveInk(pagePath(noteId, copy.id), nextPage);
      const objects = await readInk<InkObject>(objectPath(noteId, surface.id, page.id));
      await saveInkChanges(objectPath(noteId, copy.id, nextPage.id), [], objects);
    }
  }
  await saveInk(surfacePath(noteId), copy); return copy;
}
async function deleteInkCollection(path: string) {
  const snapshot = await getDocs(collection(db, path));
  for (let i = 0; i < snapshot.docs.length; i += 400) { const batch = writeBatch(db); snapshot.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref)); await batch.commit(); }
}
/** Called before deleting the owner note so nested rules remain authorized. */
export async function deleteNoteWorkspace(userId: string, noteId: string) {
  const surfaces = await readInk<NoteSurface>(surfacePath(noteId));
  for (const surface of surfaces) {
    const pages = await readInk<InkPage>(pagePath(noteId, surface.id));
    for (const page of pages) await deleteInkCollection(objectPath(noteId, surface.id, page.id));
    await deleteInkCollection(pagePath(noteId, surface.id));
  }
  await deleteInkCollection(`${surfacePath(noteId)}/_study/cards`);
  await deleteInkCollection(surfacePath(noteId));
  await deleteInkCollection(`notes/${noteId}/recordings`);
  const files = await listAll(ref(storage, `note-files/${userId}/${noteId}`));
  await Promise.all(files.items.map(deleteObject));
  removeWorkspaceDrafts(userId, noteId);
  try {
    const database = await fileDatabase();
    await new Promise<void>((resolve, reject) => { const tx = database.transaction("files", "readwrite"), cursor = tx.objectStore("files").openCursor(); cursor.onsuccess = () => { const value = cursor.result; if (!value) return; const key = String(value.key); if (key.startsWith(`note-files/${userId}/${noteId}/`) || key.startsWith(`recording-draft/${userId}/${noteId}/`)) value.delete(); value.continue(); }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); database.close();
  } catch { /* Deletion remains successful if the local cache is unavailable. */ }
}
export type { Course };
