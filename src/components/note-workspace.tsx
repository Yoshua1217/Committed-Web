"use client";
import { DrawingBlockContext, DrawingInsertButton } from "./drawing-block-context";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { MarkdownNote } from "@/lib/notes-service";
import { Course, DEFAULT_INK_PREFERENCES, InkPage, InkPreferences, NoteSurface, WHITEBOARD_PAPER, courseForNotebook, newPage, uid } from "@/lib/ink-model";
import { coursesPath, duplicateSurface, listenInk, pagePath, saveInk, saveInkPreferences, subscribeInkPreferences, surfacePath, uploadNoteFile } from "@/lib/ink-service";
import NotesMarkdown from "./notes-markdown";
import { openPdf } from "@/lib/note-pdf";
import "./note-workspace.css";
import { readSurfaceDrafts, storeSurfaceDrafts, SurfaceDraft } from "@/lib/notes-local-drafts";
import { bindInkTabScroll } from "@/lib/ink-scroll";

const InkEditor = dynamic(() => import("./ink-editor"), { ssr: false, loading: () => <div className="ink-empty">Opening writing tools…</div> });
const CanvasPage = dynamic(() => import("./canvas-page"), { ssr: false, loading: () => <div className="ink-empty">Opening canvas…</div> });
const MAIN: NoteSurface = { id: "main", kind: "typed", name: "Notes", order: -1 };
export default function NoteWorkspace({ note, calendarId, children, onInsert, onSurfaceChange, onExportSurfaces, headerTarget }: { onExportSurfaces?: (value: { noteId: string; surfaces: NoteSurface[] }) => void; headerTarget?: HTMLDivElement | null; note: MarkdownNote; calendarId?: string | null; children: ReactNode; onInsert: (markdown: string) => void; onSurfaceChange: (isTyped: boolean) => void }) {

  const [syncStatusTarget, setSyncStatusTarget] = useState<HTMLDivElement | null>(null);
  const tabbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (tabbarRef.current) return bindInkTabScroll(tabbarRef.current); }, [headerTarget]);
  const initialDocumentId = note.initialSurface === "ink" ? "handwriting" : note.initialSurface === "whiteboard" ? "whiteboard" : note.initialSurface === "canvas" ? "canvas" : "main";
  const [surfaces, setSurfaces] = useState<NoteSurface[]>([]), [active, setActive] = useState(initialDocumentId), [second, setSecond] = useState("");
  const [preferences, setPreferences] = useState<InkPreferences>(DEFAULT_INK_PREFERENCES), [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false), [menu, setMenu] = useState(false), [manage, setManage] = useState<string | null>(null), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [query, setQuery] = useState(""), [searchOpen, setSearchOpen] = useState(false), [results, setResults] = useState<{ surfaceId: string; pageId?: string; label: string }[]>([]);
  const [send, setSend] = useState<string | null>(null), [sendTarget, setSendTarget] = useState("main"), [rename, setRename] = useState("");
  const [replaceTarget, setReplaceTarget] = useState<NoteSurface | null>(null);
  const fileRef = useRef<HTMLInputElement>(null), initialized = useRef(false), dragged = useRef(""), preferencesRef = useRef(preferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false), [coursesLoaded, setCoursesLoaded] = useState(false);
  const history = useRef<string[]>([]), [historyCount, setHistoryCount] = useState(0);
  const pendingSurfaces = useRef(new Map<string, SurfaceDraft>()), surfaceRevision = useRef(Date.now());
  const fail = useCallback((e: Error) => setMessage(e.message), []);
  useEffect(() => {
    const recovered = readSurfaceDrafts(note.userId, note.id); pendingSurfaces.current = new Map(recovered.map(d => [d.surface.id, d]));
    for (const draft of recovered) void saveInk(surfacePath(note.id), draft.surface).then(() => { if (pendingSurfaces.current.get(draft.surface.id)?.revision === draft.revision) pendingSurfaces.current.delete(draft.surface.id); storeSurfaceDrafts(note.userId, note.id, [...pendingSurfaces.current.values()]); }).catch(fail);
    const stop = listenInk<NoteSurface>(surfacePath(note.id), values => { const merged = new Map(values.map(s => [s.id, s])); for (const draft of pendingSurfaces.current.values()) merged.set(draft.surface.id, draft.surface); setSurfaces([...merged.values()].sort((a, b) => a.order - b.order)); setLoaded(true); }, fail);
    const stopPrefs = subscribeInkPreferences(note.userId, value => { preferencesRef.current = value; setPreferences(value); setPreferencesLoaded(true); }, fail);
    const stopCourses = listenInk<Course>(coursesPath(note.userId), values => { setCourses(values); setCoursesLoaded(true); }, fail);
    const requested = new URLSearchParams(location.search).get("surface");
    setActive(requested ?? localStorage.getItem(`ink-surface:${note.userId}:${note.id}`) ?? initialDocumentId);
    return () => { stop(); stopPrefs(); stopCourses(); };
  }, [note.id, note.userId, note.initialSurface, initialDocumentId, fail]);
  useEffect(() => { if (loaded) onExportSurfaces?.({ noteId: note.id, surfaces }); }, [loaded, note.id, surfaces, onExportSurfaces]);
  const course = courseForNotebook(courses, note.notebookId, calendarId), paper = course?.paper ?? preferences.paper;
  // Older notes were always marked typed, even when their only content was a
  // PDF or handwriting. Do not recreate their empty, implicit text page.
  const hasDocument = surfaces.some(s => s.kind !== "typed" && !s.hidden && !s.deleted);
  const hasMain = Boolean(note.content.trim()) || surfaces.some(s => s.id === "main") || (!hasDocument && note.initialSurface !== "ink" && note.initialSurface !== "whiteboard" && note.initialSurface !== "canvas" && note.initialSurface !== "pdf");
  const all = [...(hasMain ? [surfaces.find(s => s.id === "main") ?? MAIN] : []), ...surfaces.filter(s => s.id !== "main")].sort((a, b) => a.order - b.order);
  const tabs = all.filter(s => !s.hidden && !s.deleted);
  const activeTab = tabs.find(s => s.id === active) ?? tabs.find(s => s.kind === note.initialSurface) ?? tabs[0];
  useEffect(() => {
    const strip = tabbarRef.current, tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !tab) return;
    const outer = strip.getBoundingClientRect(), inner = tab.getBoundingClientRect();
    const delta = inner.left < outer.left ? inner.left - outer.left : inner.right > outer.right ? inner.right - outer.right : 0;
    if (delta) strip.scrollBy({ left: delta, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [activeTab?.id, headerTarget]);
  useEffect(() => { onSurfaceChange(activeTab?.id === "main" && !second); }, [activeTab?.id, second, onSurfaceChange]);
  const select = (id: string) => { if (id === second) setSecond(activeTab?.id ?? ""); if (activeTab && id !== activeTab?.id) history.current.push(activeTab?.id); setHistoryCount(history.current.length); setActive(id); localStorage.setItem(`ink-surface:${note.userId}:${note.id}`, id); };
  const saveSurface = (surface: NoteSurface) => {
    const revision = ++surfaceRevision.current; pendingSurfaces.current.set(surface.id, { surface, revision });
    if (!storeSurfaceDrafts(note.userId, note.id, [...pendingSurfaces.current.values()])) setMessage("Device draft storage is full. Keep this tab open until syncing completes.");
    setSurfaces(current => [...current.filter(s => s.id !== surface.id), surface].sort((a, b) => a.order - b.order));
    void saveInk(surfacePath(note.id), surface).then(() => { if (pendingSurfaces.current.get(surface.id)?.revision === revision) pendingSurfaces.current.delete(surface.id); storeSurfaceDrafts(note.userId, note.id, [...pendingSurfaces.current.values()]); }).catch(fail);
  };
  const add = async (kind: "typed" | "ink" | "whiteboard" | "canvas", fixedId?: string) => {
    const surface: NoteSurface = kind === "typed" && !hasMain ? { ...MAIN } : { id: fixedId ?? uid(), kind, name: kind === "typed" ? "Typed notes" : kind === "whiteboard" ? "Whiteboard" : kind === "canvas" ? "Infinite canvas" : "Handwriting", order: Date.now(), ...(kind === "typed" ? { content: "" } : {}) };
    if (kind === "ink" || kind === "whiteboard" || kind === "canvas") void saveInk(pagePath(note.id, surface.id), { ...newPage(kind === "whiteboard" || kind === "canvas" ? WHITEBOARD_PAPER : paper, 0), id: fixedId ? "first-page" : uid() }).catch(fail);
    // Firestore queues these writes locally. Opening a fresh tab must not wait
    // for the network acknowledgement, especially during an offline lecture.
    saveSurface(surface); select(surface.id); setMenu(false);
  };
  useEffect(() => {
    if (!loaded || !preferencesLoaded || !coursesLoaded || initialized.current) return;
    initialized.current = true;
    if (note.initialSurface === "ink" && !surfaces.some(s => s.id === "handwriting")) void add("ink", "handwriting").catch(fail);
    if (note.initialSurface === "whiteboard" && !surfaces.some(s => s.id === "whiteboard")) void add("whiteboard", "whiteboard").catch(fail);
    if (note.initialSurface === "canvas" && !surfaces.some(s => s.id === "canvas")) void add("canvas", "canvas").catch(fail);
    // Bootstrap exactly once; incoming snapshots must never create more pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, preferencesLoaded, coursesLoaded]);
  const changePreferences = (next: InkPreferences) => { preferencesRef.current = next; setPreferences(next); void saveInkPreferences(note.userId, next).catch(fail); };
  const importPdf = async (file: File, replacing: NoteSurface | null = null) => {
    setBusy(true); setMenu(false); setMessage("Reading PDF…");
    let pdf: Awaited<ReturnType<typeof openPdf>> | undefined;
    try {
      if (replacing) { const { replaceNotePdf } = await import("@/lib/note-pdf-replacement"); const next = await replaceNotePdf(note.userId, note.id, replacing, file, setMessage); setSurfaces(current => current.map(s => s.id === next.id ? next : s)); select(next.id); setMessage("PDF replaced with annotations preserved. Restore the previous version from +."); return; }
      pdf = await openPdf(file);
      const path = await uploadNoteFile(note.userId, note.id, file, file.name, percent => setMessage(`Uploading PDF to Firebase · ${percent}%`));
      const surface: NoteSurface = { id: uid(), name: file.name, kind: "pdf", order: Date.now(), pdfPath: path, pdfName: file.name, pageCount: pdf.numPages };
      // Build page metadata in bounded batches; the PDF itself stays in Storage.
      for (let start = 1; start <= pdf.numPages; start += 20) {
        const jobs: Promise<void>[] = [];
        for (let number = start; number < Math.min(start + 20, pdf.numPages + 1); number++) { const source = await pdf.getPage(number), viewport = source.getViewport({ scale: 96 / 72 }); const text = await source.getTextContent(); const page: InkPage = { ...newPage({ ...paper, kind: "blank", color: "#ffffff", margin: false, width: viewport.width, height: viewport.height }, number * 1000), pdfPage: number, pdfText: text.items.flatMap(item => "str" in item ? [item.str] : []).join(" ").slice(0, 60_000), searchText: text.items.flatMap(item => "str" in item ? [item.str] : []).join(" ").slice(0, 60_000) }; jobs.push(saveInk(pagePath(note.id, surface.id), page)); source.cleanup(); }
        await Promise.all(jobs); setMessage(`Preparing PDF · ${Math.min(start + 19, pdf.numPages)} / ${pdf.numPages} pages`);
      }
      await saveInk(surfacePath(note.id), surface); select(surface.id); setMessage("PDF uploaded. It will open on your other devices.");
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); } finally { if (pdf) void pdf.loadingTask.destroy(); setBusy(false); }
  };
  const search = async () => {
    setResults([]); if (!query.trim()) return;
    const needle = query.toLowerCase(), found: typeof results = [];
    if (hasMain && `${note.title} ${note.content}`.toLowerCase().includes(needle)) found.push({ surfaceId: "main", label: "Notes" });
    const { readInk } = await import("@/lib/ink-service");
    for (const tab of all.filter(s => !s.deleted)) {
      if (tab.id !== "main" && `${tab.name} ${tab.content ?? ""}`.toLowerCase().includes(needle)) found.push({ surfaceId: tab.id, label: tab.name });
      if (tab.kind !== "typed") for (const page of await readInk<InkPage>(pagePath(note.id, tab.id))) if (!page.deleted && `${page.label} ${page.searchText ?? ""}`.toLowerCase().includes(needle)) found.push({ surfaceId: tab.id, pageId: page.id, label: `${tab.name} · ${page.label || "page"}` });
    }
    setResults(found); if (!found.length) setMessage("No matches in typed text, page labels, or indexed PDF pages.");
  };
  const sendToText = () => { if (send === null) return; if (sendTarget === "main") { if (!hasMain) saveSurface({ ...MAIN }); onInsert(send); } else { const target = all.find(s => s.id === sendTarget); if (target) saveSurface({ ...target, content: `${target.content ?? ""}\n\n${send}` }); } select(sendTarget); setSend(null); setMessage("Inserted into typed notes."); };
  const render = (tab: NoteSurface) => tab.id === "main" ? <div className="ink-main-typed">{children}</div> : tab.kind === "typed" ? <ExtraTyped key={tab.id} surface={tab} onChange={saveSurface} /> : tab.kind === "canvas" ? <CanvasPage key={tab.id} noteId={note.id} userId={note.userId} surface={tab} preferences={preferences} onPreferences={changePreferences} syncStatusTarget={tab.id === activeTab?.id ? syncStatusTarget : undefined} /> : <InkEditor syncStatusTarget={tab.id === activeTab?.id ? syncStatusTarget : undefined} key={tab.id} userId={note.userId} noteId={note.id} surface={tab} preferences={preferences} onPreferences={changePreferences} courses={courses} defaultPaper={paper} onSend={value => { setSend(value); setSendTarget("main"); }} />;
  const createDrawing = () => {
    const id = `drawing-${uid()}`, surface: NoteSurface = { id, name: "Drawing", kind: "canvas", order: Date.now(), hidden: true };
    saveSurface(surface);
    void saveInk(pagePath(note.id, id), { ...newPage(WHITEBOARD_PAPER), id: "drawing-page" }).catch(fail);
    return `

[Drawing](committed-drawing:${id})

`;
  };
  const managed = all.find(s => s.id === manage);
  const surfaceToolbar = <>
    <div ref={tabbarRef} className="ink-tabbar" role="tablist" aria-label="Note surfaces" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={e => { const file = Array.from(e.dataTransfer.files).find(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")); if (file) { e.preventDefault(); void importPdf(file); } }}>
      <button disabled={!historyCount} title="Previous surface" onClick={() => { const previous = history.current.pop(); if (previous) setActive(previous); setHistoryCount(history.current.length); }}>‹</button>
      {tabs.map(tab => <div className="ink-tab" key={tab.id} draggable onDragStart={() => { dragged.current = tab.id; }} onDragOver={e => e.preventDefault()} onDrop={() => { const order = [...tabs], index = order.findIndex(s => s.id === dragged.current); if (index < 0) return; const [moved] = order.splice(index, 1); order.splice(order.findIndex(s => s.id === tab.id), 0, moved); order.forEach((s, i) => saveSurface({ ...s, order: i * 1000 })); }}>
        <button role="tab" aria-selected={activeTab?.id === tab.id} onClick={() => select(tab.id)} onContextMenu={e => { e.preventDefault(); setManage(tab.id); setRename(tab.name); }}><span>{tab.kind === "typed" ? "T" : tab.kind === "whiteboard" ? "▭" : tab.kind === "canvas" ? "∞" : tab.kind === "ink" ? "✎" : "PDF"}</span>{tab.name}</button><button aria-label={`${tab.name} options`} onClick={() => { setManage(tab.id); setRename(tab.name); }}>⋯</button>
      </div>)}
      <button onClick={() => setMenu(!menu)} disabled={busy} aria-label="Add a surface">+</button>
      <button onClick={() => setSecond(second ? "" : tabs.find(t => t.id !== activeTab?.id)?.id ?? "")} disabled={tabs.length < 2}>◫ {second ? "Close split" : "Split"}</button>
      <button onClick={() => setSearchOpen(!searchOpen)}>⌕ Search</button>
      <div ref={setSyncStatusTarget} className="notes-header-sync" />
    </div>
  </>;
  return <DrawingBlockContext.Provider value={{ create: createDrawing, insert: onInsert, render: id => { const surface = surfaces.find(s => s.id === id && (s.kind === "canvas" || s.kind === "whiteboard") && !s.deleted); return surface ? <CanvasPage key={id} noteId={note.id} userId={note.userId} surface={surface} preferences={preferences} onPreferences={changePreferences} /> : <p>Drawing unavailable. Restore it from the + menu if it was deleted.</p>; } }}><section className={`note-workspace ink-ui${second ? " has-split" : ""}`} style={course ? { borderTopColor: course.color } : undefined}>
    {headerTarget ? createPortal(surfaceToolbar, headerTarget) : surfaceToolbar}
    {course && <div className="ink-course-label" style={{ color: course.color }}>{course.name}</div>}
    {menu && <div className="ink-add-menu"><button onClick={() => void add("typed").catch(fail)}>T Typed note</button><button onClick={() => void add("ink").catch(fail)}>✎ Handwritten pages</button><button onClick={() => void add("whiteboard").catch(fail)}>▭ Whiteboard</button><button onClick={() => void add("canvas").catch(fail)}>∞ Infinite canvas</button><button onClick={() => { setReplaceTarget(null); fileRef.current?.click(); }}>▤ Import PDF</button>{all.filter(s => s.hidden || s.deleted).map(s => <button key={s.id} onClick={() => { saveSurface({ ...s, hidden: false, deleted: false }); select(s.id); setMenu(false); }}>Restore {s.name}</button>)}</div>}
    {searchOpen && <div className="ink-workspace-search"><form onSubmit={e => { e.preventDefault(); void search().catch(fail); }}><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this workspace…" aria-label="Search workspace" /><button>Search</button></form>{results.map((r, i) => <button key={i} onClick={() => { if (r.pageId) localStorage.setItem(`ink-page:${note.userId}:${note.id}:${r.surfaceId}`, r.pageId); if (r.surfaceId === active) { setActive("main"); setTimeout(() => setActive(r.surfaceId), 0); } else select(r.surfaceId); setSearchOpen(false); }}>{r.label}</button>)}</div>}
    <div className="ink-workspace-panels"><div className="ink-workspace-panel" role="tabpanel">{activeTab ? render(activeTab) : !loaded || !preferencesLoaded || !coursesLoaded ? <div className="ink-empty">Opening {note.initialSurface === "pdf" ? "PDF" : "handwritten pages"}…</div> : note.initialSurface === "pdf" && !surfaces.some(s => s.kind === "pdf") ? <div className="ink-empty"><div><h2>Import a PDF</h2><p>Choose a document to read and annotate.</p><button className="ink-primary" disabled={busy} onClick={() => { setReplaceTarget(null); fileRef.current?.click(); }}>{busy ? "Importing PDF…" : "Choose PDF"}</button></div></div> : <div className="ink-empty">No pages open. Use + to add or restore a page.</div>}</div>{second && second !== activeTab?.id && tabs.find(t => t.id === second) && <div className="ink-workspace-panel"><select aria-label="Right split surface" value={second} onChange={e => setSecond(e.target.value)}>{tabs.filter(t => t.id !== activeTab?.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{render(tabs.find(t => t.id === second)!)}</div>}</div>
    <input type="file" accept="application/pdf,.pdf" ref={fileRef} hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void importPdf(file, replaceTarget); setReplaceTarget(null); }} />
    {message && <div className="ink-status" role="status">{message}<button aria-label="Dismiss" onClick={() => setMessage("")}>×</button></div>}
    {managed && <div className="ink-modal-scrim"><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Surface options"><h2>{managed.name}</h2><label>Tab name<input value={rename} onChange={e => setRename(e.target.value)} /></label><div className="ink-actions"><button className="ink-primary" onClick={() => { saveSurface({ ...managed, name: rename.trim() || managed.name }); setManage(null); }}>Rename</button><button onClick={() => { if (managed.id === "main") void duplicateSurface(note.id, { ...managed, content: note.content }).then(s => select(s.id)).catch(fail); else { setBusy(true); void duplicateSurface(note.id, managed).then(s => select(s.id)).catch(fail).finally(() => setBusy(false)); } setManage(null); }}>Duplicate</button>{managed.kind === "pdf" && <button disabled={busy} onClick={() => { setReplaceTarget(managed); setManage(null); fileRef.current?.click(); }}>Replace PDF</button>}{managed.id !== "main" && <><button onClick={() => { saveSurface({ ...managed, hidden: true }); setActive("main"); setSecond(""); setManage(null); }}>Close tab</button><button onClick={() => { saveSurface({ ...managed, deleted: true }); setActive("main"); setSecond(""); setManage(null); setMessage("Tab moved to Recently deleted. Restore it from +."); }}>Delete tab</button></>}<button onClick={() => setManage(null)}>Cancel</button></div><p>Closed and deleted surfaces can be restored from the + menu.</p></section></div>}
    {send !== null && <div className="ink-modal-scrim"><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Insert into typed notes"><h2>Insert into typed notes</h2><select aria-label="Destination typed tab" value={sendTarget} onChange={e => setSendTarget(e.target.value)}>{!hasMain && <option value="main">New typed notes</option>}{all.filter(t => t.kind === "typed" && !t.deleted).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><p>The selection will be inserted at your last cursor position in Notes, or appended to another typed tab.</p><div className="ink-actions"><button className="ink-primary" onClick={sendToText}>Insert</button><button onClick={() => setSend(null)}>Cancel</button></div></section></div>}
  </section></DrawingBlockContext.Provider>;
}

function ExtraTyped({ surface, onChange }: { surface: NoteSurface; onChange: (s: NoteSurface) => void }) {
  const [preview, setPreview] = useState(false);
  return <div className="ink-extra-typed"><div className="ink-actions"><DrawingInsertButton onInsert={source => { onChange({ ...surface, content: `${surface.content ?? ""}${source}` }); setPreview(true); }} /><button aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button><button aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button></div>{preview ? <NotesMarkdown content={surface.content ?? ""} onContentChange={content => onChange({ ...surface, content })} /> : <textarea aria-label={`${surface.name} content`} placeholder="Start typing… Markdown is supported." value={surface.content ?? ""} onChange={e => onChange({ ...surface, content: e.target.value })} />}</div>;
}
