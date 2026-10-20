"use client";

// Local browser harness: real canvas and document zoom, with no stored user data.
import { useEffect, useRef, useState } from "react";
import InkCanvas, { type InkCanvasApi } from "@/components/ink-canvas";
import InkDocumentViewport from "@/components/ink-document-viewport";
import { DEFAULT_PAPER, STARTER_PENS, type InkObject, type InkPage } from "@/lib/ink-model";
import "@/components/note-workspace.css";
import { bindInkTabScroll } from "@/lib/ink-scroll";

const pages: InkPage[] = [{ id: "performance", paper: DEFAULT_PAPER, order: 0, label: "Performance check", bookmark: false }];

export default function InkPerformance() {
  const api = useRef<InkCanvasApi>(null), root = useRef<HTMLDivElement>(null);
  const [objects, setObjects] = useState<InkObject[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState("Ready");
  const [pdf, setPdf] = useState(false);
  const [shared, setShared] = useState(true);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => { if (tabs.current) return bindInkTabScroll(tabs.current); }, []);
  if (process.env.NODE_ENV !== "development") return <p>Not available.</p>;
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const runScroll = async () => {
    const scroll = root.current?.querySelector<HTMLElement>(".ink-pdf-scroll");
    if (!scroll) return;
    scroll.scrollTop = 1000;
    await new Promise(resolve => setTimeout(resolve, 180));
    let changes = 0;
    const observer = new MutationObserver(records => { changes += records.length; });
    root.current!.querySelectorAll("canvas").forEach(canvas => observer.observe(canvas, { attributes: true, attributeFilter: ["width", "height", "style"] }));
    const before = scroll.scrollTop;
    for (let i = 0; i < 30; i++) { scroll.scrollTop += 2; await frame(); }
    observer.disconnect();
    setReport(JSON.stringify({ scrollPixels: scroll.scrollTop - before, scrollFrames: 30, rasterUpdates: changes }));
  };
  const run = async () => {
    const viewport = root.current!.querySelector<HTMLElement>(".ink-viewport")!;
    const canvases = [...viewport.querySelectorAll("canvas")];
    const before = canvases.map(canvas => `${canvas.width}x${canvas.height}`).join(",");
    let allocations = 0;
    const observer = new MutationObserver(records => { allocations += records.length; });
    canvases.forEach(canvas => observer.observe(canvas, { attributes: true, attributeFilter: ["width", "height"] }));
    api.current!.zoom(100);
    await frame();
    // Synthetic pen events exercise the production handlers. Browser pointer
    // capture requires physical contact, so only this isolated harness stubs it.
    const capture = viewport.setPointerCapture;
    viewport.setPointerCapture = () => {};
    const bounds = viewport.getBoundingClientRect();
    const x = Math.max(0, bounds.left) + 150, y = Math.max(100, bounds.top + 100);
    const event = (type: string, px: number, py: number) => viewport.dispatchEvent(new PointerEvent(type, { pointerId: 42, pointerType: "pen", clientX: px, clientY: py, pressure: .5, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
    event("pointerdown", x, y);
    const started = performance.now();
    const raw = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    for (let i = 1; i <= 600; i++) event(raw, x + i * .5, y + Math.sin(i / 15) * 30);
    const elapsed = performance.now() - started;
    event("pointerup", x + 300, y);
    viewport.setPointerCapture = capture;
    await frame();
    observer.disconnect();
    const after = canvases.map(canvas => `${canvas.width}x${canvas.height}`).join(",");
    setReport(JSON.stringify({ before, after, allocations, samples: 600, inputMs: Math.round(elapsed) }));
  };
  const canvas = <InkCanvas key={`${shared}-${pdf}`} ref={api} continuous objects={objects} paper={DEFAULT_PAPER} pen={STARTER_PENS[0]} tool="pen" shape="line" partialEraser={false} eraserSize={20} enhancer={false} touch="pan" selected={selected} onSelect={setSelected} onChange={setObjects} highlightBelow holdShapes={false} study={false} onText={() => {}} background={pdf ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='816' height='1056'%3E%3Crect width='816' height='1056' fill='white'/%3E%3Ctext x='80' y='150' font-size='24'%3EPDF background fixture%3C/text%3E%3C/svg%3E" : undefined} />;
  return <main className="ink-ui" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <div ref={tabs} className="ink-tabbar" aria-label="Scrolling test tabs" style={{ flex: "none", width: 500 }}>{Array.from({ length: 20 }, (_, index) => <button key={index}>Tab {index + 1}</button>)}</div>
    <div><button onClick={() => void run()}>Run zoom and ink check</button><button onClick={() => void runScroll()}>Run small scroll check</button><button onClick={() => { setObjects([]); setPdf(value => !value); }}>Toggle PDF background</button><button onClick={() => { setObjects([]); setShared(value => !value); }}>Toggle document viewport</button><span data-object-count>{objects.length} strokes, {objects.at(-1)?.points.length ?? 0} points</span><output>{report}</output></div>
    <div ref={root} style={{ flex: 1, minHeight: 0 }}>{shared ? <InkDocumentViewport pages={pages} reading={false} onScroll={() => {}}><section data-pdf-page-id="performance">{canvas}</section></InkDocumentViewport> : canvas}</div>
  </main>;
}
