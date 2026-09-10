/** Page coordinates are CSS pixels at 96 dpi, independent of viewport and zoom. */
export type Point = { x: number; y: number; p: number; t: number; pool?: number };
export type PaperKind = "blank" | "ruled" | "grid" | "dots" | "graph" | "cornell";
export type Paper = { kind: PaperKind; color: string; lineColor: string; spacing: number; width: number; height: number; margin: boolean };
export type Pen = { id: string; name: string; color: string; width: number; minWidth?: number; maxWidth?: number; opacity: number; style: "pen" | "fountain" | "pencil" | "highlighter"; pressure: number; smoothing: number };
export type InkObject = {
  id: string; kind: "stroke" | "image" | "text" | "cover";
  points: Point[]; color: string; width: number; minWidth?: number; maxWidth?: number; opacity: number;
  style: Pen["style"]; pressure: number; order: number;
  x?: number; y?: number; w?: number; h?: number; rotation?: number;
  url?: string; text?: string; group?: string; audioTime?: number; audioRecordingId?: string;
};
export type NoteSurface = { id: string; kind: "typed" | "ink" | "pdf"; name: string; order: number; hidden?: boolean; deleted?: boolean; content?: string; pdfPath?: string; pdfName?: string; pageCount?: number };
export type InkPage = { id: string; order: number; paper: Paper; label: string; bookmark: boolean; pdfPage?: number; deleted?: boolean; searchText?: string; pdfText?: string };
export type Course = { id: string; name: string; color: string; notebookIds: string[]; calendarIds: string[]; paper: Paper };
export type InkTemplate = { id: string; name: string; paper: Paper; createdAt: number };
export type InkPreferences = { pens: Pen[]; defaultPen: string; paper: Paper; compact: boolean; enhancer: boolean; touch: "pan" | "ignore" | "draw"; leftHanded: boolean; highlightBelow: boolean; holdShapes: boolean };
export const DEFAULT_PAPER: Paper = { kind: "ruled", color: "#fffdf7", lineColor: "#d8deea", spacing: 28, width: 816, height: 1056, margin: true };
export const STARTER_PENS: Pen[] = [
  { id: "black", name: "Lecture black", color: "#20242c", width: 2, opacity: 1, style: "pen", pressure: .15, smoothing: .35 },
  { id: "blue", name: "Definition blue", color: "#2563eb", width: 2.7, opacity: 1, style: "pen", pressure: .15, smoothing: .35 },
  { id: "red", name: "Correction red", color: "#dc3545", width: 2, opacity: 1, style: "pen", pressure: .1, smoothing: .35 },
  { id: "yellow", name: "Yellow highlighter", color: "#facc15", width: 20, opacity: .3, style: "highlighter", pressure: 0, smoothing: .1 },
];
export const DEFAULT_INK_PREFERENCES: InkPreferences = { pens: STARTER_PENS, defaultPen: "black", paper: DEFAULT_PAPER, compact: false, enhancer: true, touch: "pan", leftHanded: false, highlightBelow: true, holdShapes: true };
export const uid = () => crypto.randomUUID();
export const newPage = (paper = DEFAULT_PAPER, order = Date.now()): InkPage => ({ id: uid(), order, paper: { ...paper }, label: "", bookmark: false });
export function courseForNotebook(courses: Course[], notebookId: string, calendarId?: string | null) {
  return courses.find(c => c.notebookIds.includes(notebookId)) ?? courses.find(c => calendarId && c.calendarIds.includes(calendarId));
}
export function pointInPolygon(point: Pick<Point, "x" | "y">, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function distanceToSegment(p: Pick<Point, "x" | "y">, a: Pick<Point, "x" | "y">, b: Pick<Point, "x" | "y">) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Resample long segments so crossing a stroke works even with sparse input. */
export function samplePoints(points: Point[], step = 4): Point[] {
  if (!points.length) return [];
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 1; j <= count; j++) { const f = j / count; result.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, p: a.p + (b.p - a.p) * f, t: a.t + (b.t - a.t) * f, ...((a.pool || b.pool) ? { pool: (a.pool ?? 1) + ((b.pool ?? 1) - (a.pool ?? 1)) * f } : {}) }); }
  }
  return result;
}
/** Partial selection splits ink at the lasso boundary; unselected ink stays put. */
export function lassoObjects(objects: InkObject[], polygon: Point[]): { objects: InkObject[]; selected: string[] } {
  const output: InkObject[] = [], selected: string[] = [];
  for (const object of objects) {
    if (object.kind !== "stroke") {
      output.push(object);
      if (pointInPolygon({ x: (object.x ?? 0) + (object.w ?? 0) / 2, y: (object.y ?? 0) + (object.h ?? 0) / 2 }, polygon)) selected.push(object.id);
      continue;
    }
    const samples = samplePoints(object.points);
    const flags = samples.map(p => pointInPolygon(p, polygon));
    if (flags.every(Boolean) || flags.every(v => !v)) { output.push(object); if (flags[0]) selected.push(object.id); continue; }
    let run: Point[] = [samples[0]], inside = flags[0];
    const flush = () => { const part = { ...object, id: uid(), points: run }; output.push(part); if (inside) selected.push(part.id); };
    for (let i = 1; i < samples.length; i++) {
      if (flags[i] !== inside) { run.push(samples[i]); flush(); run = [samples[i]]; inside = flags[i]; }
      else run.push(samples[i]);
    }
    flush();
  }
  const groups = new Set(output.filter(o => selected.includes(o.id) && o.group).map(o => o.group));
  for (const o of output) if (o.group && groups.has(o.group) && !selected.includes(o.id)) selected.push(o.id);
  return { objects: output, selected };
}
export function eraseObjects(objects: InkObject[], from: Point, to: Point, radius: number, partial: boolean): InkObject[] {
  return objects.flatMap(object => {
    if (object.kind !== "stroke") return [object];
    const points = samplePoints(object.points, Math.max(1, radius / 2));
    const erased = points.map(p => distanceToSegment(p, from, to) <= radius + object.width / 2);
    if (!erased.some(Boolean)) return [object];
    if (!partial) return [];
    const parts: InkObject[] = []; let run: Point[] = [];
    const flush = () => { if (run.length) parts.push({ ...object, id: uid(), points: run }); run = []; };
    points.forEach((p, i) => { if (erased[i]) flush(); else run.push(p); }); flush();
    return parts;
  });
}
export type Bounds = { x: number; y: number; w: number; h: number };
export function objectBounds(objects: InkObject[]): Bounds | null {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const o of objects) {
    if (o.kind === "stroke") for (const p of o.points) { x = Math.min(x, p.x - o.width); y = Math.min(y, p.y - o.width); right = Math.max(right, p.x + o.width); bottom = Math.max(bottom, p.y + o.width); }
    else { const cx = (o.x ?? 0) + (o.w ?? 0) / 2, cy = (o.y ?? 0) + (o.h ?? 0) / 2, r = (o.rotation ?? 0) * Math.PI / 180; const w = Math.abs((o.w ?? 0) * Math.cos(r)) + Math.abs((o.h ?? 0) * Math.sin(r)), h = Math.abs((o.w ?? 0) * Math.sin(r)) + Math.abs((o.h ?? 0) * Math.cos(r)); x = Math.min(x, cx - w / 2); y = Math.min(y, cy - h / 2); right = Math.max(right, cx + w / 2); bottom = Math.max(bottom, cy + h / 2); }
  }
  return Number.isFinite(x) ? { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) } : null;
}
export function transformObjects(objects: InkObject[], dx = 0, dy = 0, scale = 1, degrees = 0): InkObject[] {
  const b = objectBounds(objects); if (!b) return objects;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = degrees * Math.PI / 180;
  const transform = (x: number, y: number) => ({ x: cx + ((x - cx) * Math.cos(r) - (y - cy) * Math.sin(r)) * scale + dx, y: cy + ((x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)) * scale + dy });
  return objects.map(o => {
    if (o.kind === "stroke") return { ...o, width: o.width * scale, ...(o.minWidth !== undefined ? { minWidth: o.minWidth * scale } : {}), ...(o.maxWidth !== undefined ? { maxWidth: o.maxWidth * scale } : {}), points: o.points.map(p => ({ ...p, ...transform(p.x, p.y) })) };
    const center = transform((o.x ?? 0) + (o.w ?? 0) / 2, (o.y ?? 0) + (o.h ?? 0) / 2);
    return { ...o, x: center.x - (o.w ?? 0) * scale / 2, y: center.y - (o.h ?? 0) * scale / 2, w: (o.w ?? 0) * scale, h: (o.h ?? 0) * scale, width: o.width * scale, rotation: (o.rotation ?? 0) + degrees };
  });
}
/** Local three-point filtering only runs after pointer-up. Endpoints are exact. */
export function enhancePoints(points: Point[], amount: number): Point[] {
  if (points.length < 3 || amount <= 0) return points;
  return points.map((p, i) => i === 0 || i === points.length - 1 || p.pool ? p : { ...p, x: p.x * (1 - amount / 2) + (points[i - 1].x + points[i + 1].x) * amount / 4, y: p.y * (1 - amount / 2) + (points[i - 1].y + points[i + 1].y) * amount / 4 });
}
export function shapePoints(kind: string, a: Point, b: Point): Point[] {
  const p = (x: number, y: number) => ({ ...b, x, y });
  if (kind === "rectangle") return [a, p(b.x, a.y), b, p(a.x, b.y), a];
  if (kind === "triangle") return [p((a.x + b.x) / 2, a.y), b, p(a.x, b.y), p((a.x + b.x) / 2, a.y)];
  if (kind === "ellipse") return Array.from({ length: 65 }, (_, i) => p((a.x + b.x) / 2 + (b.x - a.x) / 2 * Math.cos(i * Math.PI / 32), (a.y + b.y) / 2 + (b.y - a.y) / 2 * Math.sin(i * Math.PI / 32)));
  if (kind === "arrow") { const r = Math.atan2(b.y - a.y, b.x - a.x), size = Math.min(24, Math.hypot(b.x - a.x, b.y - a.y) / 3); return [a, b, p(b.x - size * Math.cos(r - .5), b.y - size * Math.sin(r - .5)), b, p(b.x - size * Math.cos(r + .5), b.y - size * Math.sin(r + .5))]; }
  return [a, b];
}
/** Conservative hold recognition: short letters and irregular ink remain raw. */
export function recognizeHeldShape(points: Point[]): { kind: string; points: Point[] } | null {
  if (points.length < 3) return null;
  const first = points[0], last = points.at(-1)!, distance = Math.hypot(last.x - first.x, last.y - first.y);
  if (distance > 40 && points.every(p => distanceToSegment(p, first, last) < distance * .08)) return { kind: "line", points: [first, last] };
  const xs = points.map(p => p.x), ys = points.map(p => p.y), x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  if (w < 35 || h < 35 || distance > Math.min(w, h) * .35) return null;
  const a = { ...first, x, y }, b = { ...last, x: x + w, y: y + h };
  const edgeError = points.reduce((sum, p) => sum + Math.min(Math.abs(p.x - x), Math.abs(p.x - x - w), Math.abs(p.y - y), Math.abs(p.y - y - h)), 0) / points.length;
  const hasCorners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].every(([cx, cy]) => points.some(p => Math.hypot(p.x - cx, p.y - cy) < Math.min(w, h) * .15));
  if (hasCorners && edgeError < Math.min(w, h) * .06) return { kind: "rectangle", points: shapePoints("rectangle", a, b) };
  const ellipseError = points.reduce((sum, p) => sum + Math.abs(Math.hypot((p.x - x - w / 2) / (w / 2), (p.y - y - h / 2) / (h / 2)) - 1), 0) / points.length;
  if (ellipseError < .16) return { kind: "ellipse", points: shapePoints("ellipse", a, b) };
  return null;
}

/** A fixed screen-space anchor allows jitter but still detects slow drift. */
export function withinInkHold(anchor: Point, point: Point, scale: number, pen: boolean) {
  return Math.hypot(point.x - anchor.x, point.y - anchor.y) * scale <= (pen ? 6 : 2);
}
export function fountainPool(elapsed: number) {
  return 1 + 2 * Math.min(1, Math.max(0, elapsed - 80) / 1400);
}

export function fountainWidths(pen: { width: number; minWidth?: number; maxWidth?: number }) {
  const min = Math.max(.5, pen.minWidth ?? pen.width * .4);
  return { min, max: Math.max(min, pen.maxWidth ?? pen.width * 3) };
}
/** Page pixels per millisecond: speed stays consistent when replayed or zoomed. */
export function fountainSpeedWidth(pen: { width: number; minWidth?: number; maxWidth?: number }, a: Point, b: Point) {
  const { min, max } = fountainWidths(pen);
  const speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t);
  return min + (max - min) * Math.exp(-speed / .35);
}

/** Filter speed noise and limit width change per travelled pixel. */
export function smoothFountainWidth(pen: { width: number; minWidth?: number; maxWidth?: number }, a: Point, b: Point, smoothing: number) {
  const target = fountainSpeedWidth(pen, a, b);
  if (smoothing <= 0) return target;
  const previous = (a.pool ?? 1) * pen.width;
  const blend = 1 - Math.exp(-Math.max(1, b.t - a.t) / (40 + smoothing * 120));
  const limit = Math.hypot(b.x - a.x, b.y - a.y) * (.35 - .2 * smoothing);
  return previous + Math.max(-limit, Math.min(limit, (target - previous) * blend));
}
/** Extend a held ink pool into the neighbouring line with a gradual taper. */
export function spreadFountainPool(points: Point[], anchor: Point, pool: number, width: number, smoothing: number) {
  const index = points.indexOf(anchor);
  if (index < 0) return;
  anchor.pool = pool;
  if (smoothing <= 0) return;
  const slope = .35 - .2 * smoothing;
  for (const direction of [-1, 1]) {
    let distance = 0;
    for (let i = index + direction; i >= 0 && i < points.length; i += direction) {
      const point = points[i], previous = points[i - direction];
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      const tapered = pool - distance * slope / width;
      if (tapered <= 0) break;
      point.pool = Math.max(point.pool ?? 1, tapered);
    }
  }
}
