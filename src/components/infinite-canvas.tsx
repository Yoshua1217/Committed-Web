"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { TbPointer, TbHandMove, TbPencil, TbEraser, TbTypography, TbGeometry, TbArrowUpRight, TbLayoutSidebarRight, TbZoomIn, TbZoomOut, TbFocusCentered, TbArrowBackUp, TbArrowForwardUp, TbGridDots, TbHelp, TbX, TbMaximize, TbMinimize, TbSettings } from "react-icons/tb";
import type { InkObject, Pen, Point } from "@/lib/ink-model";
import { DEFAULT_INK_PREFERENCES, type InkPreferences, uid, eraseObjects, enhancePoints, lassoObjects } from "@/lib/ink-model";
import { drawObject, drawSegment, loadInkImage } from "@/lib/ink-renderer";
import { nativePenButtonHeld, penEraserHeld, penInContact } from "@/lib/ink-pointer";
import { Anchor, Camera, CanvasStyle, DEFAULT_STYLE, ShapeKind, XY, anchorPoint, bounds, cloneObjects, connection, moveObjects, resizeBox, snapAnchor, worldPoint, zoomAt } from "@/lib/canvas-model";
import { canvasPlainText, canvasTextHeight, toggleCanvasCheck } from "@/lib/canvas-text";
import { makeCanvasObject } from "@/lib/canvas-create";
import { arrangeCanvas } from "@/lib/canvas-actions";
import { InkHistory } from "@/lib/ink-history";
import { CanvasConnections, CanvasShape } from "./canvas-objects";
import CanvasTextEditor from "./canvas-text-editor";
import CanvasSidebar from "./canvas-sidebar";
import InkEraserOptions from "./ink-eraser-options";
import InkToolbar from "./ink-toolbar";
import { PenSettings } from "./ink-settings";
import "./infinite-canvas.css";

type Tool = "pen" | "select" | "pan" | "eraser" | "shape" | "text" | "connector" | "lasso" | "cover";
type Gesture = { id: number; mode: "pan" | "ink" | "erase" | "create" | "move" | "resize" | "connect" | "marquee" | "lasso"; polygon?: Point[]; start: XY; screen: XY; camera: Camera; before: InkObject[]; ids: Set<string>; object?: InkObject; handle?: string; endpoint?: "start" | "end"; moved: boolean };
type Props = { objects: InkObject[]; onChange: (objects: InkObject[]) => void; pens: Pen[]; storageKey: string; status?: string; title?: string; preferences?: InkPreferences; onPreferences?: (prefs: InkPreferences) => void; uploadImage?: (file: File) => Promise<string> };
const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: <TbPointer /> }, { id: "pan", label: "Hand", key: "H", icon: <TbHandMove /> },
  { id: "pen", label: "Pen", key: "P", icon: <TbPencil /> }, { id: "eraser", label: "Eraser", key: "E", icon: <TbEraser /> },
  { id: "text", label: "Text", key: "T", icon: <TbTypography /> }, { id: "shape", label: "Shapes", key: "R", icon: <TbGeometry /> },
  { id: "connector", label: "Connect", key: "C", icon: <TbArrowUpRight /> },
];
function readCamera(key: string): Camera { try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); if (v && [v.x, v.y, v.scale].every(Number.isFinite) && v.scale >= .05 && v.scale <= 8) return v; } catch {} return { x: 80, y: 80, scale: 1 }; }


export default function InfiniteCanvas({ objects, onChange, pens, storageKey, status = "Saved", title = "Infinite canvas", preferences, onPreferences, uploadImage }: Props) {
  const [localPrefs, setLocalPrefs] = useState<InkPreferences>({ ...DEFAULT_INK_PREFERENCES, pens });
  const prefs = preferences ?? localPrefs, changePrefs = onPreferences ?? setLocalPrefs;
  pens = prefs.pens;
  const [pensCollapsed, setPensCollapsed] = useState(false), [editingPen, setEditingPen] = useState<Pen | null>(null);
  const root = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), world = useRef<HTMLDivElement>(null), ink = useRef<HTMLCanvasElement>(null), liveInk = useRef<HTMLCanvasElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [partial, setPartial] = useState(false), [eraserSize, setEraserSize] = useState(20), [rectangularLasso, setRectangularLasso] = useState(false), [lasso, setLasso] = useState<Point[]>([]);
  const [settings, setSettings] = useState(false), [study, setStudy] = useState(false), [revealed, setRevealed] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("pen"), [shape, setShape] = useState<ShapeKind>("rounded"), [style, setStyle] = useState<CanvasStyle>(DEFAULT_STYLE);
  const [selected, setSelected] = useState<string[]>([]), [preview, setPreview] = useState<InkObject[] | null>(null), [sidebar, setSidebar] = useState(() => typeof window === "undefined" || window.innerWidth > 760);
  const [inkForeground, setInkForeground] = useState("#20242c");
  useEffect(() => {
    const el=root.current; if(!el) return;
    const update=()=>setInkForeground(getComputedStyle(el).getPropertyValue("--primary").trim() || "#20242c");
    update(); const observer=new MutationObserver(update);
    for(let parent: HTMLElement | null=el; parent; parent=parent.parentElement) observer.observe(parent,{attributes:true,attributeFilter:["class","style"]});
    return ()=>observer.disconnect();
  }, []);
  const themedInk = useCallback((o: InkObject) => o.kind === "stroke" && ["#20242c", "#000000", "#0a0a0a"].includes(o.color.toLowerCase()) ? { ...o, color: inkForeground } : o, [inkForeground]);
  const clipboard = useRef<InkObject[]>([]);
  const [camera, setCamera] = useState<Camera>(() => readCamera(storageKey)), cameraRef = useRef(camera);
  const [size, setSize] = useState({ w: 1000, h: 700 }), [grid, setGrid] = useState(true), [help, setHelp] = useState(false), [focus, setFocus] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [penId, setPenId] = useState(prefs.defaultPen);
  const [snap, setSnap] = useState<{ anchor: Anchor; point: XY } | null>(null), [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const items = preview ?? objects, objectsRef = useRef(objects); objectsRef.current = objects;
  const itemsRef = useRef(items); itemsRef.current = items;
  const gesture = useRef<Gesture | null>(null), space = useRef(false), touches = useRef(new Map<number, XY>()), pinch = useRef<{ distance: number; center: XY; camera: Camera } | null>(null);
  const history = useRef(new InkHistory()), [, refreshHistory] = useState(0), frame = useRef<number | null>(null), previewFrame = useRef<number | null>(null);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const pen = pens.find(p => p.id === penId) ?? pens.find(p => p.id === prefs.defaultPen) ?? pens[0];
  const selectedObjects = items.filter(o => selected.includes(o.id)), primary = selectedObjects[0];
  const chosenStyle = primary?.board ?? style;
  const setView = useCallback((next: Camera) => {
    cameraRef.current = next;
    if (world.current) world.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; setCamera(cameraRef.current); });
  }, []);
  const showPreview = (next: InkObject[]) => { itemsRef.current = next; if (previewFrame.current === null) previewFrame.current = requestAnimationFrame(() => { previewFrame.current = null; setPreview(itemsRef.current); }); };
  const cancelPreview = () => { if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current); previewFrame.current = null; setPreview(null); setSnap(null); setGuides({}); setMarquee(null); setLasso([]); };
  const commit = useCallback((next: InkObject[], record = true) => {
    if (record) history.current.record(objectsRef.current, next);
    objectsRef.current = next; itemsRef.current = next; onChangeRef.current(next); refreshHistory(v => v + 1);
  }, []);
  const finishGesture = (next: InkObject[], before: InkObject[]) => {
    // Apply only this gesture's changes; preserve unrelated incoming device edits.
    const base = new Map(before.map(o => [o.id, o])), result = new Map(next.map(o => [o.id, o])), merged = new Map(objectsRef.current.map(o => [o.id, o]));
    for (const id of new Set([...base.keys(), ...result.keys()])) if (base.get(id) !== result.get(id)) { const value = result.get(id); if (value) merged.set(id, value); else merged.delete(id); }
    commit([...merged.values()]); cancelPreview();
  };
  const undo = useCallback((back = true) => { const next = history.current.step(objectsRef.current, back); if (next) { commit(next, false); setSelected([]); } }, [commit]);
  const fit = useCallback(() => {
    const all = objectsRef.current, chosen = all.filter(o => selected.includes(o.id));
    const values = (chosen.length ? chosen : all).flatMap(o => o.kind === "connector" ? [connection(o, all).start, connection(o, all).end].map(p => ({ ...p, w: 1, h: 1 })) : [bounds(o)]);
    if (!values.length) { setView({ x: 80, y: 80, scale: 1 }); return; }
    const left = Math.min(...values.map(b => b.x)), top = Math.min(...values.map(b => b.y)), right = Math.max(...values.map(b => b.x + b.w)), bottom = Math.max(...values.map(b => b.y + b.h));
    const scale = Math.max(.05, Math.min(2, (size.w - 160) / Math.max(1, right - left), (size.h - 118) / Math.max(1, bottom - top)));
    setView({ x: (size.w - (right - left) * scale) / 2 - left * scale, y: 48 + (size.h - 118 - (bottom - top) * scale) / 2 - top * scale, scale });
  }, [selected, setView, size]);
  useEffect(() => { const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(camera)); } catch {} }, 300); return () => clearTimeout(timer); }, [camera, storageKey]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current); try { localStorage.setItem(storageKey, JSON.stringify(cameraRef.current)); } catch {} }, [storageKey]);
  useLayoutEffect(() => { const el = viewport.current; if (!el) return; const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".canvas-text-editor,.canvas-rich-toolbar,.canvas-link-form")) return;
      e.preventDefault(); if (gesture.current || editing) return;
      const b = el.getBoundingClientRect(), v = cameraRef.current, multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) setView(zoomAt(v, { x: e.clientX - b.left, y: e.clientY - b.top }, Math.exp(-e.deltaY * multiplier * .008)));
      else setView({ ...v, x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * multiplier, y: v.y - (e.shiftKey ? 0 : e.deltaY) * multiplier });
    };
    el.addEventListener("wheel", wheel, { passive: false }); return () => el.removeEventListener("wheel", wheel);
  }, [setView, editing]);
  const paintInk = useCallback(() => {
    const canvas = ink.current; if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), ctx = canvas.getContext("2d")!;
    canvas.width = Math.max(1, size.w * dpr); canvas.height = Math.max(1, size.h * dpr);
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, camera.x * dpr, camera.y * dpr);
    const left = -camera.x / camera.scale, top = -camera.y / camera.scale, right = left + size.w / camera.scale, bottom = top + size.h / camera.scale;
    const layer = (o: InkObject) => o.kind === "image" ? -2 : o.kind === "cover" ? 2 : prefs.highlightBelow && o.style === "highlighter" ? -1 : 0;
    for (const o of [...itemsRef.current].sort((a, b) => layer(a) - layer(b) || a.order - b.order)) {
      if (o.kind === "shape" || o.kind === "connector") continue;
      const b = bounds(o), margin = o.width + 10;
      if (b.x + b.w + margin < left || b.y + b.h + margin < top || b.x - margin > right || b.y - margin > bottom) continue;
      drawObject(ctx, themedInk(o), study, revealed.includes(o.id));
    }
  }, [size, camera, themedInk, prefs.highlightBelow, study, revealed]);
  useLayoutEffect(() => { paintInk(); }, [items, paintInk]);
  useEffect(() => { let active = true; const urls = [...new Set(objects.filter(o => o.kind === "image" && o.url).map(o => o.url!))]; if (urls.length) void Promise.allSettled(urls.map(loadInkImage)).then(() => { if (active) paintInk(); }); return () => { active = false; }; }, [objects, paintInk]);
  const clearLive = () => { const c = liveInk.current, ctx = c?.getContext("2d"); if (c && ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); } };
  const point = (e: { clientX: number; clientY: number }) => { const b = viewport.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const startEditing = (id: string) => { setEditing(id); setTool("select"); setSelected([id]); };
  const toggleCheck = (target: HTMLElement) => {
    const parent = target.closest("[data-object-id]"), id = parent?.getAttribute("data-object-id"), o = objectsRef.current.find(v => v.id === id);
    if (!o || o.board?.locked) return;
    const index = Array.from(parent!.querySelectorAll("[data-canvas-check]")).indexOf(target);
    const html = toggleCanvasCheck(o.board?.html ?? "", index);
    commit(objectsRef.current.map(v => v.id === id ? { ...v, text: canvasPlainText(html), board: { ...v.board, html } } : v));
  };
  const hitObject = (p: XY, target: EventTarget | null) => {
    const connector = (target as Element)?.closest?.("[data-connector-hit]")?.getAttribute("data-connector-hit");
    if (connector) return itemsRef.current.find(o => o.id === connector);
    return [...itemsRef.current].sort((a, b) => b.order - a.order).find(o => {
      if (o.kind === "connector") return false;
      const b = bounds(o), pad = 6 / cameraRef.current.scale;
      if (p.x < b.x - pad || p.x > b.x + b.w + pad || p.y < b.y - pad || p.y > b.y + b.h + pad) return false;
      if (o.board?.shape === "frame") return Math.min(Math.abs(p.x - b.x), Math.abs(p.x - b.x - b.w), Math.abs(p.y - b.y), Math.abs(p.y - b.y - b.h)) < 12 / cameraRef.current.scale;
      if (o.kind === "stroke") return o.points.some(v => Math.hypot(p.x - v.x, p.y - v.y) < Math.max(8 / cameraRef.current.scale, o.width));
      return true;
    });
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".canvas-overlay,.canvas-text-editor,.canvas-rich-toolbar,.canvas-link-form")) return;
    if (e.pointerType === "pen" && !penInContact(e.nativeEvent)) return;
    if (tool === "select" && (e.target as HTMLElement).closest("a")) return;
    const check = (e.target as HTMLElement).closest<HTMLElement>("[data-canvas-check]");
    if (tool === "select" && check) { e.preventDefault(); toggleCheck(check); return; }
    if (editing) { setEditing(null); return; }
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault(); viewport.current?.focus({ preventScroll: true });
    const screen = point(e), p = worldPoint(cameraRef.current, screen);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, screen);
      if (touches.current.size === 2) { const [a, b] = [...touches.current.values()]; pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: cameraRef.current }; gesture.current = null; cancelPreview(); clearLive(); e.currentTarget.setPointerCapture(e.pointerId); return; }
    }
    if (gesture.current || (e.pointerType === "touch" && prefs.touch === "ignore")) return;
    if (study) { const cover = [...objectsRef.current].reverse().find(o => o.kind === "cover" && p.x >= (o.x ?? 0) && p.y >= (o.y ?? 0) && p.x <= (o.x ?? 0) + (o.w ?? 0) && p.y <= (o.y ?? 0) + (o.h ?? 0)); if (cover) { setRevealed(ids => ids.includes(cover.id) ? ids.filter(id => id !== cover.id) : [...ids, cover.id]); return; } }
    e.currentTarget.setPointerCapture(e.pointerId);
    const g: Gesture = { id: e.pointerId, mode: "pan", start: p, screen, camera: cameraRef.current, before: objectsRef.current, ids: new Set(), moved: false };
    gesture.current = g;
    if (e.button === 1 || space.current || tool === "pan" || (e.pointerType === "touch" && prefs.touch !== "draw")) return;
    const handle = (e.target as HTMLElement).dataset.handle, endpoint = (e.target as HTMLElement).dataset.endpoint;
    if (tool === "select" && endpoint && primary?.kind === "connector" && !primary.board?.locked) { g.mode = "connect"; g.object = primary; g.endpoint = endpoint as "start" | "end"; return; }
    if (tool === "select" && handle && primary && !primary.board?.locked) { g.mode = "resize"; g.object = primary; g.handle = handle; return; }
    const port = (e.target as HTMLElement).dataset.port as Anchor["side"] | undefined;
    if (tool === "connector" || (tool === "select" && port && primary)) {
      const found = port && primary ? { anchor: { id: primary.id, side: port }, point: anchorPoint(primary, port) } : snapAnchor(g.before, p, cameraRef.current.scale);
      g.mode = "connect"; g.endpoint = "end"; g.object = { ...makeCanvasObject("rounded", p, style), kind: "connector", board: { border: "#64748b", borderWidth: 2, route: "curve", arrowEnd: true, ...style, shape: undefined, start: found?.point ?? p, end: p, from: found?.anchor, fill: "transparent" } }; g.object.board!.border = style.border ?? "#64748b"; setSelected([]); return;
    }
    if (tool === "pen" && !penEraserHeld(e.nativeEvent, nativePenButtonHeld()) && pen) {
      g.mode = "ink"; setSelected([]);
      const first = { ...p, p: e.pressure || .5, t: e.timeStamp };
      g.object = { id: uid(), kind: "stroke", points: [first], color: pen.color, width: pen.width, opacity: pen.opacity, style: pen.style, pressure: pen.pressure, order: Date.now() };
      const c = liveInk.current!, dpr = Math.min(devicePixelRatio || 1, 2); c.width = size.w * dpr; c.height = size.h * dpr;
      const ctx = c.getContext("2d")!; ctx.setTransform(dpr * cameraRef.current.scale, 0, 0, dpr * cameraRef.current.scale, cameraRef.current.x * dpr, cameraRef.current.y * dpr); ctx.globalAlpha = g.object.opacity; drawSegment(ctx, themedInk(g.object), first, first); return;
    }
    if (tool === "eraser" || penEraserHeld(e.nativeEvent, nativePenButtonHeld())) { g.mode = "erase"; itemsRef.current = eraseObjects(g.before, { ...p, p: .5, t: 0 }, { ...p, p: .5, t: 0 }, eraserSize, partial); showPreview(itemsRef.current); return; }
    if (tool === "cover") { g.mode = "create"; g.object = { id: uid(), kind: "cover", points: [], color: "#6366f1", width: 1, opacity: 1, style: "pen", pressure: 0, order: Date.now(), x: p.x, y: p.y, w: 120, h: 60 }; showPreview([...g.before, g.object]); return; }
    if (tool === "lasso") { const hit = hitObject(p, e.target); if (hit && selected.includes(hit.id)) { g.mode = "move"; g.ids = new Set(selected); } else { g.mode = "lasso"; g.polygon = [{ ...p, p: .5, t: 0 }]; setSelected([]); } return; }
    if (tool === "shape" || tool === "text") { g.mode = "create"; g.object = makeCanvasObject(tool === "text" ? "text" : shape, p, style); setSelected([]); showPreview([...g.before, g.object]); return; }
    if (tool === "select") {
      const hit = hitObject(p, e.target);
      if (hit) {
        const group = hit.group ? g.before.filter(o => o.group === hit.group).map(o => o.id) : [hit.id];
        const ids = e.shiftKey ? selected.includes(hit.id) ? selected.filter(id => !group.includes(id)) : [...new Set([...selected, ...group])] : selected.includes(hit.id) ? selected : group;
        setSelected(ids); g.ids = new Set(ids); g.mode = "move";
      } else { g.mode = "marquee"; if (!e.shiftKey) setSelected([]); g.ids = new Set(e.shiftKey ? selected : []); }
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const screen = point(e);
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, screen);
    if (pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()], initial = pinch.current, center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = zoomAt(initial.camera, initial.center, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, initial.distance));
      setView({ ...next, x: next.x + center.x - initial.center.x, y: next.y + center.y - initial.center.y }); return;
    }
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    const p = worldPoint(cameraRef.current, screen), dx = p.x - g.start.x, dy = p.y - g.start.y;
    g.moved ||= Math.hypot(screen.x - g.screen.x, screen.y - g.screen.y) > 3;
    if (g.mode === "pan") { setView({ ...g.camera, x: g.camera.x + screen.x - g.screen.x, y: g.camera.y + screen.y - g.screen.y }); return; }
    if (g.mode === "ink" && g.object) {
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent], ctx = liveInk.current!.getContext("2d")!;
      for (const event of events.length ? events : [e.nativeEvent]) { const pt: Point = { ...worldPoint(cameraRef.current, point(event)), p: event.pressure || .5, t: event.timeStamp }; const last = g.object.points.at(-1)!; if (Math.hypot(pt.x - last.x, pt.y - last.y) < .25 / cameraRef.current.scale) continue; g.object.points.push(pt); drawSegment(ctx, themedInk(g.object), last, pt); } return;
    }
    if (g.mode === "lasso") { const pt = { ...p, p: .5, t: 0 }; g.polygon = rectangularLasso ? [{ ...g.start, p: .5, t: 0 }, { x: p.x, y: g.start.y, p: .5, t: 0 }, pt, { x: g.start.x, y: p.y, p: .5, t: 0 }] : [...(g.polygon ?? []), pt]; setLasso(g.polygon); return; }
    if (g.mode === "erase") { const from = { ...g.start, p: .5, t: 0 }, to = { ...p, p: .5, t: 0 }; showPreview(eraseObjects(itemsRef.current, from, to, eraserSize, partial)); g.start = p; return; }
    if (g.mode === "create" && g.object && g.moved) { const w = Math.max(40, Math.abs(dx)), h = e.shiftKey ? w : Math.max(32, Math.abs(dy)); g.object = { ...g.object, x: dx < 0 ? g.start.x - w : g.start.x, y: dy < 0 ? g.start.y - h : g.start.y, w, h }; showPreview([...g.before, g.object]); return; }
    if (g.mode === "connect" && g.object) {
      const s = g.object.board ?? {}, found = snapAnchor(g.before, p, cameraRef.current.scale, g.endpoint === "start" ? s.to?.id : s.from?.id);
      setSnap(found); g.object = { ...g.object, board: { ...s, ...(g.endpoint === "start" ? { start: found?.point ?? p, from: found?.anchor } : { end: found?.point ?? p, to: found?.anchor }) } };
      showPreview([...g.before.filter(o => o.id !== g.object!.id), g.object]); return;
    }
    if (g.mode === "resize" && g.object) { const next = { ...g.object, ...resizeBox(bounds(g.object), g.handle!, { x: dx, y: dy }, e.shiftKey) }; showPreview(g.before.map(o => o.id === next.id ? next : o)); return; }
    if (g.mode === "move" && g.moved) {
      let mx = dx, my = dy; const guide: { x?: number; y?: number } = {};
      const moving = g.before.find(o => g.ids.has(o.id) && o.kind !== "connector" && !o.board?.locked);
      if (moving && !e.altKey) {
        const b = bounds(moving), threshold = 6 / cameraRef.current.scale; let bestX = threshold, bestY = threshold;
        for (const o of g.before) { if (g.ids.has(o.id) || o.kind === "stroke" || o.kind === "connector") continue; const target = bounds(o);
          for (const value of [target.x, target.x + target.w / 2, target.x + target.w]) for (const edge of [b.x, b.x + b.w / 2, b.x + b.w]) { const delta = value - (edge + dx); if (Math.abs(delta) < bestX) { bestX = Math.abs(delta); mx = dx + delta; guide.x = value; } }
          for (const value of [target.y, target.y + target.h / 2, target.y + target.h]) for (const edge of [b.y, b.y + b.h / 2, b.y + b.h]) { const delta = value - (edge + dy); if (Math.abs(delta) < bestY) { bestY = Math.abs(delta); my = dy + delta; guide.y = value; } }
        }
      }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) my = 0; else mx = 0; }
      setGuides(guide); showPreview(moveObjects(g.before, g.ids, mx, my)); return;
    }
    if (g.mode === "marquee") { const b = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) }; setMarquee(b); setSelected([...new Set([...g.ids, ...g.before.filter(o => { const v = bounds(o); return o.kind !== "connector" && v.x >= b.x && v.y >= b.y && v.x + v.w <= b.x + b.w && v.y + v.h <= b.y + b.h; }).map(o => o.id)])]); }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    touches.current.delete(e.pointerId); if (touches.current.size < 2) pinch.current = null;
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (cancelled) { cancelPreview(); clearLive(); return; }
    if (g.mode === "ink" && g.object) { const stroke = { ...g.object, points: prefs.enhancer ? enhancePoints(g.object.points, pen?.smoothing ?? .3) : g.object.points }; finishGesture([...g.before, stroke], g.before); clearLive(); }
    else if (g.mode === "lasso" && g.polygon && g.polygon.length > 2) { const result = lassoObjects(g.before, g.polygon); finishGesture(result.objects, g.before); setSelected(result.selected); }
    else if (g.mode === "create" && g.object) { finishGesture([...g.before, g.object], g.before); setTool("select"); setSelected([g.object.id]); if (["text", "note", "sticky"].includes(g.object.board?.shape ?? "")) startEditing(g.object.id); }
    else if (g.mode === "connect" && g.object && (g.moved || g.before.some(o => o.id === g.object!.id))) { finishGesture([...g.before.filter(o => o.id !== g.object!.id), g.object], g.before); setTool("select"); setSelected([g.object.id]); }
    else if (["move", "resize", "erase"].includes(g.mode) && (g.moved || g.mode === "erase")) finishGesture(itemsRef.current, g.before);
    else cancelPreview();
  };
  const insertImage = async (file: File) => {
    setBusy(true); setError("");
    try {
      if (!uploadImage) throw new Error("Image storage is unavailable for this canvas.");
      const url = await uploadImage(file), bitmap = await createImageBitmap(file), w = 400, h = w * bitmap.height / bitmap.width; bitmap.close();
      const center = worldPoint(cameraRef.current, { x: size.w / 2, y: size.h / 2 });
      const object: InkObject = { id: uid(), kind: "image", points: [], color: "#000000", width: 1, opacity: 1, style: "pen", pressure: 0, order: Date.now(), x: center.x - w / 2, y: center.y - h / 2, w, h, url };
      commit([...objectsRef.current, object]); setSelected([object.id]); setTool("select");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const action = (name: string) => arrangeCanvas(name, objectsRef.current, selected, commit, setSelected);
  const changeStyle = (patch: Partial<CanvasStyle>) => {
    if (patch.fill && /^#[0-9a-f]{6}$/i.test(patch.fill) && !patch.textColor) { const hex = patch.fill.slice(1), luma = .2126 * parseInt(hex.slice(0, 2), 16) + .7152 * parseInt(hex.slice(2, 4), 16) + .0722 * parseInt(hex.slice(4, 6), 16); patch = { ...patch, textColor: luma < 135 ? "#ffffff" : "#203353" }; }
    setStyle(s => ({ ...s, ...patch })); if (selected.length) commit(objectsRef.current.map(o => selected.includes(o.id) && !o.board?.locked ? { ...o, board: { ...o.board, ...patch } } : o));
  };
  const chooseShape = (kind: ShapeKind, patch?: Partial<CanvasStyle>) => { setShape(kind); setTool(kind === "text" ? "text" : "shape"); setSelected([]); setEditing(null); if (patch) setStyle(s => ({ ...s, ...patch })); viewport.current?.focus(); };
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = e => {
    const target = e.target as HTMLElement;
    if (!root.current?.contains(target) || target.closest("input,textarea,select,[contenteditable=true]") || e.isComposing) return;
    if (target.matches("[data-canvas-check]") && [" ", "Enter"].includes(e.key)) { e.preventDefault(); toggleCheck(target); return; }
    if (e.code === "Space") { e.preventDefault(); space.current = true; return; }
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["c", "x", "v"].includes(key)) {
      if (key === "c" || key === "x") { if (!selected.length) return; e.preventDefault(); clipboard.current = cloneObjects(objectsRef.current, new Set(selected), uid); if (key === "x") action("delete"); }
      else if (clipboard.current.length) { e.preventDefault(); const copies = cloneObjects(clipboard.current, new Set(clipboard.current.map(o => o.id)), uid); clipboard.current = copies; commit([...objectsRef.current, ...copies]); setTool("select"); setSelected(copies.map(o => o.id)); }
      return;
    }
    if (key === "escape") { if (gesture.current) { gesture.current = null; cancelPreview(); clearLive(); } setEditing(null); setSelected([]); setTool("select"); return; }
    if ((e.ctrlKey || e.metaKey) && ["z", "y", "a", "d", "g"].includes(key)) { e.preventDefault(); if (key === "z" || key === "y") undo(key === "z" && !e.shiftKey); if (key === "a") setSelected(objectsRef.current.map(o => o.id)); if (key === "d") action("duplicate"); if (key === "g") action(e.shiftKey ? "ungroup" : "group"); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (key === "delete" || key === "backspace") { e.preventDefault(); action("delete"); return; }
    if (key === "enter" && selected.length === 1 && !primary?.board?.locked) { e.preventDefault(); startEditing(selected[0]); return; }
    if (key.startsWith("arrow") && selected.length) { e.preventDefault(); const n = e.shiftKey ? 10 : 1; commit(moveObjects(objectsRef.current, new Set(selected), key === "arrowleft" ? -n : key === "arrowright" ? n : 0, key === "arrowup" ? -n : key === "arrowdown" ? n : 0)); return; }
    if (["+", "=", "-", "0", "1"].includes(key)) { e.preventDefault(); if (key === "1") fit(); else if (key === "0") setView(zoomAt(cameraRef.current, { x: size.w / 2, y: size.h / 2 }, 1 / cameraRef.current.scale)); else setView(zoomAt(cameraRef.current, { x: size.w / 2, y: size.h / 2 }, key === "-" ? .8 : 1.25)); return; }
    const next = TOOLS.find(t => t.key.toLowerCase() === key); if (next) { setTool(next.id); setSelected([]); if (next.id === "shape") setSidebar(true); }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyRef.current(e), up = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; }, blur = () => { space.current = false; touches.current.clear(); pinch.current = null; if (gesture.current) { gesture.current = null; cancelPreview(); clearLive(); } };
    document.addEventListener("keydown", down); document.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { document.removeEventListener("keydown", down); document.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);
  const visible = items.filter(o => { const b = bounds(o), left = (-camera.x - 600) / camera.scale, top = (-camera.y - 600) / camera.scale; return o.kind === "connector" || (b.x + b.w >= left && b.y + b.h >= top && b.x <= left + (size.w + 1200) / camera.scale && b.y <= top + (size.h + 1200) / camera.scale); }).sort((a, b) => a.order - b.order);
  const editObject = items.find(o => o.id === editing);
  return <div ref={root} className={`ink-ui infinite-canvas${focus ? " canvas-focus" : ""}`}>
    <header className="canvas-topbar"><div className="canvas-title"><span className="canvas-title-icon"><TbGeometry /></span><div><strong>{title}</strong><span>SPACE TO THINK</span></div></div><div className="canvas-top-actions"><span className="canvas-save-status" role="status"><i />{status}</span><button onClick={() => setFocus(v => !v)} aria-label={focus ? "Exit canvas focus" : "Focus canvas"}>{focus ? <TbMinimize /> : <TbMaximize />}</button><button aria-label="Canvas settings" onClick={() => setSettings(true)}><TbSettings /></button><button onClick={() => setHelp(v => !v)} aria-label="Canvas navigation help"><TbHelp /></button><button className={sidebar ? "is-active" : ""} aria-label="Toggle creative toolkit" aria-expanded={sidebar} onClick={() => setSidebar(v => !v)}><TbLayoutSidebarRight /><span>Toolkit</span></button></div></header>
    <InkToolbar prefs={prefs} pen={pen} tool={tool} setTool={next => { if (next === "whiteboard-eraser") return; setEditing(null); setTool(next); setSelected([]); if (next === "shape") setSidebar(true); }} setPenId={setPenId} onPreferences={changePrefs} setEditingPen={setEditingPen} pensCollapsed={pensCollapsed} setPensCollapsed={setPensCollapsed} onSticky={() => chooseShape("sticky")} busy={busy} onImage={() => imageInput.current?.click()} />
    {tool === "eraser" && <InkEraserOptions partial={partial} setPartial={setPartial} eraserSize={eraserSize} setEraserSize={setEraserSize} />}
    {tool === "lasso" && <div className="ink-context"><button aria-pressed={rectangularLasso} onClick={() => setRectangularLasso(!rectangularLasso)}>{rectangularLasso ? "Rectangle selection" : "Freehand selection"}</button><span>{selected.length ? `${selected.length} selected` : "Draw around any part of your ink"}</span>{selected.length > 0 && <><button onClick={() => { clipboard.current = cloneObjects(objectsRef.current, new Set(selected), uid); }}>Copy</button><button onClick={() => { clipboard.current = cloneObjects(objectsRef.current, new Set(selected), uid); action("delete"); }}>Cut</button><button onClick={() => action("duplicate")}>Duplicate</button><button onClick={() => action("delete")}>Delete</button><button onClick={() => action("group")}>Group</button><button onClick={() => action("ungroup")}>Ungroup</button></>}<button disabled={!clipboard.current.length} onClick={() => { const copies = cloneObjects(clipboard.current, new Set(clipboard.current.map(o => o.id)), uid); commit([...objectsRef.current, ...copies]); setSelected(copies.map(o => o.id)); }}>Paste</button></div>}
    {settings && <div className="ink-modal-scrim" onClick={() => setSettings(false)} onKeyDown={e => { if (e.key === "Escape") setSettings(false); }}><section className="ink-dialog ink-workspace-settings" role="dialog" aria-modal="true" aria-label="Canvas settings" onClick={e => e.stopPropagation()}><div className="ink-dialog-title"><h2>Settings</h2><button autoFocus aria-label="Close settings" onClick={() => setSettings(false)}>×</button></div><div className="ink-settings-grid"><label className="ink-check"><input type="checkbox" checked={prefs.enhancer} onChange={e => changePrefs({ ...prefs, enhancer: e.target.checked })} /> Stroke enhancer</label><label>Finger input<select value={prefs.touch} onChange={e => changePrefs({ ...prefs, touch: e.target.value as InkPreferences["touch"] })}><option value="pan">Pan</option><option value="ignore">Two fingers only</option><option value="draw">Draw with finger</option></select></label><label className="ink-check"><input type="checkbox" checked={prefs.highlightBelow} onChange={e => changePrefs({ ...prefs, highlightBelow: e.target.checked })} /> Highlights below ink</label><label className="ink-check"><input type="checkbox" checked={prefs.leftHanded} onChange={e => changePrefs({ ...prefs, leftHanded: e.target.checked })} /> Reverse toolbar</label><button onClick={() => { setSettings(false); setEditingPen(pen); }}>Edit active pen</button><label className="ink-check"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> Canvas grid</label><label className="ink-check"><input type="checkbox" checked={study} onChange={e => { setStudy(e.target.checked); setRevealed([]); }} /> Study covers · tap to reveal</label></div><div className="ink-actions"><button onClick={() => setSettings(false)}>Done</button><small>Changes apply immediately.</small></div></section></div>}
    <input ref={imageInput} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void insertImage(file); }} />
    {error && <div className="ink-status" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {editingPen && <div className="ink-ui"><PenSettings key={editingPen.id} pen={editingPen} onClose={() => setEditingPen(null)} onSave={p => changePrefs({ ...prefs, pens: prefs.pens.map(v => v.id === p.id ? p : v) })} onDefault={p => changePrefs({ ...prefs, defaultPen: p.id, pens: prefs.pens.map(v => v.id === p.id ? p : v) })} onDelete={() => { if (prefs.pens.length > 1) changePrefs({ ...prefs, pens: prefs.pens.filter(p => p.id !== editingPen.id), defaultPen: prefs.defaultPen === editingPen.id ? prefs.pens.find(p => p.id !== editingPen.id)!.id : prefs.defaultPen }); }} onDuplicate={p => changePrefs({ ...prefs, pens: [...prefs.pens, p] })} /></div>}
    <div className="canvas-body"><div ref={viewport} tabIndex={0} role="region" aria-label="Infinite canvas. P to draw, V to select, Space and drag to pan. Control and scroll to zoom." className={`canvas-viewport tool-${tool}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={e => onUp(e)} onPointerCancel={e => onUp(e, true)} onLostPointerCapture={e => { if (gesture.current?.id === e.pointerId) onUp(e, true); }} onContextMenu={e => e.preventDefault()} onDoubleClick={e => { if (tool !== "select" || editing || (e.target as HTMLElement).closest(".canvas-overlay")) return; const hit = hitObject(worldPoint(cameraRef.current, point(e)), e.target); if (hit && !hit.board?.locked && hit.kind !== "stroke" && hit.kind !== "image") startEditing(hit.id); }} style={{ backgroundImage: grid ? "radial-gradient(circle, color-mix(in srgb, var(--secondary) 25%, transparent) 1px, transparent 1px)" : "none", backgroundSize: `${24 * camera.scale * (camera.scale < .3 ? 4 : camera.scale > 3 ? .5 : 1)}px ${24 * camera.scale * (camera.scale < .3 ? 4 : camera.scale > 3 ? .5 : 1)}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }}>
      <div ref={world} className="canvas-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {visible.filter(o => o.kind === "shape").map(o => <CanvasShape key={o.id} object={o} editing={editing === o.id} />)}
        <CanvasConnections objects={items} selected={selected} />
      </div>
      <canvas ref={ink} className="canvas-ink" /><canvas ref={liveInk} className="canvas-ink canvas-live-ink" />
      <div className="canvas-selection-layer" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {(tool === "select" || tool === "lasso") && selectedObjects.filter(o => o.kind !== "connector" && editing !== o.id).map(o => { const b = bounds(o); return <div key={o.id} className={`canvas-selection${o.board?.locked ? " is-locked" : ""}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderWidth: 1.5 / camera.scale }}>
          {selected.length === 1 && !o.board?.locked && o.kind !== "stroke" && <>{["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(h => <button key={h} className={`canvas-resize handle-${h}`} data-handle={h} aria-label={`Resize ${h}`} style={{ width: 9 / camera.scale, height: 9 / camera.scale, borderWidth: 1 / camera.scale }} />)}{["top", "right", "bottom", "left"].map(side => <button key={side} className={`canvas-port port-${side}`} data-port={side} aria-label={`Connect from ${side}`} style={{ width: 13 / camera.scale, height: 13 / camera.scale, borderWidth: 2 / camera.scale }} />)}</>}
        </div>; })}
        {tool === "select" && primary?.kind === "connector" && !primary.board?.locked && ["start", "end"].map(endpoint => { const p = connection(primary, items)[endpoint as "start" | "end"]; return <button key={endpoint} className="canvas-endpoint" data-endpoint={endpoint} aria-label={`Move connection ${endpoint}`} style={{ left: p.x, top: p.y, width: 13 / camera.scale, height: 13 / camera.scale }} />; })}
        {tool === "connector" && visible.filter(o => o.kind === "shape" && o.board?.shape !== "frame").flatMap(o => (["top", "right", "bottom", "left"] as const).map(side => { const p = anchorPoint(o, side); return <span key={`${o.id}-${side}`} className="canvas-anchor-hint" style={{ left: p.x, top: p.y, width: 6 / camera.scale, height: 6 / camera.scale }} />; }))}
        {snap && <span className="canvas-snap-ring" style={{ left: snap.point.x, top: snap.point.y, width: 24 / camera.scale, height: 24 / camera.scale }} />}
        {guides.x !== undefined && <div className="canvas-guide vertical" style={{ left: guides.x, top: -camera.y / camera.scale, height: size.h / camera.scale, width: 1 / camera.scale }} />}{guides.y !== undefined && <div className="canvas-guide horizontal" style={{ top: guides.y, left: -camera.x / camera.scale, width: size.w / camera.scale, height: 1 / camera.scale }} />}
        {lasso.length > 1 && <svg style={{ position: "absolute", overflow: "visible", width: 1, height: 1 }}><polygon points={lasso.map(p => `${p.x},${p.y}`).join(" ")} fill="color-mix(in srgb, var(--primary) 10%, transparent)" stroke="var(--primary)" strokeWidth={1 / camera.scale} strokeDasharray={`${5 / camera.scale}`} /></svg>}
        {marquee && <div className="canvas-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / camera.scale }} />}
      </div>
      {editObject && <CanvasTextEditor key={editObject.id} object={editObject} camera={camera} objects={items} onSave={(html, text) => commit(objectsRef.current.map(o => { if (o.id !== editObject.id) return o; const padding = ["diamond", "triangle", "star", "hexagon", "cloud", "ellipse"].includes(o.board?.shape ?? "") ? `${(o.w ?? 220) * .23}px` : o.board?.shape === "text" ? "6px" : "18px"; const h = o.kind === "shape" && o.board?.shape !== "frame" ? Math.max(o.h ?? 60, canvasTextHeight(html, o.w ?? 220, o.board?.fontSize ?? 20, padding)) : o.h; return { ...o, text, ...(h !== undefined ? { h } : {}), board: { ...o.board, html } }; }))} onClose={() => { setEditing(null); viewport.current?.focus(); }} />}
      {!objects.length && !preview && <div className="canvas-empty"><span>YOUR NEXT BIG IDEA STARTS HERE</span><h2>A little space.<br />Endless possibilities.</h2><p>Write anywhere. Connect a thought.<br />Give your ideas room to grow.</p></div>}
      <div className="canvas-bottom-left canvas-overlay"><button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.current.undo.length} onClick={() => undo()}><TbArrowBackUp /></button><button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.current.redo.length} onClick={() => undo(false)}><TbArrowForwardUp /></button><span>{tool === "pen" ? "Draw freely · ink stays above shapes" : tool === "shape" ? `Click or drag to create ${shape}` : tool === "select" ? "Drag to move · double-click to write" : tool === "connector" ? "Drag between the connection points" : tool === "eraser" ? "Erase ink · shapes stay in place" : "Space + drag to explore"}</span></div>
      <div className="canvas-zoom canvas-overlay"><button aria-label="Toggle canvas grid" aria-pressed={grid} onClick={() => setGrid(v => !v)}><TbGridDots /></button><i /><button aria-label="Zoom out" onClick={() => setView(zoomAt(cameraRef.current, { x: size.w / 2, y: size.h / 2 }, .8))}><TbZoomOut /></button><button className="canvas-zoom-value" title="Reset to 100%" onClick={() => setView(zoomAt(cameraRef.current, { x: size.w / 2, y: size.h / 2 }, 1 / cameraRef.current.scale))}>{Math.round(camera.scale * 100)}%</button><button aria-label="Zoom in" onClick={() => setView(zoomAt(cameraRef.current, { x: size.w / 2, y: size.h / 2 }, 1.25))}><TbZoomIn /></button><button aria-label="Fit content" title="Fit content (1)" onClick={fit}><TbFocusCentered /></button></div>
      {help && <div className="canvas-help canvas-overlay"><header><h3>Find your flow</h3><button aria-label="Close navigation help" onClick={() => setHelp(false)}><TbX /></button></header>{[["Scroll / trackpad", "Pan in any direction"], ["Ctrl / ⌘ + scroll", "Zoom at your cursor"], ["Shift + scroll", "Pan horizontally"], ["Space + drag / middle mouse", "Move around"], ["V / P / C", "Select / pen / connect"], ["Shift + resize", "Keep proportions"], ["Alt + drag", "Move without snapping"], ["Double-click / Enter", "Edit selected text"], ["1 / 0", "Fit content / 100%"], ["Ctrl / ⌘ + D", "Duplicate selection"]].map(([key, value]) => <div key={key}><span>{value}</span><kbd>{key}</kbd></div>)}</div>}
    </div>{sidebar && <CanvasSidebar style={chosenStyle} selected={selectedObjects} onStyle={changeStyle} onCreate={chooseShape} onAction={action} onClose={() => setSidebar(false)} onEdit={() => primary && !primary.board?.locked && startEditing(primary.id)} />}</div>
  </div>;
}

