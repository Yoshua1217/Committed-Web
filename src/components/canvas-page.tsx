"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { newPage, WHITEBOARD_PAPER, type InkObject, type InkPage, type InkPreferences, type NoteSurface } from "@/lib/ink-model";
import { uploadNoteImage } from "@/lib/note-image-service";
import { listenInk, objectPath, pagePath, saveInk, saveInkChanges } from "@/lib/ink-service";
import { clearInkDraft, InkDraft, makeInkDraft, mergeInkDraft, readInkDraft, storeInkDraft } from "@/lib/notes-local-drafts";
import InfiniteCanvas from "./infinite-canvas";

export default function CanvasPage({ noteId, userId, surface, preferences, onPreferences, syncStatusTarget }: { noteId: string; userId: string; surface: NoteSurface; preferences: InkPreferences; onPreferences?: (prefs: InkPreferences) => void; syncStatusTarget?: HTMLDivElement | null }) {
  const [pages, setPages] = useState<InkPage[]>([]), [error, setError] = useState(""), [loaded, setLoaded] = useState(false);
  const [pageId, setPageId] = useState(() => { try { return new URLSearchParams(location.search).get("page") ?? localStorage.getItem(`canvas-page:${userId}:${noteId}:${surface.id}`) ?? ""; } catch { return ""; } });
  useEffect(() => listenInk<InkPage>(pagePath(noteId, surface.id), values => { setPages(values.filter(p => !p.deleted).sort((a, b) => a.order - b.order)); setLoaded(true); }, e => setError(e.message)), [noteId, surface.id]);
  const page = pages.find(p => p.id === pageId) ?? pages[0];
  return <div className="canvas-page-shell" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
    {pages.length > 1 && <label style={{ padding: 8 }}>Canvas <select aria-label="Choose canvas page" value={page?.id ?? ""} onChange={e => { setPageId(e.target.value); try { localStorage.setItem(`canvas-page:${userId}:${noteId}:${surface.id}`, e.target.value); } catch {} }}>{pages.map((p, i) => <option key={p.id} value={p.id}>{p.label || `Canvas ${i + 1}`}</option>)}</select></label>}
    {error && <p role="alert">{error}</p>}
    {page ? <SavedCanvas key={page.id} noteId={noteId} userId={userId} surface={surface} page={page} preferences={preferences} onPreferences={onPreferences} syncStatusTarget={syncStatusTarget} /> : <div className="ink-empty" role="status">{loaded ? <button onClick={() => { const next = newPage(WHITEBOARD_PAPER); setPages([next]); void saveInk(pagePath(noteId, surface.id), next).catch(e => setError(e.message)); }}>Create a canvas</button> : "Opening your canvas…"}</div>}
  </div>;
}

function SavedCanvas({ noteId, userId, surface, page, preferences, onPreferences, syncStatusTarget }: { noteId: string; userId: string; surface: NoteSurface; page: InkPage; preferences: InkPreferences; onPreferences?: (prefs: InkPreferences) => void; syncStatusTarget?: HTMLDivElement | null }) {
  const path = objectPath(noteId, surface.id, page.id), [objects, setObjects] = useState<InkObject[]>([]), [loaded, setLoaded] = useState(false), [status, setStatus] = useState("Opening…"), [error, setError] = useState("");
  const current = useRef<InkObject[]>([]), draft = useRef<InkDraft | null>(null), revision = useRef(Date.now()), busy = useRef(false), mounted = useRef(true), indexedText = useRef(page.searchText ?? "");
  const flush = useCallback(async () => {
    if (!mounted.current || busy.current || !draft.current) return;
    busy.current = true;
    try {
      while (draft.current) {
        const value = draft.current;
        await saveInkChanges(path, value.before, value.after);
        // A reopened editor owns the journal now. Never enqueue stale writes
        // from the old editor after its outstanding network request resolves.
        if (!mounted.current) return;
        clearInkDraft(userId, path, value.revision);
        if (draft.current.revision === value.revision) draft.current = null;
      }
      if (mounted.current) { setStatus("Synced"); setError(""); }
    } catch (e) { if (mounted.current) { setStatus("Sync paused"); setError(`Your changes are kept on this device. ${e instanceof Error ? e.message : String(e)}`); } }
    finally { busy.current = false; }
  }, [path, userId]);
  useEffect(() => {
    mounted.current = true;
    draft.current = readInkDraft(userId, path);
    // A draft is a delta, not the full document. Merge it with the first snapshot.
    const stop = listenInk<InkObject>(path, (values, pending, cached) => {
      const next = draft.current ? mergeInkDraft(values, draft.current) : values;
      const prior = new Map(current.current.map(o => [o.id, o]));
      current.current = next.map(o => { const old = prior.get(o.id); return old && JSON.stringify(old) === JSON.stringify(o) ? old : o; }).sort((a, b) => a.order - b.order);
      setObjects(current.current); setLoaded(true); setStatus(pending || draft.current ? "Saved locally · syncing" : cached ? "Available offline" : "Synced");
    }, e => { setStatus("Sync paused"); setError(e.message); });
    void flush();
    const retry = () => void flush(), timer = setInterval(retry, 10000); window.addEventListener("online", retry);
    return () => { mounted.current = false; stop(); clearInterval(timer); window.removeEventListener("online", retry); };
  }, [path, userId, flush]);
  const onChange = useCallback((next: InkObject[]) => {
    const value = makeInkDraft(current.current, next, draft.current, ++revision.current); draft.current = value;
    const saved = storeInkDraft(userId, path, value);
    current.current = next; setObjects(next); setStatus(saved ? "Saved locally · syncing" : "Saving…");
    if (!saved) setError("Device storage is full. Keep this canvas open until it is synced.");
    const searchText = next.flatMap(o => o.text ? [o.text] : []).join("\n").slice(0, 60000);
    if (searchText !== indexedText.current) { indexedText.current = searchText; void saveInk(pagePath(noteId, surface.id), { id: page.id, searchText }).catch(() => { indexedText.current = ""; }); }
    void flush();
  }, [userId, path, noteId, surface.id, page.id, flush]);
  return <>{syncStatusTarget && createPortal(<span>{status}</span>, syncStatusTarget)}{error && <div role="alert" className="ink-status">{error}<button onClick={() => void flush()}>Retry sync</button></div>}{loaded ? <InfiniteCanvas uploadImage={async file => (await uploadNoteImage(userId, noteId, file)).downloadUrl} preferences={preferences} onPreferences={onPreferences} objects={objects} onChange={onChange} pens={preferences.pens} storageKey={`canvas-view:${userId}:${path}`} status={status} title={surface.name === "Whiteboard" ? "Infinite canvas" : surface.name} /> : <div className="ink-empty" role="status">Loading canvas…</div>}</>;
}
