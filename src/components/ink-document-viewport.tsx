"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { InkPage } from "@/lib/ink-model";

type DocumentView = { scale: number; zoom: (factor: number, x?: number, y?: number) => void; fit: (mode: "width" | "page") => void };
const DocumentViewContext = createContext<DocumentView | null>(null);
export const useDocumentView = () => useContext(DocumentViewContext);

/** One scroll surface and scale for every page, including pages mounted lazily. */
export default function InkDocumentViewport({ pages, reading, onScroll, children }: { pages: InkPage[]; reading: boolean; onScroll: (element: HTMLDivElement) => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const currentScale = useRef(1);
  const mode = useRef<"width" | "page" | "manual">("width");
  const anchor = useRef<{ x: number; y: number; left: number; top: number; ratio: number; page?: HTMLElement; pageX?: number; pageY?: number } | null>(null);
  const width = Math.max(1, ...pages.map(page => page.paper.width));
  const height = Math.max(1, ...pages.map(page => page.paper.height));
  const applyScale = (next: number, x?: number, y?: number) => {
    const element = root.current;
    if (!element) return;
    next = Math.max(.1, Math.min(6, next));
    const box = element.getBoundingClientRect();
    const ax = x === undefined ? element.clientWidth / 2 : x - box.left;
    const ay = y === undefined ? element.clientHeight / 2 : y - box.top;
    anchor.current = { x: ax, y: ay, left: element.scrollLeft, top: element.scrollTop, ratio: next / currentScale.current };
    const page = Array.from(element.querySelectorAll<HTMLElement>("[data-pdf-page-id]")).find(item => item.getBoundingClientRect().bottom > box.top + ay);
    if (page) {
      const bounds = page.getBoundingClientRect();
      Object.assign(anchor.current, { page, pageX: (box.left + ax - bounds.left) / bounds.width, pageY: (box.top + ay - bounds.top) / bounds.height });
    }
    currentScale.current = next;
    setScale(next);
  };
  const fit = (value: "width" | "page") => {
    mode.current = value;
    const element = root.current;
    if (element) applyScale(Math.min((element.clientWidth - 72) / width, value === "page" ? (element.clientHeight - 100) / height : Infinity));
  };
  const zoom = (factor: number, x?: number, y?: number) => { mode.current = "manual"; applyScale(currentScale.current * factor, x, y); };
  const latest = useRef({ zoom, fit });
  useLayoutEffect(() => { latest.current = { zoom, fit }; });
  useLayoutEffect(() => {
    const element = root.current, point = anchor.current;
    if (element && point) {
      if (point.page?.isConnected) {
        const box = element.getBoundingClientRect(), bounds = point.page.getBoundingClientRect();
        element.scrollLeft += bounds.left + bounds.width * point.pageX! - box.left - point.x;
        element.scrollTop += bounds.top + bounds.height * point.pageY! - box.top - point.y;
      } else {
        element.scrollLeft = (point.left + point.x) * point.ratio - point.x;
        element.scrollTop = (point.top + point.y) * point.ratio - point.y;
      }
      anchor.current = null;
    }
  }, [scale]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (mode.current !== "manual") latest.current.fit(mode.current); });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); latest.current.zoom(Math.exp(-event.deltaY * .005), event.clientX, event.clientY); }
      else if (event.shiftKey && !event.deltaX) { event.preventDefault(); element.scrollLeft += event.deltaY; }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, [width, height]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  return <DocumentViewContext.Provider value={{ scale, zoom, fit }}><div className="ink-document-viewer">
    {reading && <div className="ink-view-controls"><button onClick={() => zoom(.8)} aria-label="Zoom out">−</button><span>{Math.round(scale * 100)}%</span><button onClick={() => zoom(1.25)} aria-label="Zoom in">+</button><button onClick={() => fit("width")}>Fit width</button><button onClick={() => fit("page")}>Fit page</button></div>}
    <div ref={root} className="ink-pdf-scroll" tabIndex={0} aria-label={reading ? "PDF pages" : "Editing pages"} onScroll={event => onScroll(event.currentTarget)}
      onPointerDown={event => {
        if (!reading || (event.target as HTMLElement).closest("button") || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }}
      onPointerMove={event => {
        const previous = pointers.current.get(event.pointerId), element = root.current;
        if (!previous || !element) return;
        const before = [...pointers.current.values()];
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const after = [...pointers.current.values()];
        if (before.length === 2) {
          const distance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
          if (distance) zoom(Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y) / distance, (after[0].x + after[1].x) / 2, (after[0].y + after[1].y) / 2);
        }
        element.scrollLeft += (previous.x - event.clientX) / before.length;
        element.scrollTop += (previous.y - event.clientY) / before.length;
      }}
      onPointerUp={event => pointers.current.delete(event.pointerId)} onPointerCancel={event => pointers.current.delete(event.pointerId)} onLostPointerCapture={event => pointers.current.delete(event.pointerId)}>
      <div className="ink-document-pages" style={{ width: width * scale + 40 }}>{children}</div>
    </div>
  </div></DocumentViewContext.Provider>;
}
