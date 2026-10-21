import { uid, type InkObject } from "./ink-model";
import type { CanvasStyle, ShapeKind, XY } from "./canvas-model";
export function makeCanvasObject(kind: ShapeKind, p: XY, style: CanvasStyle): InkObject {
  return { id: uid(), kind: "shape", points: [], color: style.textColor ?? "#203353", width: 2, opacity: 1, style: "pen", pressure: 0, order: Date.now(), x: p.x, y: p.y, w: kind === "frame" ? 560 : kind === "note" ? 300 : 220, h: kind === "frame" ? 360 : kind === "sticky" ? 200 : kind === "text" ? 60 : kind === "note" ? 240 : 140, text: "", board: { ...style, shape: kind, ...(kind === "sticky" ? { fill: "#fef3c7", border: "#ead89b", shadow: true, align: "left" } : kind === "note" ? { fill: "#ffffff", border: "#d6deea", shadow: true, align: "left" } : kind === "text" ? { fill: "transparent", borderWidth: 0, align: "left" } : kind === "frame" ? { fill: "transparent", border: "#94a3b8", dash: "dashed", align: "left" } : {}) } };
}
