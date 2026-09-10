"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TbArrowLeft, TbArrowRight, TbEraser, TbGeometry, TbHandMove, TbLasso, TbPhoto, TbEyeOff, TbSettings, TbLayoutSidebarLeftExpand, TbBookmark, TbBookmarkFilled, TbTemplate, TbFileExport, TbMaximize, TbMinimize, TbZoomIn, TbZoomOut, TbSearch, TbBriefcase2 } from "react-icons/tb";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import InkCanvas, { InkCanvasApi, InkTool } from "./ink-canvas";
import { Course, InkObject, InkPage, InkPreferences, InkTemplate, NoteSurface, Paper, Pen, newPage, objectBounds, transformObjects, uid } from "@/lib/ink-model";
import { deleteInkTemplate, listenInk, objectPath, pagePath, readInk, readNoteFile, saveInk, saveInkChanges, templatesPath } from "@/lib/ink-service";
import { objectsPng } from "@/lib/ink-renderer";
import { downloadBlob, exportSurfacePdf, openPdf, PdfTextLine, renderPdfPage } from "@/lib/note-pdf";
import { uploadNoteImage } from "@/lib/note-image-service";
import { InkHistory } from "@/lib/ink-history";
import { canRecognizeHandwriting, recognizeHandwriting } from "@/lib/handwriting-recognition";
import { saveTask } from "@/lib/tasks-service";
import { clearInkDraft, InkDraft, makeInkDraft, mergeInkDraft, readInkDraft, storeInkDraft } from "@/lib/notes-local-drafts";
import PenPreview from "./pen-preview";
import PenToolbox from "./pen-toolbox";
import { PaperSettings, PenSettings } from "./ink-settings";

let inkClipboard: InkObject[] = [];
function lastTool(key: string): { penId?: string; tool?: InkTool; partial?: boolean; eraserSize?: number; shape?: string } { try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; } }
type Props = { syncStatusTarget?: HTMLDivElement | null; userId: string; noteId: string; surface: NoteSurface; preferences: InkPreferences; onPreferences: (p: InkPreferences) => void; courses: Course[]; defaultPaper: Paper; onSend: (markdown: string) => void };

function PageThumbnail({ noteId, surfaceId, page, pdf, width = 100 }: { noteId: string; surfaceId: string; page: InkPage; pdf: PDFDocumentProxy | null; width?: number }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let canceled = false, objectUrl = "";
    void (async () => {
      const objects = await readInk<InkObject>(objectPath(noteId, surfaceId, page.id));
      const png = await objectsPng(objects, page.paper, Boolean(pdf && page.pdfPage));
      const overlay = await createImageBitmap(png), canvas = document.createElement("canvas"); canvas.width = width; canvas.height = Math.round(width * page.paper.height / page.paper.width); const ctx = canvas.getContext("2d")!;
      if (pdf && page.pdfPage) { const result = await renderPdfPage(pdf, page.pdfPage, width, 1); const image = new Image(); image.src = result.url; try { await image.decode(); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); } finally { URL.revokeObjectURL(result.url); } }
      ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height); overlay.close();
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
      if (blob && !canceled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    })().catch(() => { if (!canceled) setError(true); });
    return () => { canceled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [noteId, surfaceId, page, pdf, width]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={page.label || (width > 100 ? `PDF page ${page.pdfPage ?? ""}` : "Page thumbnail")} /> : <div className="ink-thumbnail-placeholder" style={{ background: page.paper.color }}>{width > 100 ? error ? "Unable to load this page. Reopen the PDF to retry." : "Loading page…" : null}</div>;
}

function ScrollingPdfPage({ noteId, surfaceId, page, pdf, number, onAnnotate }: { noteId: string; surfaceId: string; page: InkPage; pdf: PDFDocumentProxy | null; number: number; onAnnotate: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { rootMargin: "800px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return <section ref={root} data-pdf-page-id={page.id} className="ink-scrolling-page" aria-label={`Page ${number}`}>
    <header><span>Page {number}{page.label ? ` · ${page.label}` : ""}</span><button onClick={onAnnotate}>Annotate page</button></header>
    <div className="ink-scrolling-page-image" style={{ aspectRatio: `${page.paper.width} / ${page.paper.height}` }}>
      {nearby && (pdf || !page.pdfPage) ? <PageThumbnail noteId={noteId} surfaceId={surfaceId} page={page} pdf={pdf} width={1600} /> : <span>Loading page {number}…</span>}
    </div>
  </section>;
}

function AnnotationPage({ page, number, active, onActivate, children }: { page: InkPage; number: number; active: boolean; onActivate: () => void; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  const [reservedHeight, setReservedHeight] = useState<number>();
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const editor = root.current?.querySelector<HTMLElement>(".ink-page-editor");
      if (editor) setReservedHeight(editor.getBoundingClientRect().height);
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { rootMargin: "800px" });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return <section ref={root} className="ink-annotation-page" data-pdf-page-id={page.id} aria-label={`Annotate page ${number}`} onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
    <header>Page {number}{page.label ? ` · ${page.label}` : ""}</header>
    {nearby || active ? children : <div style={reservedHeight ? { height: reservedHeight } : { aspectRatio: `${page.paper.width} / ${page.paper.height}` }} />}
  </section>;
}

export default function InkEditor(props: Props) {
  const { noteId, surface, defaultPaper } = props;
  const [pages, setPages] = useState<InkPage[]>([]), [pageId, setPageId] = useState("");
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const editorRoot = useRef<HTMLDivElement>(null);
  const [annotatingPdf, setAnnotatingPdf] = useState(false);
  const continuousPdf = Boolean(surface.pdfPath) && !annotatingPdf;
  useEffect(() => {
    if (!continuousPdf || !pageId) return;
    const target = Array.from(editorRoot.current?.querySelectorAll<HTMLElement>("[data-pdf-page-id]") ?? []).find(element => element.dataset.pdfPageId === pageId);
    target?.scrollIntoView({ block: "start" });
  }, [pageId, continuousPdf]);

  useEffect(() => { const changed = () => setFullscreen(document.fullscreenElement === editorRoot.current); document.addEventListener("fullscreenchange", changed); return () => document.removeEventListener("fullscreenchange", changed); }, []);
  const toggleFull = async () => {
    if (document.fullscreenElement === editorRoot.current) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else if (fullscreen) {
      setFullscreen(false);
    } else {
      // Reading and annotation both retain their full document in focus mode.
      try { await editorRoot.current?.requestFullscreen(); setFullscreen(true); }
      catch { setFullscreen(true); }
    }
  };
  const [loaded, setLoaded] = useState(false), [navigator, setNavigator] = useState(false), [settingsOpen, setSettingsOpen] = useState(false);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [message, setMessage] = useState("");
  const [filter, setFilter] = useState(""), [bookmarksOnly, setBookmarksOnly] = useState(false), [dragged, setDragged] = useState("");
  const [trash, setTrash] = useState(false), [exportOpen, setExportOpen] = useState(false), [exportRange, setExportRange] = useState("all");
  const [templatesOpen, setTemplatesOpen] = useState(false), [templates, setTemplates] = useState<InkTemplate[]>([]), [templateName, setTemplateName] = useState("");
  useEffect(() => { if (!templatesOpen) return; return listenInk<InkTemplate>(templatesPath(props.userId), setTemplates, e => setMessage(e.message)); }, [templatesOpen, props.userId]);
  useEffect(() => {
    return listenInk<InkPage>(pagePath(noteId, surface.id), values => { setPages(values.sort((a, b) => a.order - b.order)); setLoaded(true); }, e => setMessage(e.message));
  }, [noteId, surface.id]);
  useEffect(() => {
    const key = `ink-page:${props.userId}:${noteId}:${surface.id}`;
    setPageId(new URLSearchParams(location.search).get("page") ?? localStorage.getItem(key) ?? "");
  }, [noteId, props.userId, surface.id]);
  useEffect(() => {
    if (!surface.pdfPath) return;
    let canceled = false, document: PDFDocumentProxy | undefined;
    readNoteFile(surface.pdfPath).then(openPdf).then(value => { document = value; if (!canceled) setPdf(value); else void value.loadingTask.destroy(); }).catch(e => setMessage(`PDF unavailable: ${e.message}`));
    return () => { canceled = true; if (document) void document.loadingTask.destroy(); };
  }, [surface.pdfPath]);
  const visible = pages.filter(p => !p.deleted), page = visible.find(p => p.id === pageId) ?? visible[0];
  const select = (id: string) => {
    setPageId(id); localStorage.setItem(`ink-page:${props.userId}:${noteId}:${surface.id}`, id);
    if (surface.pdfPath) requestAnimationFrame(() => {
      Array.from(editorRoot.current?.querySelectorAll<HTMLElement>("[data-pdf-page-id]") ?? []).find(element => element.dataset.pdfPageId === id)?.scrollIntoView({ block: "start" });
    });
  };
  const [historyTarget, setHistoryTarget] = useState<HTMLDivElement | null>(null);
  const [viewControlsTarget, setViewControlsTarget] = useState<HTMLDivElement | null>(null);
  const [pageConfirmation, setPageConfirmation] = useState<{ id: string; action: "duplicate" | "delete" } | null>(null);
  const confirmationPage = pages.find(p => p.id === pageConfirmation?.id && !p.deleted);
  const [pageMenuId, setPageMenuId] = useState<string | null>(null);
  const [pageName, setPageName] = useState("");
  const menuPage = pages.find(p => p.id === pageMenuId && !p.deleted);
  const savePage = (p: InkPage) => { setPages(current => current.map(v => v.id === p.id ? p : v)); void saveInk(pagePath(noteId, surface.id), p).catch(e => setMessage(e.message)); };
  const addPage = async () => { const nextIndex = visible.findIndex(p => p.id === page?.id) + 1; const nextOrder = visible[nextIndex]?.order; const newOrder = nextOrder !== undefined ? ((page?.order ?? 0) + nextOrder) / 2 : (page?.order ?? 0) + 1000; const value = newPage(page?.paper ?? defaultPaper, newOrder); setPages(current => [...current, value]); select(value.id); try { await saveInk(pagePath(noteId, surface.id), value); } catch (e) { setMessage(String(e)); } };
  const duplicatePage = async (page: InkPage) => { setMessage("Duplicating page…"); try { const value = { ...page, id: uid(), order: page.order + .01, label: page.label ? `${page.label} copy` : "" }; const objects = await readInk<InkObject>(objectPath(noteId, surface.id, page.id)); await saveInkChanges(objectPath(noteId, surface.id, value.id), [], objects); await saveInk(pagePath(noteId, surface.id), value); select(value.id); setMessage(""); } catch (e) { setMessage(String(e)); } };
  const applyTemplate = async (template: InkTemplate, builtIn = false) => { const value = { ...newPage(template.paper, (visible.at(-1)?.order ?? 0) + 1000), label: template.name }; const objects = builtIn ? [] : await readInk<InkObject>(`${templatesPath(props.userId)}/${template.id}/objects`); await saveInk(pagePath(noteId, surface.id), value); await saveInkChanges(objectPath(noteId, surface.id, value.id), [], objects.map(o => ({ ...o, id: uid() }))); select(value.id); setTemplatesOpen(false); };
  const saveTemplate = async () => { if (!page || !templateName.trim()) return; const template: InkTemplate = { id: uid(), name: templateName.trim(), paper: page.paper, createdAt: Date.now() }; const objects = await readInk<InkObject>(objectPath(noteId, surface.id, page.id)); if (objects.some(o => o.kind === "image")) throw new Error("Use a page without imported images for a reusable template. Ink, labels, and study covers are supported."); await saveInk(templatesPath(props.userId), template); await saveInkChanges(`${templatesPath(props.userId)}/${template.id}/objects`, [], objects); setTemplateName(""); setMessage("Template saved across your devices."); };
  const reorder = (target: InkPage) => { const order = [...visible]; const source = order.find(p => p.id === dragged); if (!source || source.id === target.id) return; order.splice(order.indexOf(source), 1); order.splice(order.findIndex(p => p.id === target.id), 0, source); order.forEach((p, i) => savePage({ ...p, order: i * 1000 })); setDragged(""); };
  const doExport = async () => {
    try {
      let chosen = visible;
      if (exportRange === "bookmarks") chosen = visible.filter(p => p.bookmark);
      else if (exportRange !== "all") { const numbers = new Set<number>(); for (const part of exportRange.split(",")) { const [a, b = a] = part.trim().split("-").map(Number); if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > visible.length) throw new Error("Use page numbers like 1-4, 7."); for (let i = a; i <= b; i++) numbers.add(i); } chosen = visible.filter((_, i) => numbers.has(i + 1)); }
      if (!chosen.length) throw new Error("No pages match this export.");
      setExportOpen(false); await exportSurfacePdf(noteId, surface, chosen, setMessage); setMessage("PDF exported.");
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  };
  return <div ref={editorRoot} className={`ink-editor ink-ui${fullscreen ? " ink-focus-mode" : ""}`}>
    <div className="ink-page-controls">
      {surface.pdfPath && <button onClick={() => setAnnotatingPdf(value => !value)}>{continuousPdf ? "Annotate PDF" : "Read PDF"}</button>}
      {continuousPdf && <button onClick={() => void toggleFull()} title={fullscreen ? "Exit focus" : "Focus mode"} aria-label={fullscreen ? "Exit focus" : "Focus mode"}>{fullscreen ? <TbMinimize className="ink-tool-icon" aria-hidden="true" /> : <TbMaximize className="ink-tool-icon" aria-hidden="true" />}</button>}
      <button aria-pressed={navigator} onClick={() => setNavigator(!navigator)} title="Pages" aria-label="Toggle pages sidebar"><TbLayoutSidebarLeftExpand className="ink-tool-icon" aria-hidden="true" /></button>
      <button disabled={!page || visible.indexOf(page) === 0} onClick={() => select(visible[visible.indexOf(page!) - 1].id)} aria-label="Previous page">‹</button>
      <span>{page ? visible.indexOf(page) + 1 : 0} / {visible.length}</span>
      <button disabled={!page || visible.indexOf(page) === visible.length - 1} onClick={() => select(visible[visible.indexOf(page!) + 1].id)} aria-label="Next page">›</button>
      <button className="ink-add-page" onClick={() => void addPage()} title="Add page" aria-label="Add page"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></button>
      <button onClick={() => setTemplatesOpen(true)} title="Page templates" aria-label="Page templates"><TbTemplate className="ink-tool-icon" aria-hidden="true" /></button>
      <button disabled={!page} aria-pressed={page?.bookmark} onClick={() => page && savePage({ ...page, bookmark: !page.bookmark })} title={page?.bookmark ? "Remove bookmark" : "Bookmark page"} aria-label={page?.bookmark ? "Remove bookmark" : "Bookmark page"}>{page?.bookmark ? <TbBookmarkFilled className="ink-tool-icon" aria-hidden="true" /> : <TbBookmark className="ink-tool-icon" aria-hidden="true" />}</button>
      <div className="ink-top-view-controls" ref={setViewControlsTarget} />
      <button onClick={() => setToolboxOpen(true)} title="Your toolbox" aria-label="Your toolbox"><TbBriefcase2 className="ink-tool-icon" aria-hidden="true" /></button>
      <button disabled={!page} onClick={() => { setAnnotatingPdf(true); setSettingsOpen(true); }} title="Settings" aria-label="Settings"><TbSettings className="ink-tool-icon" aria-hidden="true" /></button>
      <div className="ink-top-history" ref={setHistoryTarget} />

    </div>
    <div className="ink-editor-body">
      {navigator && <aside className="ink-page-navigator"><div className="ink-page-search"><TbSearch aria-hidden="true" /><input type="search" aria-label="Search pages" placeholder="Search pages" value={filter} onChange={e => setFilter(e.target.value)} /></div><button className="ink-bookmark-filter" aria-pressed={bookmarksOnly} title={bookmarksOnly ? "Show all pages" : "Show bookmarked pages"} onClick={() => setBookmarksOnly(value => !value)}>{bookmarksOnly ? <TbBookmarkFilled aria-hidden="true" /> : <TbBookmark aria-hidden="true" />}<span>Bookmarks</span></button>
        {visible.filter(p => (!bookmarksOnly || p.bookmark) && `${p.label} ${p.searchText ?? ""}`.toLowerCase().includes(filter.toLowerCase())).map(p => <div className={`ink-page-card ${p.id === page?.id ? "is-active" : ""}`} draggable onDragStart={() => setDragged(p.id)} onDragOver={e => e.preventDefault()} onDrop={() => reorder(p)} key={p.id}><button className="ink-page-thumbnail" aria-label={`Open page ${visible.indexOf(p) + 1}: ${p.label || "Untitled"}`} onClick={() => select(p.id)}><PageThumbnail noteId={noteId} surfaceId={surface.id} page={p} pdf={pdf} /></button><div className="ink-page-card-caption"><button className="ink-page-name" onClick={() => select(p.id)}>{p.bookmark ? "★ " : ""}{visible.indexOf(p) + 1} {p.label}</button><button className="ink-page-more" aria-label={`Options for page ${visible.indexOf(p) + 1}: ${p.label || "Untitled"}`} title="Page options" onClick={() => { setPageMenuId(p.id); setPageName(p.label); }}>⋯</button></div></div>)}
        <button onClick={() => setTrash(!trash)}>Recently deleted ({pages.filter(p => p.deleted).length})</button>{trash && pages.filter(p => p.deleted).map(p => <button key={p.id} onClick={() => savePage({ ...p, deleted: false })}>Restore {p.label || "page"}</button>)}
      </aside>}
      {page && continuousPdf ? <div className="ink-pdf-scroll" aria-label="PDF pages" tabIndex={0}>{visible.map((item, index) => <ScrollingPdfPage key={item.id} noteId={noteId} surfaceId={surface.id} page={item} pdf={pdf} number={index + 1} onAnnotate={() => { select(item.id); setAnnotatingPdf(true); }} />)}</div> : page && surface.pdfPath ? <div className="ink-pdf-scroll ink-annotation-scroll" aria-label="PDF annotation pages" tabIndex={0}>{visible.map((item, index) => <AnnotationPage key={item.id} page={item} number={index + 1} active={page.id === item.id} onActivate={() => setPageId(item.id)}><InkPageEditor {...props} continuous page={item} pageNumber={index + 1} pdf={pdf} historyTarget={page.id === item.id ? historyTarget : null} viewControlsTarget={page.id === item.id ? viewControlsTarget : null} syncStatusTarget={page.id === item.id ? props.syncStatusTarget : null} onExport={() => { setSettingsOpen(false); setExportOpen(true); }} options={page.id === item.id && settingsOpen} setOptions={setSettingsOpen} fullscreen={fullscreen} toggleFull={toggleFull} pagesOpen={navigator} onTogglePages={() => setNavigator(value => !value)} onPage={savePage} onMessage={setMessage} /></AnnotationPage>)}</div> : page ? <InkPageEditor historyTarget={historyTarget} viewControlsTarget={viewControlsTarget} onExport={() => { setSettingsOpen(false); setExportOpen(true); }} options={settingsOpen} setOptions={setSettingsOpen} fullscreen={fullscreen} toggleFull={toggleFull} pagesOpen={navigator} onTogglePages={() => setNavigator(value => !value)} key={page.id} {...props} page={page} pageNumber={visible.indexOf(page) + 1} pdf={pdf} onPage={savePage} onMessage={setMessage} /> : <div className="ink-empty"><h3>{loaded ? "A fresh page for your thoughts" : "Opening pages…"}</h3><button onClick={() => void addPage()}>Add handwritten page</button></div>}
    </div>
    {message && <div className="ink-status" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss">×</button></div>}
    {menuPage && !pageConfirmation && <div className="ink-modal-scrim" onClick={() => setPageMenuId(null)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setPageMenuId(null); } }}><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Page options" onClick={e => e.stopPropagation()}><div className="ink-dialog-title"><h2>Page options</h2><button aria-label="Close page options" onClick={() => setPageMenuId(null)}>×</button></div><form onSubmit={e => { e.preventDefault(); savePage({ ...menuPage, label: pageName.trim() }); setPageMenuId(null); }}><label>Page name<input autoFocus value={pageName} onChange={e => setPageName(e.target.value)} placeholder="Untitled page" /></label><div className="ink-actions"><button type="submit">Save name</button><button type="button" onClick={() => setPageConfirmation({ id: menuPage.id, action: "duplicate" })}>Duplicate</button><button type="button" onClick={() => setPageConfirmation({ id: menuPage.id, action: "delete" })}>Delete page</button></div></form></section></div>}
    {pageConfirmation && <div className="ink-modal-scrim" onClick={() => setPageConfirmation(null)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setPageConfirmation(null); } }}><section className="ink-dialog" role="alertdialog" aria-modal="true" aria-label={pageConfirmation.action === "delete" ? "Delete page?" : "Duplicate page?"} onClick={e => e.stopPropagation()}><h2>{pageConfirmation.action === "delete" ? "Delete page?" : "Duplicate page?"}</h2><p>{confirmationPage ? `${confirmationPage.label || "Untitled page"}` : "This page is no longer available."}</p><p>{pageConfirmation.action === "delete" ? "The page will move to Recently deleted, where you can restore it." : "Create a copy of this page and its contents."}</p><div className="ink-actions"><button autoFocus onClick={() => setPageConfirmation(null)}>Cancel</button><button disabled={!confirmationPage} onClick={() => { if (!confirmationPage) return; if (pageConfirmation.action === "delete") { savePage({ ...confirmationPage, deleted: true }); setMessage("Page moved to Recently deleted. Restore it from Pages."); } else { void duplicatePage(confirmationPage); } setPageConfirmation(null); setPageMenuId(null); }}>{pageConfirmation.action === "delete" ? "Delete page" : "Duplicate page"}</button></div></section></div>}
    {toolboxOpen && <PenToolbox preferences={props.preferences} onPreferences={props.onPreferences} onClose={() => setToolboxOpen(false)} />}
    {templatesOpen && <div className="ink-modal-scrim" onClick={() => setTemplatesOpen(false)}><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Page templates" onClick={e => e.stopPropagation()}><h2>Page templates</h2><div className="ink-actions">{([{ name: "Lecture / Cornell", kind: "cornell" }, { name: "Math / graph", kind: "graph" }, { name: "Lab / dots", kind: "dots" }] as const).map(t => <button key={t.kind} onClick={() => void applyTemplate({ id: t.kind, name: t.name, paper: { ...defaultPaper, kind: t.kind }, createdAt: 0 }, true).catch(e => setMessage(e.message))}>{t.name}</button>)}</div>{templates.map(t => <div className="ink-actions" key={t.id}><button onClick={() => void applyTemplate(t).catch(e => setMessage(e.message))}>{t.name}</button><button aria-label={`Delete template ${t.name}`} onClick={() => void deleteInkTemplate(props.userId, t.id).catch(e => setMessage(e.message))}>×</button></div>)}{page && !page.pdfPage && <><label>Save this page as a template<input placeholder="e.g. CHEM 101 lab report" value={templateName} onChange={e => setTemplateName(e.target.value)} /></label><button disabled={!templateName.trim()} onClick={() => void saveTemplate().catch(e => setMessage(e.message))}>Save template</button></>}<p>Templates create new pages with independent, editable ink.</p><button onClick={() => setTemplatesOpen(false)}>Done</button></section></div>}
    {exportOpen && <div className="ink-modal-scrim"><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Export PDF"><h2>Export pages</h2><p>Use “all”, “bookmarks”, or a range such as 1-4, 7.</p><input aria-label="Pages to export" value={exportRange} onChange={e => setExportRange(e.target.value)} /><div className="ink-actions"><button className="ink-primary" onClick={() => void doExport()}>Download PDF</button><button onClick={() => setExportOpen(false)}>Cancel</button></div></section></div>}
  </div>;
}

function InkPageEditor(props: Props & { continuous?: boolean; historyTarget: HTMLDivElement | null; viewControlsTarget: HTMLDivElement | null; onExport: () => void; options: boolean; setOptions: (open: boolean) => void; fullscreen: boolean; toggleFull: () => Promise<void>; pagesOpen: boolean; onTogglePages: () => void; page: InkPage; pageNumber: number; pdf: PDFDocumentProxy | null; onPage: (page: InkPage) => void; onMessage: (message: string) => void }) {
  const { noteId, userId, surface, page, preferences: prefs, onPreferences, onMessage } = props;
  const toolKey = `ink-tool:${userId}:${noteId}:${surface.id}`;
  const remembered = useRef(lastTool(toolKey));
  const [objects, setObjects] = useState<InkObject[]>([]), [selected, setSelected] = useState<string[]>([]), [loaded, setLoaded] = useState(false);
  const [penId, setPenId] = useState(remembered.current.penId ?? prefs.defaultPen), [tool, setTool] = useState<InkTool>(remembered.current.tool ?? "pen"), [shape, setShape] = useState(remembered.current.shape ?? "line");
  const [pensCollapsed, setPensCollapsed] = useState(false);
  const penToolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pensCollapsed && penToolbarRef.current) penToolbarRef.current.scrollLeft = 0; }, [pensCollapsed]);
  const previousTool = useRef(tool);
  useEffect(() => { if (previousTool.current === "lasso" && tool !== "lasso") setSelected([]); previousTool.current = tool; }, [tool]);
  const [partial, setPartial] = useState(remembered.current.partial ?? false), [eraserSize, setEraserSize] = useState(remembered.current.eraserSize ?? 20), [editingPen, setEditingPen] = useState<Pen | null>(null);
  useEffect(() => { try { localStorage.setItem(toolKey, JSON.stringify({ penId, tool, shape, partial, eraserSize })); } catch {} }, [toolKey, penId, tool, shape, partial, eraserSize]);
  const { options, setOptions } = props;
  const [settingsTab, setSettingsTab] = useState<"writing" | "paper" | "view">("writing");
  const [study, setStudy] = useState(false), [background, setBackground] = useState("");
  const [pdfLines, setPdfLines] = useState<PdfTextLine[]>([]), [textMode, setTextMode] = useState(false), [pdfSelection, setPdfSelection] = useState<number[]>([]);
  const [status, setStatus] = useState("Opening ink…"), [historyVersion, setHistoryVersion] = useState(0), [textDialog, setTextDialog] = useState<{ id?: string; x: number; y: number; text: string } | null>(null);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [rectangularLasso, setRectangularLasso] = useState(false);
  const [conversion, setConversion] = useState<{ text: string; alternatives: string[]; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const { fullscreen, toggleFull } = props;
  const objectsRef = useRef(objects), edits = useRef(new InkHistory()), canvasRef = useRef<InkCanvasApi>(null), imageInput = useRef<HTMLInputElement>(null), rootRef = useRef<HTMLDivElement>(null);
  const penTimer = useRef<ReturnType<typeof setTimeout> | null>(null), draggedPen = useRef("");
  const path = objectPath(noteId, surface.id, page.id), pen = prefs.pens.find(p => p.id === penId) ?? prefs.pens.find(p => p.id === prefs.defaultPen) ?? prefs.pens[0];
  const draftRef = useRef<InkDraft | null>(null);
  const pageRef = useRef(page), onPageRef = useRef(props.onPage); pageRef.current = page; onPageRef.current = props.onPage;
  const draftRevision = useRef(Date.now());
  const fail = useCallback((e: Error) => { setStatus(`Save error: ${e.message}`); onMessage(e.message); }, [onMessage]);

  useEffect(() => {
    const recovered = readInkDraft(userId, path); draftRef.current = recovered;
    if (recovered) { objectsRef.current = recovered.after; setObjects(recovered.after); setLoaded(true); void saveInkChanges(path, recovered.before, recovered.after).then(() => { clearInkDraft(userId, path, recovered.revision); if (draftRef.current?.revision === recovered.revision) draftRef.current = null; }).catch(fail); }
    return listenInk<InkObject>(path, (values, pending, cached) => {
      const current = draftRef.current ? mergeInkDraft(values, draftRef.current) : values;
      const local = new Map(objectsRef.current.map(o => [o.id, o]));
      const sorted = current.map(o => { const prior = local.get(o.id); return prior && (prior === o || JSON.stringify(prior) === JSON.stringify(o)) ? prior : o; }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      objectsRef.current = sorted; setObjects(sorted); setLoaded(true); setStatus(pending || draftRef.current ? "Saved on device · syncing…" : cached ? "Available on device" : "Synced");
    }, fail);
  }, [userId, path, fail]);
  useEffect(() => { let canceled = false, url = ""; if (!props.pdf || !page.pdfPage) return; renderPdfPage(props.pdf, page.pdfPage, page.paper.width).then(result => { url = result.url; if (canceled) { URL.revokeObjectURL(url); return; } setBackground(url); setPdfLines(result.lines); const text = result.lines.map(l => l.text).join(" "); const searchText = [text, ...objectsRef.current.flatMap(o => o.text ? [o.text] : [])].join("\n").trim().slice(0, 60_000); if (text !== page.pdfText || searchText !== page.searchText) props.onPage({ ...page, pdfText: text.slice(0, 60_000), searchText }); }).catch(e => onMessage(e.message)); return () => { canceled = true; if (url) URL.revokeObjectURL(url); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pdf, page.pdfPage, page.paper.width]);
  const commit = useCallback((next: InkObject[], record = true) => {
    const before = objectsRef.current;
    if (before.length === next.length && before.every((o, i) => o === next[i])) return;
    if (record) edits.current.record(before, next);
    const revision = ++draftRevision.current;
    const draft = makeInkDraft(before, next, draftRef.current, revision);
    draftRef.current = draft;
    const cached = storeInkDraft(userId, path, draft);
    objectsRef.current = next; setObjects(next); setHistoryVersion(v => v + 1); setStatus("Saved on device · syncing…");
    const currentPage = pageRef.current;
    if (!currentPage.pdfPage || currentPage.pdfText !== undefined) {
      const searchText = [currentPage.pdfText ?? "", ...next.flatMap(o => o.text ? [o.text] : [])].join("\n").trim().slice(0, 60_000);
      if (searchText !== (currentPage.searchText ?? "")) onPageRef.current({ ...currentPage, searchText });
    }
    if (!cached) onMessage("Device draft storage is full. Keep this page open until syncing completes.");
    void saveInkChanges(path, draft.before, draft.after).then(() => { clearInkDraft(userId, path, revision); if (draftRef.current?.revision === revision) { draftRef.current = null; setStatus("Synced"); } }).catch(fail);
  }, [path, userId, fail, onMessage]);
  const history = useCallback((back: boolean) => {
    const next = edits.current.step(objectsRef.current, back);
    if (!next) return;
    commit(next, false);
    const remaining = new Set(next.map(object => object.id));
    setSelected(current => tool === "lasso" ? current.filter(id => remaining.has(id)) : []);
  }, [commit, tool]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!rootRef.current?.contains(document.activeElement) || target.closest("input, textarea, select") || target.isContentEditable || e.isComposing) return;
      if (e.key === "Backspace" && tool === "lasso" && selected.length > 0) {
        e.preventDefault(); e.stopPropagation();
        const ids = new Set(selected);
        commit(objectsRef.current.filter(object => !ids.has(object.id)));
        setSelected([]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
        e.preventDefault(); e.stopPropagation(); history(e.key.toLowerCase() === "z" && !e.shiftKey);
      }
    };
    const root = rootRef.current;
    root?.addEventListener("keydown", handler);
    return () => root?.removeEventListener("keydown", handler);
  }, [history, commit, tool, selected]);
  const picked = objects.filter(o => selected.includes(o.id));
  const convertSelection = async () => { setConversion({ text: picked.map(o => o.text ?? "").filter(Boolean).join(" "), alternatives: [], ids: selected }); if (!canRecognizeHandwriting()) return; setBusy(true); onMessage("Recognizing on your tablet. The language model downloads on first use…"); try { const candidates = await recognizeHandwriting(picked); setConversion({ text: candidates[0] ?? "", alternatives: candidates.slice(1, 5), ids: selected }); onMessage("Review the recognized text before using it."); } catch (e) { onMessage(String(e)); } finally { setBusy(false); } };
  const rememberText = () => { if (!conversion?.text.trim()) return; const text = conversion.text.trim(); commit(objectsRef.current.map(o => o.id === conversion.ids[0] ? { ...o, text } : o)); };
  const createTaskFromInk = async () => { if (!conversion?.text.trim()) return; const now = Date.now(); await saveTask({ id: uid(), userId, type: "todo", title: conversion.text.trim().slice(0, 200), description: `${conversion.text}\n\nSource: /dashboard/notes/?note=${noteId}&surface=${surface.id}&page=${page.id}`, priority: "medium", goalId: "", dueDate: null, startDateTime: null, dueDateTime: null, startAllDay: false, dueAllDay: false, notificationDateTime: null, completed: false, completedAt: null, archived: false, sortOrder: now, createdAt: now }); rememberText(); setConversion(null); onMessage("Task created with a link back to this page."); };
  const changeSelection = (map: (o: InkObject) => InkObject) => commit(objectsRef.current.map(o => selected.includes(o.id) ? map(o) : o));
  const transform = (scale: number, degrees: number) => { const moved = new Map(transformObjects(picked, 0, 0, scale, degrees).map(o => [o.id, o])); commit(objectsRef.current.map(o => moved.get(o.id) ?? o)); };
  const paste = () => { if (!inkClipboard.length) return; const copies = transformObjects(inkClipboard, 24, 24).map(o => ({ ...o, id: uid(), order: Date.now() })); commit([...objectsRef.current, ...copies]); setSelected(copies.map(o => o.id)); setTool("lasso"); };
  const sendImage = async () => { if (!picked.length) return; setBusy(true); try { const blob = await objectsPng(picked); const uploaded = await uploadNoteImage(userId, noteId, new File([blob], "Handwritten selection.png", { type: "image/png" })); props.onSend(`![Handwritten selection](${uploaded.downloadUrl})\n\n[Source: ${surface.name}, page ${page.label || props.pageNumber}](/dashboard/notes/?note=${noteId}&surface=${surface.id}&page=${page.id})`); } catch (e) { onMessage(String(e)); } finally { setBusy(false); } };
  const addImage = async (file: File) => { setBusy(true); try { const uploaded = await uploadNoteImage(userId, noteId, file); const bitmap = await createImageBitmap(file), width = Math.min(400, page.paper.width * .7), height = width * bitmap.height / bitmap.width; bitmap.close(); const object: InkObject = { id: uid(), kind: "image", points: [], color: "#000000", width: 1, opacity: 1, style: "pen", pressure: 0, order: Date.now(), x: 80, y: 80, w: width, h: height, url: uploaded.downloadUrl }; commit([...objectsRef.current, object]); setSelected([object.id]); setTool("lasso"); } catch (e) { onMessage(String(e)); } finally { setBusy(false); } };
  const highlightText = () => { const highlights: InkObject[] = pdfSelection.map(i => { const l = pdfLines[i]; return { id: uid(), kind: "stroke", points: [{ x: l.x, y: l.y + l.h * .55, p: .5, t: 0 }, { x: l.x + l.w, y: l.y + l.h * .55, p: .5, t: 1 }], width: l.h * 1.15, color: pen.style === "highlighter" ? pen.color : "#facc15", opacity: .3, style: "highlighter", pressure: 0, order: Date.now() }; }); commit([...objectsRef.current, ...highlights]); setPdfSelection([]); setTextMode(false); };
  const addText = () => { if (!textDialog?.text.trim()) return; const existing = objectsRef.current.find(o => o.id === textDialog.id); const o: InkObject = { id: uid(), kind: "text", points: [], x: textDialog.x, y: textDialog.y, width: 20, color: pen.color, opacity: 1, pressure: 0, style: "pen", order: Date.now(), ...existing, w: Math.min(page.paper.width - textDialog.x, Math.max(...textDialog.text.split("\n").map(s => s.length)) * (existing?.width ?? 20) * .65), h: textDialog.text.split("\n").length * (existing?.width ?? 20) * 1.4, text: textDialog.text }; commit(existing ? objectsRef.current.map(v => v.id === existing.id ? o : v) : [...objectsRef.current, o]); setTextDialog(null); };

  const viewControls = <div className="ink-view-controls"><button onClick={() => canvasRef.current?.fitWidth()} title="Fit width" aria-label="Fit width"><svg className="ink-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H3V8M16 3H21V8M21 16V21H16M8 21H3V16" /><path d="M5 12H19M8 9L5 12L8 15M16 9L19 12L16 15" /></svg></button><button onClick={() => canvasRef.current?.fit()} title="Fit page" aria-label="Fit page"><svg className="ink-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H3V8M16 3H21V8M21 16V21H16M8 21H3V16" /><rect x="8" y="6" width="8" height="12" rx="1" /></svg></button><><button onClick={() => canvasRef.current?.zoom(.8)} aria-label="Zoom out" title="Zoom out"><TbZoomOut className="ink-tool-icon" aria-hidden="true" /></button><button onClick={() => canvasRef.current?.zoom(1.25)} aria-label="Zoom in" title="Zoom in"><TbZoomIn className="ink-tool-icon" aria-hidden="true" /></button></><button onClick={() => void toggleFull()} title={fullscreen ? "Exit focus" : "Focus mode"} aria-label={fullscreen ? "Exit focus" : "Focus mode"}>{fullscreen ? <TbMinimize className="ink-tool-icon" aria-hidden="true" /> : <TbMaximize className="ink-tool-icon" aria-hidden="true" />}</button>{page.pdfPage && <button aria-pressed={textMode} onClick={() => setTextMode(!textMode)}>Select PDF text</button>}{props.syncStatusTarget ? createPortal(<span className="ink-save-status" role="status" data-history={historyVersion}>{status}</span>, props.syncStatusTarget) : <span className="ink-save-status" role="status" data-history={historyVersion}>{status}</span>}</div>;
  return <div ref={rootRef} tabIndex={0} className="ink-page-editor" onPaste={e => { const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith("image/")); if (file) { e.preventDefault(); void addImage(file); } }} onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={e => { const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/")); if (file) { e.preventDefault(); void addImage(file); } }}>
    <div ref={penToolbarRef} className={`ink-toolbar${prefs.leftHanded ? " is-left-handed" : ""}${pensCollapsed ? " has-collapsed-pens" : ""}`} role="toolbar" aria-label="Handwriting tools">
      {props.historyTarget && createPortal(<><button disabled={!edits.current.undo.length} onClick={() => history(true)} title="Undo (Ctrl+Z)">↶</button><button disabled={!edits.current.redo.length} onClick={() => history(false)} title="Redo (Ctrl+Shift+Z)">↷</button></>, props.historyTarget)}

      {(pensCollapsed ? [pen] : prefs.pens).map(p => <button draggable onDragStart={() => { draggedPen.current = p.id; }} onDragOver={e => e.preventDefault()} onDrop={() => { const pens = [...prefs.pens]; const index = pens.findIndex(v => v.id === draggedPen.current); if (index < 0) return; const [moved] = pens.splice(index, 1); pens.splice(pens.findIndex(v => v.id === p.id), 0, moved); onPreferences({ ...prefs, pens }); }} key={p.id} className={`ink-preset${p.style === "fountain" ? " ink-preset-fountain" : ""}${tool === "pen" && p.id === pen.id ? " is-active" : ""}`} aria-label={`${p.name}, ${p.style}, ${p.width} pixels, ${p.color}, ${Math.round(p.opacity * 100)}% opacity`} aria-pressed={tool === "pen" && p.id === pen.id} title={`${p.name} · ${p.style} · ${p.width} px · ${p.color} · ${Math.round(p.opacity * 100)}% opacity · hold to edit`} aria-expanded={tool === "pen" && p.id === pen.id ? !pensCollapsed : undefined} onClick={() => { if (tool === "pen" && p.id === pen.id) setPensCollapsed(value => !value); setPenId(p.id); setTool("pen"); }} onDoubleClick={() => setEditingPen(p)} onPointerDown={() => { penTimer.current = setTimeout(() => setEditingPen(p), 500); }} onPointerUp={() => { if (penTimer.current) clearTimeout(penTimer.current); }} onPointerLeave={() => { if (penTimer.current) clearTimeout(penTimer.current); }} onContextMenu={e => { e.preventDefault(); setEditingPen(p); }}><PenPreview pen={p} />{p.id === prefs.defaultPen && <small>•</small>}</button>)}
      <button onClick={() => { const p = { ...pen, id: uid(), name: "New pen" }; onPreferences({ ...prefs, pens: [...prefs.pens, p] }); setEditingPen(p); }} title="Add saved pen">+</button>
      <button aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} title="Eraser" aria-label="Eraser"><TbEraser className="ink-tool-icon" aria-hidden="true" /></button>
      {!prefs.compact && <>
        <button aria-pressed={tool === "lasso"} onClick={() => setTool("lasso")} title="Lasso" aria-label="Lasso"><TbLasso className="ink-tool-icon" aria-hidden="true" /></button>
        <button aria-pressed={tool === "shape"} onClick={() => setTool("shape")} title="Shapes" aria-label="Shapes"><TbGeometry className="ink-tool-icon" aria-hidden="true" /></button>
        <button disabled={busy} onClick={() => imageInput.current?.click()} title="Insert image" aria-label="Insert image"><TbPhoto className="ink-tool-icon" aria-hidden="true" /></button>
        <button aria-pressed={tool === "text"} onClick={() => setTool("text")} title="Text" aria-label="Text"><svg className="ink-tool-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4H20L20.5 9H19L18 6H13.5V18L16 18.5V20H8V18.5L10.5 18V6H6L5 9H3.5L4 4Z" fill="currentColor" /><path d="M5 23H19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".35" /></svg></button>
        <button aria-pressed={tool === "cover"} onClick={() => setTool("cover")} title="Cover: draw over answers, then use Study covers to hide and reveal them" aria-label="Cover answers for study"><TbEyeOff className="ink-tool-icon" aria-hidden="true" /></button>
        <button aria-pressed={tool === "pan"} onClick={() => setTool("pan")} title="Pan" aria-label="Pan"><TbHandMove className="ink-tool-icon" aria-hidden="true" /></button>
      </>}
      <button className="ink-toolbar-toggle" aria-expanded={!prefs.compact} aria-label={prefs.compact ? "Expand toolbar" : "Collapse toolbar"} title={prefs.compact ? "Expand toolbar" : "Collapse toolbar"} onClick={() => onPreferences({ ...prefs, compact: !prefs.compact })}>{prefs.compact ? <TbArrowRight className="ink-tool-icon" aria-hidden="true" /> : <TbArrowLeft className="ink-tool-icon" aria-hidden="true" />}</button>
    </div>
    {options && <div className="ink-modal-scrim" onClick={() => setOptions(false)} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOptions(false); } }}><section className="ink-dialog ink-workspace-settings" role="dialog" aria-modal="true" aria-label="Handwriting settings" onClick={e => e.stopPropagation()}><div className="ink-dialog-title"><h2>Settings</h2><button autoFocus aria-label="Close settings" onClick={() => setOptions(false)}>×</button></div><div className="ink-settings-tabs" role="tablist" aria-label="Settings sections"><button role="tab" aria-selected={settingsTab === "writing"} onClick={() => setSettingsTab("writing")}>Writing</button><button role="tab" aria-selected={settingsTab === "paper"} onClick={() => setSettingsTab("paper")}>Paper</button><button role="tab" aria-selected={settingsTab === "view"} onClick={() => setSettingsTab("view")}>View</button></div>{settingsTab === "writing" ? <div role="tabpanel" aria-label="Writing" className="ink-writing-settings"><div className="ink-settings-grid"><label className="ink-check"><input type="checkbox" checked={prefs.enhancer} onChange={e => onPreferences({ ...prefs, enhancer: e.target.checked })} /> Stroke enhancer</label><label className="ink-check"><input type="checkbox" checked={prefs.holdShapes} onChange={e => onPreferences({ ...prefs, holdShapes: e.target.checked })} /> Hold to straighten</label><label>Finger input<select value={prefs.touch} onChange={e => onPreferences({ ...prefs, touch: e.target.value as InkPreferences["touch"] })}><option value="pan">Pan</option><option value="ignore">Two fingers only</option><option value="draw">Draw with finger</option></select></label><label className="ink-check"><input type="checkbox" checked={prefs.highlightBelow} onChange={e => onPreferences({ ...prefs, highlightBelow: e.target.checked })} /> Highlights below ink</label><label className="ink-check"><input type="checkbox" checked={prefs.leftHanded} onChange={e => onPreferences({ ...prefs, leftHanded: e.target.checked })} /> Reverse toolbar</label><button onClick={() => { setOptions(false); setEditingPen(pen); }}>Edit active pen</button></div></div> : settingsTab === "view" ? <div role="tabpanel" aria-label="View"><div className="ink-view-options" role="group" aria-label="Page view">{([{ id: "default", name: "Default", detail: "Write and edit your page normally." }, { id: "study", name: "Study covers", detail: "Hide covered answers and tap to reveal them." }, { id: "annotations", name: "Annotations", detail: "Browse text labels, comments, and highlights." }] as const).map(mode => <button key={mode.id} aria-pressed={mode.id === "study" ? study : mode.id === "annotations" ? annotationsOpen : !study && !annotationsOpen} onClick={() => { setStudy(mode.id === "study"); setAnnotationsOpen(mode.id === "annotations"); }}><strong>{mode.name}</strong><small>{mode.detail}</small></button>)}</div></div> : <div role="tabpanel" aria-label="Paper">{page.pdfPage ? <p>Paper settings are fixed for imported PDF pages.</p> : <><PaperSettings defaultPaper={prefs.paper} paper={page.paper} courses={props.courses} onChange={paper => props.onPage({ ...page, paper })} /><div className="ink-actions"><button onClick={() => onPreferences({ ...prefs, paper: page.paper })}>Use as global default</button></div></>}</div>}<div className="ink-actions"><button className="ink-settings-export" onClick={props.onExport}><TbFileExport className="ink-tool-icon" aria-hidden="true" /> Export PDF</button><button onClick={() => setOptions(false)}>Done</button><small>Changes apply immediately.</small></div></section></div>}
    {tool === "eraser" && <div className="ink-context"><button aria-pressed={!partial} onClick={() => setPartial(false)}>Whole stroke</button><button aria-pressed={partial} onClick={() => setPartial(true)}>Partial eraser</button><label>Size <input type="range" min="4" max="80" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} /></label></div>}
    {tool === "shape" && <div className="ink-context">{["line", "arrow", "rectangle", "ellipse", "triangle"].map(s => <button aria-pressed={shape === s} key={s} onClick={() => setShape(s)}>{s}</button>)}</div>}
    {tool === "lasso" && <div className="ink-context"><button aria-pressed={rectangularLasso} onClick={() => setRectangularLasso(!rectangularLasso)}>{rectangularLasso ? "Rectangle selection" : "Freehand selection"}</button><span>{selected.length ? `${selected.length} selected` : "Draw around any part of your ink"}</span><button disabled={!inkClipboard.length} onClick={paste}>Paste</button>{picked.length > 0 && <><button onClick={() => { inkClipboard = structuredClone(picked); }}>Copy</button><button onClick={() => { inkClipboard = structuredClone(picked); commit(objectsRef.current.filter(o => !selected.includes(o.id))); setSelected([]); }}>Cut</button><button onClick={() => { inkClipboard = structuredClone(picked); paste(); }}>Duplicate</button><button onClick={() => { commit(objectsRef.current.filter(o => !selected.includes(o.id))); setSelected([]); }}>Delete</button>{picked.some(o => o.kind === "cover") && <button onClick={() => { const coverIds = new Set(objectsRef.current.filter(o => o.kind === "cover" && selected.includes(o.id)).map(o => o.id)); commit(objectsRef.current.filter(o => !coverIds.has(o.id))); setSelected(current => current.filter(id => !coverIds.has(id))); }}>Remove covers</button>}<button onClick={() => { const group = uid(); changeSelection(o => ({ ...o, group })); }}>Group</button><button onClick={() => changeSelection(o => ({ ...o, group: "" }))}>Ungroup</button><button onClick={() => transform(.9, 0)}>Smaller</button><button onClick={() => transform(1.1, 0)}>Larger</button><input type="color" aria-label="Recolour selected ink" value={picked[0]?.color ?? "#20242c"} onChange={e => changeSelection(o => ({ ...o, color: e.target.value }))} /><button onClick={() => changeSelection(o => ({ ...o, width: pen.width }))}>Pen thickness</button><button disabled={busy} onClick={() => void convertSelection()}>Convert to text</button><button className="ink-primary" disabled={busy} onClick={() => void sendImage()}>{busy ? "Uploading…" : "Insert into typed notes"}</button><button onClick={() => { void objectsPng(picked).then(blob => downloadBlob(blob, "handwritten-selection.png")).catch(e => onMessage(e.message)); }}>PNG</button><button onClick={() => { const b = objectBounds(picked)!; commit([...objectsRef.current, { id: uid(), kind: "cover", points: [], color: "#6366f1", width: 1, opacity: 1, style: "pen", pressure: 0, order: Date.now(), ...b }]); }}>Cover for study</button></>}</div>}
    {props.viewControlsTarget ? createPortal(viewControls, props.viewControlsTarget) : viewControls}
    {textMode && <div className="ink-pdf-text"><p>Select text blocks from this page.</p><div className="ink-actions"><button disabled={!pdfSelection.length} onClick={highlightText}>Highlight</button><button disabled={!pdfSelection.length} onClick={() => props.onSend(pdfSelection.map(i => pdfLines[i].text).join(" ") + `\n\n[${surface.name}, page ${page.pdfPage}](/dashboard/notes/?note=${noteId}&surface=${surface.id}&page=${page.id})`)}>Send to typed notes</button><button disabled={!pdfSelection.length} onClick={() => void navigator.clipboard.writeText(pdfSelection.map(i => pdfLines[i].text).join(" ")).catch(e => onMessage(e.message))}>Copy</button></div>{pdfLines.length ? pdfLines.map((l, i) => <button key={i} aria-pressed={pdfSelection.includes(i)} onClick={() => setPdfSelection(current => current.includes(i) ? current.filter(v => v !== i) : [...current, i].sort((a, b) => a - b))}>{l.text || " "}</button>) : <p>This page has no selectable text. Use the highlighter on the page.</p>}</div>}
    {annotationsOpen && <div className="ink-pdf-text"><p>Labels, comments, and highlights on this page.</p>{objects.filter(o => o.text || o.style === "highlighter").map((o, i) => <div className="ink-actions" key={o.id}><button onClick={() => { setSelected([o.id]); setTool("lasso"); canvasRef.current?.fit(); }}>{o.text || `Highlight ${i + 1}`}</button>{o.kind === "text" && <button onClick={() => setTextDialog({ id: o.id, x: o.x ?? 0, y: o.y ?? 0, text: o.text ?? "" })}>Edit</button>}</div>)}</div>}
    {loaded ? <InkCanvas continuous={props.continuous} focusMode={fullscreen} ref={canvasRef} objects={objects} paper={page.paper} pen={pen} tool={tool} shape={shape} partialEraser={partial} eraserSize={eraserSize} enhancer={prefs.enhancer} touch={prefs.touch} selected={selected} onSelect={setSelected} onChange={commit} highlightBelow={prefs.highlightBelow} holdShapes={prefs.holdShapes} study={study} background={background} onText={(x, y) => setTextDialog({ x, y, text: "" })} rectangularLasso={rectangularLasso} /> : <div className="ink-empty">Opening your ink…</div>}
    <input ref={imageInput} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void addImage(file); }} />
    {editingPen && <PenSettings key={editingPen.id} pen={editingPen} onClose={() => setEditingPen(null)} onSave={p => onPreferences({ ...prefs, pens: prefs.pens.map(v => v.id === p.id ? p : v) })} onDefault={p => onPreferences({ ...prefs, defaultPen: p.id, pens: prefs.pens.map(v => v.id === p.id ? p : v) })} onDelete={() => { if (prefs.pens.length > 1) onPreferences({ ...prefs, pens: prefs.pens.filter(p => p.id !== editingPen.id), defaultPen: prefs.defaultPen === editingPen.id ? prefs.pens.find(p => p.id !== editingPen.id)!.id : prefs.defaultPen }); }} onDuplicate={p => onPreferences({ ...prefs, pens: [...prefs.pens, p] })} />}
    {conversion && <div className="ink-modal-scrim"><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Review handwriting text"><h2>Review handwriting</h2><p>{canRecognizeHandwriting() ? "Check the recognized text before inserting it. Your original ink stays editable." : "Automatic recognition runs in the Android tablet app. Add a transcription here to make this selection searchable."}</p><textarea autoFocus rows={6} aria-label="Recognized text" value={conversion.text} onChange={e => setConversion({ ...conversion, text: e.target.value })} />{conversion.alternatives.map((text, i) => <button key={i} onClick={() => setConversion({ ...conversion, text })}>{text}</button>)}<div className="ink-actions"><button className="ink-primary" disabled={busy || !conversion.text.trim()} onClick={() => { rememberText(); props.onSend(conversion.text); setConversion(null); }}>Send to typed notes</button><button disabled={!conversion.text.trim()} onClick={() => { rememberText(); setConversion(null); }}>Save searchable text</button><button disabled={!conversion.text.trim()} onClick={() => void createTaskFromInk().catch(e => onMessage(e.message))}>Create task</button><button onClick={() => setConversion(null)}>Cancel</button></div></section></div>}
    {textDialog && <div className="ink-modal-scrim"><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Add text to page"><h2>Add a label or comment</h2><textarea autoFocus rows={5} value={textDialog.text} onChange={e => setTextDialog({ ...textDialog, text: e.target.value })} /><div className="ink-actions"><button className="ink-primary" onClick={addText}>Insert text</button><button onClick={() => setTextDialog(null)}>Cancel</button></div></section></div>}
  </div>;
}
