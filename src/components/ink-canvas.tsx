"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { TbZoomIn, TbZoomOut } from "react-icons/tb";
import { Capacitor } from "@capacitor/core";
import { constrainInkView, fitInkView } from "@/lib/ink-viewport";
import { InkObject, Paper, Pen, Point, eraseObjects, enhancePoints, fountainPool, fountainWidths, smoothFountainWidth, spreadFountainPool, withinInkHold, lassoObjects, objectBounds, recognizeHeldShape, shapePoints, transformObjects, uid } from "@/lib/ink-model";
import { drawObject, drawObjects, drawPaper, drawSegment, loadInkImage } from "@/lib/ink-renderer";
import { snapPdfHighlight, type PdfTextLine } from "@/lib/pdf-highlight";

export type InkTool = "pen" | "eraser" | "lasso" | "pan" | "shape" | "cover" | "text";
export type InkCanvasApi = { fit: () => void; fitWidth: () => void; zoom: (factor: number) => void };
type Props = {
  objects: InkObject[]; paper: Paper; pen: Pen; tool: InkTool; shape: string;
  partialEraser: boolean; eraserSize: number; enhancer: boolean; touch: "pan" | "ignore" | "draw";
  selected: string[]; onSelect: (ids: string[]) => void; onChange: (objects: InkObject[]) => void;
  highlightBelow: boolean; holdShapes: boolean; study: boolean; background?: string;
  onText: (x: number, y: number) => void;
  rectangularLasso?: boolean;
  focusMode?: boolean;
  continuous?: boolean;
  pdfLines?: PdfTextLine[];
};

/** No React state, geometry scans, networking, or smoothing in the live ink path. */
const InkCanvas = forwardRef<InkCanvasApi, Props>(function InkCanvas(props, apiRef) {
  const viewportRef = useRef<HTMLDivElement>(null), pageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLCanvasElement>(null), settledRef = useRef<HTMLCanvasElement>(null), liveRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const view = useRef({ x: 20, y: 20, scale: 1 });
  const repaint = useRef<(force?: boolean) => void>(() => {});
  const [zoomLabel, setZoomLabel] = useState(100);
  const [zoomOpen, setZoomOpen] = useState(false);
  const gestureActive = useRef(false);
  const refreshResolution = useRef<() => void>(() => {});
  const fitMode = useRef<"auto" | "page" | "width" | "manual">("auto");
  const applyView = () => {
    const viewport = viewportRef.current;
    if (viewport && latest.current.continuous) {
      viewport.style.height = `${latest.current.paper.height * view.current.scale + 40}px`;
      view.current.y = 20;
      view.current.x = Math.min(20, (viewport.clientWidth - latest.current.paper.width * view.current.scale) / 2);
    } else if (viewport) view.current = constrainInkView(view.current, latest.current.paper, { width: viewport.clientWidth, height: viewport.clientHeight });
    if (pageRef.current) pageRef.current.style.transform = `translate(${view.current.x}px, ${view.current.y}px) scale(${view.current.scale})`;
    refreshResolution.current();
  };
  const refit = () => {
    const viewport = viewportRef.current; if (!viewport || !viewport.clientWidth || !viewport.clientHeight) return;
    if (latest.current.continuous && fitMode.current !== "manual") {
      view.current = { x: 20, y: 20, scale: Math.max(.1, (viewport.clientWidth - 40) / latest.current.paper.width) };
      applyView(); setZoomLabel(Math.round(view.current.scale * 100)); return;
    }
    if (fitMode.current === "manual") { applyView(); return; }
    const mode = fitMode.current === "auto" ? (window.innerHeight > window.innerWidth ? "page" : "width") : fitMode.current;
    view.current = fitInkView(latest.current.paper, { width: viewport.clientWidth, height: viewport.clientHeight }, mode);
    applyView(); setZoomLabel(Math.round(view.current.scale * 100));
  };
  const fit = () => { fitMode.current = "page"; refit(); };
  const zoom = (factor: number) => {
    fitMode.current = "manual";
    const box = viewportRef.current?.getBoundingClientRect(); if (!box) return;
    const old = view.current, scale = Math.max(.1, Math.min(6, old.scale * factor));
    view.current = { scale, x: box.width / 2 - (box.width / 2 - old.x) * scale / old.scale, y: box.height / 2 - (box.height / 2 - old.y) * scale / old.scale };
    applyView(); setZoomLabel(Math.round(scale * 100));
  };
  const fitWidth = () => { fitMode.current = "width"; refit(); };
  useImperativeHandle(apiRef, () => ({ fit, fitWidth, zoom }));

  useEffect(() => {
    const viewport = viewportRef.current, paper = paperRef.current, settled = settledRef.current, live = liveRef.current;
    if (!viewport || !paper || !settled || !live) return;
    let disposed = false;
    const isMounted = () => !disposed && viewportRef.current === viewport && viewport.isConnected;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [paper, settled, live]) {
      canvas.width = Math.round(props.paper.width * dpr); canvas.height = Math.round(props.paper.height * dpr);
      // Desktop GPU overlays can render stacked desynchronized canvases as black.
      // Only native live ink needs that path; paper and saved ink use the compositor.
      canvas.getContext("2d", { alpha: canvas !== paper, desynchronized: canvas === live && Capacitor.isNativePlatform() })!.scale(dpr, dpr);
    }
    drawPaper(paper.getContext("2d")!, props.paper);
    let resolutionTimer: ReturnType<typeof setTimeout>;
    const resizeForZoom = () => {
      if (!isMounted()) return;
      if (gestureActive.current) { resolutionTimer = setTimeout(resizeForZoom, 100); return; }
      const { width, height } = latest.current.paper;
      // Re-rasterize vector ink at its displayed size, within a per-layer memory budget.
      const ratio = Math.min((window.devicePixelRatio || 1) * Math.max(1, view.current.scale), Math.sqrt(32_000_000 / (width * height)), 16384 / Math.max(width, height));
      const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));
      if (settled.width === pixelWidth && settled.height === pixelHeight) return;
      for (const canvas of [paper, settled, live]) {
        canvas.width = pixelWidth; canvas.height = pixelHeight;
        canvas.getContext("2d")!.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      }
      drawPaper(paper.getContext("2d")!, latest.current.paper);
      repaint.current(true);
    };
    refreshResolution.current = () => { clearTimeout(resolutionTimer); if (isMounted()) resolutionTimer = setTimeout(resizeForZoom, 100); };
    repaint.current(true); refit();
    let lastWidth = viewport.clientWidth, lastHeight = viewport.clientHeight;
    let portrait = window.innerHeight > window.innerWidth;
    const orientationResize = () => {
      if (!isMounted()) return;
      const nextPortrait = window.innerHeight > window.innerWidth;
      if (nextPortrait !== portrait) { portrait = nextPortrait; fitMode.current = "auto"; refit(); }
    };
    window.addEventListener("resize", orientationResize);
    const observer = new ResizeObserver(() => {
      if (!isMounted()) return;
      orientationResize();
      const width = viewport.clientWidth, height = viewport.clientHeight;
      if (width > 0 && height > 0 && (Math.abs(width - lastWidth) > 1 || Math.abs(height - lastHeight) > 1)) { lastWidth = width; lastHeight = height; refit(); }
    });
    observer.observe(viewport);
    return () => { disposed = true; observer.disconnect(); window.removeEventListener("resize", orientationResize); clearTimeout(resolutionTimer); refreshResolution.current = () => {}; };
    // Resizing a page resets fit; object edits must never clear the live canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.paper.width, props.paper.height]);
  useEffect(() => { const ctx = paperRef.current?.getContext("2d"); if (ctx) drawPaper(ctx, props.paper); }, [props.paper]);

  useEffect(() => {
    const viewport = viewportRef.current!, live = liveRef.current!, settled = settledRef.current!;
    // Context attributes are established once by the sizing effect above.
    const liveCtx = live.getContext("2d")!, ctx = settled.getContext("2d")!;
    let active: number | null = null, stroke: InkObject | null = null, polygon: Point[] = [], start: Point | null = null, previous: Point | null = null;
    let working = latest.current.objects, initial = working, moving = false, resizing = false, erasing = false, pointerIsPen = false, holdTimer: ReturnType<typeof setInterval> | undefined;
    let movingIds: string[] = [];
    let rotating = false;
    let rect = viewport.getBoundingClientRect(), lastPenTime = -Infinity, held = false, heldKind = "line";
    let holdAnchor: Point | null = null, holdSince = 0, holdAttempted = false;
    const touches = new Map<number, { x: number; y: number }>();
    const rawInput = "onpointerrawupdate" in window;
    const revealed = new Set<string>();
    let wasStudying = false;
    let painted: InkObject[] = [], paintedSelection = "", paintedBelow = true, paintedStudy = false, paintedWidth = 0;
    let navigation: { x: number; y: number; distance: number; view: typeof view.current } | null = null;
    const clear = () => liveCtx.clearRect(0, 0, latest.current.paper.width, latest.current.paper.height);
    const paint = (objects = latest.current.objects, selection = latest.current.selected) => {
      if (latest.current.study && !wasStudying) revealed.clear();
      wasStudying = latest.current.study;
      const selectionKey = selection.join(",");
      const canAppend = paintedWidth === settled.width && !selectionKey && !paintedSelection && !latest.current.study && !paintedStudy && latest.current.highlightBelow === paintedBelow
        && objects.length >= painted.length && painted.every((o, i) => objects[i] === o)
        && !painted.some(o => o.kind === "cover" || o.kind === "image")
        && objects.slice(painted.length).every(o => o.kind !== "image" && !(latest.current.highlightBelow && o.style === "highlighter"));
      if (canAppend) drawObjects(ctx, objects.slice(painted.length), latest.current.highlightBelow);
      else { ctx.clearRect(0, 0, latest.current.paper.width, latest.current.paper.height); drawObjects(ctx, objects, latest.current.highlightBelow, latest.current.study, revealed); }
      painted = [...objects]; paintedSelection = selectionKey; paintedBelow = latest.current.highlightBelow; paintedStudy = latest.current.study; paintedWidth = settled.width;
      if (!latest.current.study) {
        const b = objectBounds(objects.filter(o => selection.includes(o.id)));
        if (b) { ctx.save(); ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 1.5 / view.current.scale; ctx.setLineDash([6 / view.current.scale, 4 / view.current.scale]); ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.setLineDash([]); ctx.fillStyle = "#6366f1"; ctx.fillRect(b.x + b.w - 5, b.y + b.h - 5, 10, 10);
          if (latest.current.tool === "lasso" || (latest.current.tool === "pan" && objects.some(o => o.kind === "text" && selection.includes(o.id)))) {
            const radius = 8 / view.current.scale;
            ctx.beginPath(); ctx.arc(b.x + b.w, b.y, radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "white"; ctx.beginPath(); ctx.arc(b.x + b.w, b.y, radius * .5, -.7, 3.8); ctx.stroke();
          }
          ctx.restore(); }
      }
    };
    repaint.current = (force = false) => { if (force) paintedWidth = 0; if (!gestureActive.current) paint(); };
    const position = (e: PointerEvent): Point => ({ x: Math.max(0, Math.min(latest.current.paper.width, (e.clientX - rect.left - view.current.x) / view.current.scale)), y: Math.max(0, Math.min(latest.current.paper.height, (e.clientY - rect.top - view.current.y) / view.current.scale)), p: e.pointerType === "pen" ? e.pressure || .5 : .5, t: e.timeStamp });
    const navStart = () => { const [a, b] = [...touches.values()]; if (!a) { navigation = null; return; } navigation = { x: b ? (a.x + b.x) / 2 : a.x, y: b ? (a.y + b.y) / 2 : a.y, distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, view: { ...view.current } }; };
    const end = (e: PointerEvent) => {
      if (touches.delete(e.pointerId)) {
        if (e.pointerType === "pen") { lastPenTime = performance.now(); pointerIsPen = false; }
        navStart(); setZoomLabel(Math.round(view.current.scale * 100)); return;
      }
      if (active !== e.pointerId) return;
      clearInterval(holdTimer);
      const p = position(e), canceled = e.type === "pointercancel" || e.type === "lostpointercapture";
      const options = latest.current;
      if (stroke) {
        if (!canceled && !held && options.tool !== "shape" && options.tool !== "cover") {
          const last = stroke.points.at(-1)!; if (Math.hypot(last.x - p.x, last.y - p.y) > .1) { if (stroke.style === "fountain") p.pool = smoothFountainWidth(stroke, last, p, options.enhancer ? options.pen.smoothing : 0) / stroke.width; stroke.points.push(p); }
        }
        if (options.tool === "cover" && start) { stroke = { ...stroke, kind: "cover", points: [], x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.max(24, Math.abs(p.x - start.x)), h: Math.max(24, Math.abs(p.y - start.y)), color: "#6366f1", opacity: 1 }; }
        // Live ink stays visible while only this stroke is enhanced. Append the
        // final stroke once, without repainting all earlier handwriting.
        const snapped = !canceled && options.tool === "pen" ? snapPdfHighlight(stroke, options.pdfLines ?? []) : stroke;
        const finalStroke = snapped !== stroke ? snapped : options.enhancer && options.tool === "pen" && !held ? { ...stroke, points: enhancePoints(stroke.points, options.pen.smoothing) } : stroke;
        working = [...latest.current.objects, finalStroke]; paint(working, []); clear();
        active = null; gestureActive.current = false;
        options.onChange(working); options.onSelect([]);
      } else if (polygon.length >= 3) {
        const result = lassoObjects(latest.current.objects, polygon); options.onChange(result.objects); options.onSelect(result.selected); paint(result.objects, result.selected);
      } else if (moving || erasing) { options.onChange(working); }
      active = null; stroke = null; polygon = []; moving = false; resizing = false; erasing = false; start = null; gestureActive.current = false; clear();
      if (pointerIsPen) lastPenTime = performance.now(); pointerIsPen = false;
    };
    const trackHold = (point: Point) => {
      if (!holdAnchor || !withinInkHold(holdAnchor, point, view.current.scale, pointerIsPen)) {
        holdAnchor = point; holdSince = performance.now(); holdAttempted = false;
      }
    };
    const tickHold = () => {
      if (!stroke || held || active === null || latest.current.tool !== "pen" || !holdAnchor) return;
      const elapsed = performance.now() - holdSince;
      if (stroke.style === "fountain") {
        const point = holdAnchor, widths = fountainWidths(stroke);
        const pool = (widths.min + (widths.max - widths.min) * (fountainPool(elapsed) - 1) / 2) / stroke.width;
        if (pool > (point.pool ?? 1)) {
          spreadFountainPool(stroke.points, point, pool, stroke.width, latest.current.enhancer ? latest.current.pen.smoothing : 0);
          clear(); drawObject(liveCtx, { ...stroke, opacity: 1 });
        }
      }
      if (latest.current.holdShapes && !holdAttempted && elapsed >= 550) {
        holdAttempted = true;
        // Preserve the original gesture for text matching when the pen lifts.
        if (snapPdfHighlight(stroke, latest.current.pdfLines ?? []) !== stroke) return;
        const shape = recognizeHeldShape(stroke.points);
        if (!shape) return;
        held = true; heldKind = shape.kind; stroke.points = shape.points;
        clear(); drawObject(liveCtx, { ...stroke, opacity: 1 });
      }
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".ink-zoom-controls")) return;
      setZoomOpen(false);
      if (e.button !== 0 && e.pointerType !== "pen") return;
      const options = latest.current; rect = viewport.getBoundingClientRect();
      viewport.closest<HTMLElement>(".ink-page-editor")?.focus({ preventScroll: true });
      if (e.pointerType === "touch" && (pointerIsPen || performance.now() - lastPenTime < 350 || e.width > 55 || e.height > 55)) return;
      if (e.pointerType === "touch" && options.touch === "draw" && active !== null && !pointerIsPen) {
        const last = stroke?.points.at(-1) ?? previous ?? start;
        if (last) touches.set(active, { x: rect.left + view.current.x + last.x * view.current.scale, y: rect.top + view.current.y + last.y * view.current.scale });
        clearInterval(holdTimer); active = null; stroke = null; polygon = []; moving = false; erasing = false; gestureActive.current = false; clear(); paint();
      }
      if (e.pointerType === "touch" && (options.tool === "pan" || options.touch !== "draw" || touches.size > 0)) {
        if (pointerIsPen || performance.now() - lastPenTime < 350 || e.width > 55 || e.height > 55) return;
        if (options.tool !== "pan" && options.touch === "ignore" && touches.size === 0) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); viewport.setPointerCapture(e.pointerId); return; }
        e.preventDefault(); touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); viewport.setPointerCapture(e.pointerId); navStart(); return;
      }
      if (active !== null) return;
      const rawX = (e.clientX - rect.left - view.current.x) / view.current.scale, rawY = (e.clientY - rect.top - view.current.y) / view.current.scale;
      if (options.tool !== "pan" && (rawX < 0 || rawY < 0 || rawX > options.paper.width || rawY > options.paper.height)) return;
      e.preventDefault(); viewport.setPointerCapture(e.pointerId); active = e.pointerId; gestureActive.current = true; pointerIsPen = e.pointerType === "pen";
      if (cursorRef.current) cursorRef.current.style.display = "none";
      if (pointerIsPen) { touches.clear(); navigation = null; lastPenTime = performance.now(); }
      holdAnchor = null; held = false; rotating = false; start = position(e); previous = start; working = latest.current.objects; initial = working;
      if (options.study) { const cover = [...working].reverse().find(o => o.kind === "cover" && start!.x >= (o.x ?? 0) && start!.x <= (o.x ?? 0) + (o.w ?? 0) && start!.y >= (o.y ?? 0) && start!.y <= (o.y ?? 0) + (o.h ?? 0)); if (cover) { if (revealed.has(cover.id)) revealed.delete(cover.id); else revealed.add(cover.id); paint(); } return; }
      if (options.tool === "pan") {
        const selectedText = working.filter(o => o.kind === "text" && options.selected.includes(o.id));
        const bounds = objectBounds(selectedText);
        if (bounds && Math.hypot(start.x - bounds.x - bounds.w, start.y - bounds.y) < 16 / view.current.scale) {
          movingIds = selectedText.map(o => o.id); moving = true; rotating = true; resizing = false; return;
        }
        if (bounds && Math.hypot(start.x - bounds.x - bounds.w, start.y - bounds.y - bounds.h) < 22 / view.current.scale) {
          movingIds = selectedText.map(o => o.id); moving = true; resizing = true; return;
        }
        const hit = [...working].reverse().find(o => {
          if (o.kind !== "text") return false;
          const cx = (o.x ?? 0) + (o.w ?? 0) / 2, cy = (o.y ?? 0) + (o.h ?? 0) / 2;
          const angle = -(o.rotation ?? 0) * Math.PI / 180, dx = start!.x - cx, dy = start!.y - cy;
          return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= (o.w ?? 0) / 2
            && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= (o.h ?? 0) / 2;
        });
        if (hit) { movingIds = [hit.id]; moving = true; resizing = false; options.onSelect(movingIds); paint(working, movingIds); return; }
        options.onSelect([]); paint(working, []);
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); active = null; gestureActive.current = false; navStart(); return;
      }
      if (options.tool === "text") { options.onText(start.x, start.y); return; }
      if (options.tool === "eraser" || (e.pointerType === "pen" && (e.buttons & 32 || e.buttons & 2))) { erasing = true; working = eraseObjects(working, start, start, options.eraserSize / 2, options.partialEraser); paint(working); return; }
      if (options.tool === "lasso") {
        movingIds = [...options.selected];
        const bounds = objectBounds(working.filter(o => options.selected.includes(o.id)));
        if (bounds && Math.hypot(start.x - bounds.x - bounds.w, start.y - bounds.y) < 16 / view.current.scale) { moving = true; rotating = true; resizing = false; return; }
        if (bounds && start.x >= bounds.x - 10 && start.x <= bounds.x + bounds.w + 10 && start.y >= bounds.y - 10 && start.y <= bounds.y + bounds.h + 10) { moving = true; resizing = Math.hypot(start.x - bounds.x - bounds.w, start.y - bounds.y - bounds.h) < 22 / view.current.scale; }
        else { polygon = [start]; options.onSelect([]); }
        return;
      }
      const pen = options.pen;
      const widths = fountainWidths(pen);
      if (pen.style === "fountain") start.pool = widths.min / pen.width;
      stroke = { id: uid(), kind: "stroke", points: [start], color: pen.color, width: pen.width, ...(pen.style === "fountain" ? { minWidth: widths.min, maxWidth: widths.max } : {}), opacity: pen.opacity, style: pen.style, pressure: pen.pressure, order: Date.now() };
      trackHold(start); holdTimer = setInterval(tickHold, 40);
      live.style.opacity = String(stroke.opacity); drawObject(liveCtx, { ...stroke, opacity: 1 });
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "pen" && active === null && cursorRef.current) {
        const size = Math.max(3, (latest.current.tool === "eraser" || (e.buttons & 32 || e.buttons & 2) ? latest.current.eraserSize : latest.current.pen.width) * view.current.scale);
        const bounds = viewport.getBoundingClientRect(), cursor = cursorRef.current;
        cursor.style.display = "block"; cursor.style.width = `${size}px`; cursor.style.height = `${size}px`; cursor.style.transform = `translate(${e.clientX - bounds.left - size / 2}px, ${e.clientY - bounds.top - size / 2}px)`;
      }
      if (touches.has(e.pointerId)) {
        const previousTouch = touches.get(e.pointerId)!;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!navigation || (latest.current.tool !== "pan" && latest.current.touch === "ignore" && touches.size < 2 && e.pointerType === "touch")) return;
        e.preventDefault();
        if (latest.current.continuous && touches.size === 1) {
          const scroll = viewport.closest<HTMLElement>(".ink-pdf-scroll");
          if (scroll) {
            scroll.scrollLeft += previousTouch.x - e.clientX;
            scroll.scrollTop += previousTouch.y - e.clientY;
          }
          return;
        }
        const [a, b] = [...touches.values()], x = b ? (a.x + b.x) / 2 : a.x, y = b ? (a.y + b.y) / 2 : a.y;
        const scale = b && navigation.distance ? Math.max(.1, Math.min(6, navigation.view.scale * Math.hypot(a.x - b.x, a.y - b.y) / navigation.distance)) : navigation.view.scale;
        if (b && navigation.distance) fitMode.current = "manual";
        view.current = { scale, x: x - rect.left - (navigation.x - rect.left - navigation.view.x) * scale / navigation.view.scale, y: y - rect.top - (navigation.y - rect.top - navigation.view.y) * scale / navigation.view.scale }; applyView(); return;
      }
      if (active !== e.pointerId || !start) return;
      if (rawInput && pointerIsPen && e.type === "pointermove") { e.preventDefault(); return; }
      e.preventDefault(); const options = latest.current, p = position(e);
      if (erasing) { working = eraseObjects(working, previous!, p, options.eraserSize / 2, options.partialEraser); previous = p; paint(working); return; }
      if (moving) {
        const picked = initial.filter(o => movingIds.includes(o.id)), bounds = objectBounds(picked)!;
        const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
        const degrees = rotating ? (Math.atan2(p.y - cy, p.x - cx) - Math.atan2(start.y - cy, start.x - cx)) * 180 / Math.PI : 0;
        const transformed = transformObjects(picked, resizing || rotating ? 0 : p.x - start.x, resizing || rotating ? 0 : p.y - start.y, resizing ? Math.max(.1, Math.min(8, 1 + (p.x - start.x) / bounds.w)) : 1, degrees);
        const map = new Map(transformed.map(o => [o.id, o])); working = initial.map(o => map.get(o.id) ?? o); paint(working, movingIds); return;
      }
      if (polygon.length) { if (options.rectangularLasso) polygon = shapePoints("rectangle", start, p); else polygon.push(p); clear(); live.style.opacity = "1"; liveCtx.strokeStyle = "#6366f1"; liveCtx.lineWidth = 1.5 / view.current.scale; liveCtx.setLineDash([5, 4]); liveCtx.beginPath(); polygon.forEach((v, i) => i ? liveCtx.lineTo(v.x, v.y) : liveCtx.moveTo(v.x, v.y)); liveCtx.closePath(); liveCtx.stroke(); liveCtx.setLineDash([]); return; }
      if (!stroke) return;
      if (held && (heldKind !== "line" || (holdAnchor && withinInkHold(holdAnchor, p, view.current.scale, pointerIsPen)))) return;
      if (options.tool === "shape" || options.tool === "cover" || held) { stroke.points = shapePoints(options.tool === "shape" ? options.shape : options.tool === "cover" ? "rectangle" : "line", start, p); clear(); drawObject(liveCtx, { ...stroke, opacity: 1 }); return; }
      const samples = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const sample of samples.length ? samples : [e]) {
        const point = position(sample), last = stroke.points.at(-1)!;
        trackHold(point);
        if (Math.hypot(point.x - last.x, point.y - last.y) < .12) { if (holdAnchor === point) holdAnchor = last; continue; }
        if (stroke.style === "fountain") point.pool = smoothFountainWidth(stroke, last, point, options.enhancer ? options.pen.smoothing : 0) / stroke.width;
        stroke.points.push(point); drawSegment(liveCtx, stroke, last, point);
      }
      // Bound a single Firestore object without dropping a long continuous stroke.
      if (stroke.points.length >= 4000) { const part = stroke; options.onChange([...latest.current.objects, part]); drawObject(ctx, part); clear(); stroke = { ...part, id: uid(), points: [{ ...part.points.at(-1)! }], order: Date.now() }; holdAnchor = null; trackHold(stroke.points[0]); }

    };
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(Math.exp(-e.deltaY * .005)); } else if (!latest.current.continuous) { e.preventDefault(); view.current.x -= e.deltaX; view.current.y -= e.deltaY; applyView(); } };
    const rawMove = (event: Event) => { const pointer = event as PointerEvent; if (pointer.pointerType === "pen") move(pointer); };
    const leave = () => { if (cursorRef.current) cursorRef.current.style.display = "none"; };
    viewport.addEventListener("pointerleave", leave);
    if (rawInput) viewport.addEventListener("pointerrawupdate", rawMove);
    viewport.addEventListener("pointerdown", down); viewport.addEventListener("pointermove", move); viewport.addEventListener("pointerup", end); viewport.addEventListener("pointercancel", end); viewport.addEventListener("lostpointercapture", end); viewport.addEventListener("wheel", wheel, { passive: false });
    paint();
    return () => { clearInterval(holdTimer); viewport.removeEventListener("pointerleave", leave); viewport.removeEventListener("pointerrawupdate", rawMove); viewport.removeEventListener("pointerdown", down); viewport.removeEventListener("pointermove", move); viewport.removeEventListener("pointerup", end); viewport.removeEventListener("pointercancel", end); viewport.removeEventListener("lostpointercapture", end); viewport.removeEventListener("wheel", wheel); };
    // Native handlers read current values through latest; never rebind mid-stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { repaint.current(); let disposed = false; Promise.all(props.objects.filter(o => o.url).map(o => loadInkImage(o.url!).catch(() => null))).then(() => { if (!disposed) repaint.current(); }); return () => { disposed = true; }; }, [props.objects, props.selected, props.highlightBelow, props.study]);

  // Browser panning applies to pens too; keep it disabled before contact and
  // route finger navigation through pointer handlers so palms cannot scroll ink.
  return <div className="ink-viewport" ref={viewportRef} style={{ touchAction: "none" }} aria-label={props.continuous ? "Writing page. Use a stylus to write and scroll to other pages." : "Writing page. Use a stylus to write and two fingers to pan and zoom."} onContextMenu={e => e.preventDefault()}>
    <div className="ink-page" ref={pageRef} style={{ width: props.paper.width, height: props.paper.height, backgroundColor: props.paper.color, colorScheme: "only light" }}>
      <canvas ref={paperRef} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {props.background && <img className="ink-pdf-background" src={props.background} alt="PDF page" draggable={false} />}
      <canvas ref={settledRef} /><canvas ref={liveRef} className="ink-live" />
    </div>
    <div className="ink-hover-cursor" ref={cursorRef} />
    {props.focusMode ? <div className="ink-zoom-controls" onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") setZoomOpen(false); }}>
      {zoomOpen && <div className="ink-zoom-drawer" role="group" aria-label="Zoom controls">
        <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}><TbZoomIn className="ink-tool-icon" aria-hidden="true" /></button>
        <button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(.8)}><TbZoomOut className="ink-tool-icon" aria-hidden="true" /></button>
      </div>}
      <button className="ink-zoom-trigger" aria-label={`Zoom ${zoomLabel}%`} aria-expanded={zoomOpen} onClick={() => setZoomOpen(open => !open)}>{zoomLabel}%</button>
    </div> : <span className="ink-zoom-readout">{zoomLabel}%</span>}
  </div>;
});
export default InkCanvas;
