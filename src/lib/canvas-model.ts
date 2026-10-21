import type { InkObject } from "./ink-model";

export type XY = { x: number; y: number };
export type Camera = XY & { scale: number };
export type ShapeKind = "rectangle" | "rounded" | "ellipse" | "diamond" | "triangle" | "hexagon" | "pill" | "star" | "arrow" | "callout" | "cloud" | "sticky" | "note" | "text" | "frame";
export type Anchor = { id: string; side: "top" | "right" | "bottom" | "left" };
export type CanvasStyle = {
  shape?: ShapeKind; fill?: string; fillOpacity?: number; border?: string; borderWidth?: number;
  dash?: "solid" | "dashed" | "dotted"; radius?: number; shadow?: boolean;
  textColor?: string; fontSize?: number; align?: "left" | "center" | "right"; html?: string;
  textOutline?: boolean; locked?: boolean; from?: Anchor; to?: Anchor;
  start?: XY; end?: XY; route?: "straight" | "curve" | "elbow"; arrowStart?: boolean; arrowEnd?: boolean;
};
export const SHAPES: { kind: ShapeKind; label: string; category: "Shapes" | "Notes" | "Borders" }[] = [
  { kind: "rounded", label: "Rounded", category: "Shapes" }, { kind: "rectangle", label: "Rectangle", category: "Shapes" },
  { kind: "ellipse", label: "Ellipse", category: "Shapes" }, { kind: "diamond", label: "Diamond", category: "Shapes" },
  { kind: "triangle", label: "Triangle", category: "Shapes" }, { kind: "hexagon", label: "Hexagon", category: "Shapes" },
  { kind: "pill", label: "Pill", category: "Shapes" }, { kind: "star", label: "Star", category: "Shapes" },
  { kind: "arrow", label: "Block arrow", category: "Shapes" }, { kind: "callout", label: "Callout", category: "Shapes" },
  { kind: "cloud", label: "Cloud", category: "Shapes" }, { kind: "sticky", label: "Sticky note", category: "Notes" },
  { kind: "note", label: "Note card", category: "Notes" }, { kind: "text", label: "Free text", category: "Notes" },
  { kind: "frame", label: "Section border", category: "Borders" },
];
export const PALETTE = ["#dbeafe", "#e0e7ff", "#ede9fe", "#fce7f3", "#fee2e2", "#ffedd5", "#fef3c7", "#dcfce7", "#ccfbf1", "#ffffff", "#334155", "#2563eb"];
export const DEFAULT_STYLE: CanvasStyle = { shape: "rounded", fill: "#dbeafe", fillOpacity: 1, border: "#93b4e4", borderWidth: 1.5, radius: 18, dash: "solid", textColor: "#203353", fontSize: 20, align: "center", shadow: false };
export function zoomAt(camera: Camera, point: XY, factor: number): Camera {
  const scale = Math.max(.05, Math.min(8, camera.scale * factor));
  return { scale, x: point.x - (point.x - camera.x) * scale / camera.scale, y: point.y - (point.y - camera.y) * scale / camera.scale };
}
export function worldPoint(camera: Camera, point: XY): XY { return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale }; }
export function shapePath(kind: ShapeKind, w: number, h: number, radius = 18): string {
  if (kind === "ellipse") return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A ${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
  if (kind === "diamond") return `M ${w / 2} 0 L ${w} ${h / 2} ${w / 2} ${h} 0 ${h / 2} Z`;
  if (kind === "triangle") return `M ${w / 2} 0 L ${w} ${h} 0 ${h} Z`;
  if (kind === "hexagon") return `M ${w * .22} 0 L ${w * .78} 0 ${w} ${h / 2} ${w * .78} ${h} ${w * .22} ${h} 0 ${h / 2} Z`;
  if (kind === "arrow") return `M 0 ${h * .24} H ${w * .64} V 0 L ${w} ${h / 2} ${w * .64} ${h} V ${h * .76} H 0 Z`;
  if (kind === "star") return Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? .23 : .5; return `${i ? "L" : "M"} ${w / 2 + Math.cos(a) * w * r} ${h / 2 + Math.sin(a) * h * r}`; }).join(" ") + " Z";
  if (kind === "callout") return `M 14 0 H ${w - 14} Q ${w} 0 ${w} 14 V ${h * .75 - 14} Q ${w} ${h * .75} ${w - 14} ${h * .75} H ${w * .4} L ${w * .2} ${h} V ${h * .75} H 14 Q 0 ${h * .75} 0 ${h * .75 - 14} V 14 Q 0 0 14 0 Z`;
  if (kind === "cloud") return `M ${w * .2} ${h * .85} C ${-w * .08} ${h * .85} ${-w * .04} ${h * .3} ${w * .18} ${h * .3} C ${w * .12} 0 ${w * .5} ${-h * .05} ${w * .57} ${h * .17} C ${w * .86} ${-h * .06} ${w * 1.06} ${h * .3} ${w * .88} ${h * .44} C ${w * 1.13} ${h * .7} ${w * .86} ${h * 1.03} ${w * .65} ${h * .86} C ${w * .53} ${h * 1.08} ${w * .27} ${h * 1.02} ${w * .2} ${h * .85} Z`;
  const r = Math.min(w / 2, h / 2, kind === "pill" ? h / 2 : kind === "rectangle" || kind === "sticky" ? 3 : radius);
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}
const strokeBounds = new WeakMap<InkObject, { x: number; y: number; w: number; h: number }>();
export function bounds(o: InkObject) {
  if (o.kind === "stroke" && o.points.length) {
    const cached = strokeBounds.get(o); if (cached) return cached;
    let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
    for (const p of o.points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
    const result = { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) }; strokeBounds.set(o, result); return result;
  }
  return { x: o.x ?? 0, y: o.y ?? 0, w: o.w ?? 1, h: o.h ?? 1 };
}
export function anchorPoint(o: InkObject, side: Anchor["side"]): XY {
  const b = bounds(o);
  return { x: b.x + (side === "left" ? 0 : side === "right" ? b.w : b.w / 2), y: b.y + (side === "top" ? 0 : side === "bottom" ? b.h : b.h / 2) };
}
export function snapAnchor(objects: InkObject[], point: XY, scale: number, exclude?: string): { anchor: Anchor; point: XY } | null {
  let nearest: { anchor: Anchor; point: XY } | null = null, distance = 22 / scale;
  for (const o of objects) {
    if (o.id === exclude || o.kind === "stroke" || o.kind === "connector" || o.board?.shape === "frame") continue;
    const b = bounds(o), inside = point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const p = anchorPoint(o, side), d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < distance || (inside && !nearest)) { distance = d; nearest = { anchor: { id: o.id, side }, point: p }; }
    }
  }
  return nearest;
}
export function connection(o: InkObject, objects: InkObject[] | Map<string, InkObject>) {
  const s = o.board ?? {}, map = objects instanceof Map ? objects : new Map(objects.map(v => [v.id, v]));
  const a = s.from && map.get(s.from.id), b = s.to && map.get(s.to.id);
  const start = a && s.from ? anchorPoint(a, s.from.side) : s.start ?? { x: o.x ?? 0, y: o.y ?? 0 };
  const end = b && s.to ? anchorPoint(b, s.to.side) : s.end ?? { x: (o.x ?? 0) + (o.w ?? 100), y: (o.y ?? 0) + (o.h ?? 0) };
  const horizontal = s.from ? ["left", "right"].includes(s.from.side) : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const outward = (p: XY, side: Anchor["side"] | undefined, fallback: XY): XY => { const d = Math.max(40, Math.min(160, Math.hypot(end.x - start.x, end.y - start.y) * .4)); return side ? { x: p.x + (side === "right" ? d : side === "left" ? -d : 0), y: p.y + (side === "bottom" ? d : side === "top" ? -d : 0) } : fallback; };
  const c1 = outward(start, s.from?.side, horizontal ? { x: (start.x + end.x) / 2, y: start.y } : { x: start.x, y: (start.y + end.y) / 2 });
  const c2 = outward(end, s.to?.side, horizontal ? { x: (start.x + end.x) / 2, y: end.y } : { x: end.x, y: (start.y + end.y) / 2 });
  let path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  let label = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  if (s.route === "curve") { path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`; label = { x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8, y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8 }; }
  if (s.route === "elbow") { const middle = horizontal ? (c1.x + c2.x) / 2 : (c1.y + c2.y) / 2; path = horizontal ? `M ${start.x} ${start.y} L ${c1.x} ${start.y} ${middle} ${start.y} ${middle} ${end.y} ${c2.x} ${end.y} ${end.x} ${end.y}` : `M ${start.x} ${start.y} L ${start.x} ${c1.y} ${start.x} ${middle} ${end.x} ${middle} ${end.x} ${c2.y} ${end.x} ${end.y}`; label = horizontal ? { x: middle, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: middle }; }
  return { start, end, path, label };
}
export function moveObjects(objects: InkObject[], ids: Set<string>, dx: number, dy: number): InkObject[] {
  return objects.map(o => {
    if (!ids.has(o.id) || o.board?.locked) return o;
    if (o.kind === "stroke") return { ...o, points: o.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    if (o.kind === "connector") { const s = o.board ?? {}, c = connection(o, objects); return { ...o, board: { ...s, start: s.from ? c.start : { x: c.start.x + dx, y: c.start.y + dy }, end: s.to ? c.end : { x: c.end.x + dx, y: c.end.y + dy } } }; }
    return { ...o, x: (o.x ?? 0) + dx, y: (o.y ?? 0) + dy };
  });
}
export function removeObjects(objects: InkObject[], ids: Set<string>): InkObject[] {
  return objects.filter(o => !ids.has(o.id)).map(o => {
    if (o.kind !== "connector") return o;
    const s = o.board ?? {}, c = connection(o, objects);
    if (!ids.has(s.from?.id ?? "") && !ids.has(s.to?.id ?? "")) return o;
    return { ...o, board: { ...s, from: ids.has(s.from?.id ?? "") ? undefined : s.from, to: ids.has(s.to?.id ?? "") ? undefined : s.to, start: c.start, end: c.end } };
  });
}
export function cloneObjects(objects: InkObject[], ids: Set<string>, idFactory: () => string) {
  const chosen = objects.filter(o => ids.has(o.id)), map = new Map(chosen.map(o => [o.id, idFactory()]));
  const copies = chosen.map(o => { const s = o.board, c = o.kind === "connector" ? connection(o, objects) : null; return { ...o, id: map.get(o.id)!, group: o.group ? `copy-${map.get(chosen.find(v => v.group === o.group)!.id)}` : undefined, order: Date.now() + chosen.indexOf(o), ...(s ? { board: { ...s, locked: false, ...(c ? { from: s.from && map.has(s.from.id) ? { ...s.from, id: map.get(s.from.id)! } : undefined, to: s.to && map.has(s.to.id) ? { ...s.to, id: map.get(s.to.id)! } : undefined, start: c.start, end: c.end } : {}) } } : {}) }; });
  return moveObjects(copies, new Set(copies.map(o => o.id)), 24, 24);
}
export function resizeBox(box: { x: number; y: number; w: number; h: number }, handle: string, delta: XY, aspect = false) {
  let left = box.x, top = box.y, right = box.x + box.w, bottom = box.y + box.h;
  if (handle.includes("w")) left = Math.min(right - 40, left + delta.x);
  if (handle.includes("e")) right = Math.max(left + 40, right + delta.x);
  if (handle.includes("n")) top = Math.min(bottom - 32, top + delta.y);
  if (handle.includes("s")) bottom = Math.max(top + 32, bottom + delta.y);
  if (aspect) { const h = (right - left) * box.h / box.w; if (handle.includes("n")) top = bottom - h; else bottom = top + h; }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
