"use client";
import { useTheme } from "@/lib/theme-context";
import { useState } from "react";
import dynamic from "next/dynamic";
const InfiniteCanvas = dynamic(() => import("@/components/infinite-canvas"), { ssr: false });
import { DEFAULT_STYLE } from "@/lib/canvas-model";
import { STARTER_PENS, type InkObject } from "@/lib/ink-model";
const base = { points: [], color: "#203353", width: 2, opacity: 1, style: "pen", pressure: 0 } as const;
const shape = (id: string, x: number, y: number, text: string, fill: string, extra = {}): InkObject => ({ ...base, points: [], id, kind: "shape", x, y, w: 240, h: (extra as { shape?: string }).shape === "sticky" ? 240 : 150, text, order: 1, board: { ...DEFAULT_STYLE, fill, ...extra } });
const SAMPLE: InkObject[] = [
  shape("idea", 100, 150, "A space for\nyour next big idea", "#e0e7ff", { border: "#a5b4e0", fontSize: 24, html: "<b>A space for your<br>next big idea</b>" }),
  shape("explore", 480, 80, "Explore possibilities", "#ccfbf1", { border: "#8bc6bd", shape: "pill", fontSize: 20 }),
  shape("plan", 480, 320, "Make a little plan", "#fef3c7", { border: "#e3c884", shape: "sticky", shadow: true, align: "left", html: "<b>Make a little plan</b><div><br></div><div>☐ Find the spark</div><div>☐ Connect the dots</div><div>☐ Try something new</div>" }),
  { ...base, points: [], id: "connection", kind: "connector", order: 2, text: "what if?", board: { from: { id: "idea", side: "right" }, to: { id: "explore", side: "left" }, route: "curve", border: "#9299c4", borderWidth: 2, fontSize: 14 } },
  { ...base, points: [], id: "connection2", kind: "connector", order: 2, board: { from: { id: "idea", side: "bottom" }, to: { id: "plan", side: "left" }, route: "curve", border: "#b6a77a", borderWidth: 2 } },
];
function CanvasLab() {
  const { toggleTheme } = useTheme();
  const [objects, setObjects] = useState<InkObject[]>(() => { if (typeof window === "undefined") return SAMPLE; try { return JSON.parse(localStorage.getItem("canvas-lab-objects") ?? "null") ?? SAMPLE; } catch { return SAMPLE; } });
  if (process.env.NODE_ENV !== "development") return <p>Not available</p>;
  return <main className="canvas-lab" style={{ padding: 18, background: "var(--background)", height: "100dvh" }}><style>{".canvas-lab .infinite-canvas{height:calc(100dvh - 70px);min-height:400px}"}</style><InfiniteCanvas objects={objects} onChange={next => { setObjects(next); localStorage.setItem("canvas-lab-objects", JSON.stringify(next)); }} pens={STARTER_PENS} storageKey="canvas-lab-camera" title="Room for ideas" /><div style={{ font: "11px system-ui", padding: "10px 2px", color: "#8490a2" }}><button onClick={toggleTheme}>Toggle theme</button> Local canvas interaction fixture · {objects.length} objects · <button onClick={() => { setObjects([]); localStorage.setItem("canvas-lab-objects", "[]"); }}>Start empty</button> <button onClick={() => { setObjects(SAMPLE); localStorage.setItem("canvas-lab-objects", JSON.stringify(SAMPLE)); }}>Restore sample</button></div></main>;
}

export default dynamic(() => Promise.resolve(CanvasLab), { ssr: false });
