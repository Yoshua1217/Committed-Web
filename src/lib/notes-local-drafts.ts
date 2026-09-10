import type { InkObject, NoteSurface } from "./ink-model";
import type { MarkdownNote } from "./notes-service";
const prefix = "committed-note-draft:";
export function readNoteDrafts(userId: string): MarkdownNote[] {
  if (typeof window === "undefined") return [];
  const values: MarkdownNote[] = [];
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (!key?.startsWith(`${prefix}${userId}:`)) continue; try { const note = JSON.parse(localStorage.getItem(key) ?? "null"); if (note?.userId === userId && typeof note.content === "string") values.push(note); } catch { /* A malformed cache entry must not hide other drafts. */ } }
  return values;
}
export function storeNoteDraft(note: MarkdownNote) { try { localStorage.setItem(`${prefix}${note.userId}:${note.id}`, JSON.stringify(note)); return true; } catch { return false; } }
export function clearNoteDraft(userId: string, noteId: string, through = Infinity) { const key = `${prefix}${userId}:${noteId}`; try { const value = JSON.parse(localStorage.getItem(key) ?? "null"); if (!value || value.updatedAt <= through) localStorage.removeItem(key); } catch { /* Keep other drafts. */ } }
export type InkDraft = { before: InkObject[]; after: InkObject[]; revision: number };
/** Journal only unacknowledged changes, never reserialize the whole lecture. */
export function makeInkDraft(before: InkObject[], after: InkObject[], pending: InkDraft | null, revision: number): InkDraft {
  const original = new Map(pending?.before.map(o => [o.id, o])), next = new Map(pending?.after.map(o => [o.id, o]));
  const prior = new Map(before.map(o => [o.id, o])), current = new Map(after.map(o => [o.id, o]));
  for (const id of new Set([...prior.keys(), ...current.keys()])) {
    const a = prior.get(id), b = current.get(id);
    if (a === b || JSON.stringify(a) === JSON.stringify(b)) continue;
    // Keep the last transition for each ID: an earlier write may already be
    // queued, so adding then deleting still needs a delete on the server.
    if (a) original.set(id, a); else original.delete(id);
    if (b) next.set(id, b); else next.delete(id);
  }
  return { before: [...original.values()], after: [...next.values()], revision };
}
const inkKey = (userId: string, path: string) => `committed-ink-draft:${userId}:${path}`;
export function readInkDraft(userId: string, path: string): InkDraft | null { try { const data = JSON.parse(localStorage.getItem(inkKey(userId, path)) ?? "null"); return Array.isArray(data?.before) && Array.isArray(data?.after) ? data : null; } catch { return null; } }
export function storeInkDraft(userId: string, path: string, draft: InkDraft) { try { localStorage.setItem(inkKey(userId, path), JSON.stringify(draft)); return true; } catch { return false; } }
export function clearInkDraft(userId: string, path: string, revision: number) { const existing = readInkDraft(userId, path); if (existing?.revision === revision) localStorage.removeItem(inkKey(userId, path)); }
export type SurfaceDraft = { surface: NoteSurface; revision: number };
const surfaceKey = (userId: string, noteId: string) => `committed-surface-drafts:${userId}:${noteId}`;
export function readSurfaceDrafts(userId: string, noteId: string): SurfaceDraft[] { try { const values = JSON.parse(localStorage.getItem(surfaceKey(userId, noteId)) ?? "[]"); return Array.isArray(values) ? values.filter(v => v?.surface?.id && typeof v.revision === "number") : []; } catch { return []; } }
export function storeSurfaceDrafts(userId: string, noteId: string, drafts: SurfaceDraft[]) { try { if (drafts.length) localStorage.setItem(surfaceKey(userId, noteId), JSON.stringify(drafts)); else localStorage.removeItem(surfaceKey(userId, noteId)); return true; } catch { return false; } }
export function removeWorkspaceDrafts(userId: string, noteId: string) {
  if (typeof window === "undefined") return;
  clearNoteDraft(userId, noteId);
  const exact = [surfaceKey(userId, noteId), `recording-recovery:${userId}:${noteId}`, `ink-surface:${userId}:${noteId}`];
  const prefixes = [`committed-ink-draft:${userId}:notes/${noteId}/`, `ink-page:${userId}:${noteId}:`, `ink-tool:${userId}:${noteId}:`];
  try { const keys = Object.keys(localStorage).filter(key => exact.includes(key) || prefixes.some(prefix => key.startsWith(prefix))); keys.forEach(key => localStorage.removeItem(key)); } catch { /* Storage may be disabled. */ }
}
/** Replay only locally changed IDs, leaving unrelated cloud edits untouched. */
export function mergeInkDraft(current: InkObject[], draft: InkDraft): InkObject[] {
  const values = new Map(current.map(o => [o.id, o])), before = new Map(draft.before.map(o => [o.id, o])), after = new Map(draft.after.map(o => [o.id, o]));
  for (const id of new Set([...before.keys(), ...after.keys()])) { if (JSON.stringify(before.get(id)) === JSON.stringify(after.get(id))) continue; const next = after.get(id); if (next) values.set(id, next); else values.delete(id); }
  return [...values.values()];
}
