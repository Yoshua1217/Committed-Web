import { InkObject, Paper, Point, objectBounds } from "./ink-model";

const images = new Map<string, HTMLImageElement>();
export function loadInkImage(url: string): Promise<HTMLImageElement> {
  const cached = images.get(url);
  if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => { images.set(url, image); resolve(image); };
    image.onerror = () => reject(new Error("An image could not be loaded. Check your connection.")); image.src = url;
  });
}
/** Add a tapered ribbon between circular cross sections to one filled path. */
function fountainRibbon(ctx: CanvasRenderingContext2D, o: InkObject, a: Point, b: Point) {
  const radius = (p: Point) => Math.max(.1, o.width * (p.pool ?? 1) / 2);
  const ra = radius(a), rb = radius(b), dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const circle = (p: Point, r: number) => { ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.closePath(); };
  circle(a, ra); circle(b, rb);
  if (distance <= Math.abs(ra - rb)) return;
  // External tangents join the caps without scallops at width transitions.
  const angle = Math.atan2(dy, dx), offset = Math.acos((ra - rb) / distance);
  const u = angle + offset, v = angle - offset;
  ctx.moveTo(a.x + ra * Math.cos(u), a.y + ra * Math.sin(u));
  ctx.lineTo(a.x + ra * Math.cos(v), a.y + ra * Math.sin(v));
  ctx.lineTo(b.x + rb * Math.cos(v), b.y + rb * Math.sin(v));
  ctx.lineTo(b.x + rb * Math.cos(u), b.y + rb * Math.sin(u));
  ctx.closePath();
}
export function drawSegment(ctx: CanvasRenderingContext2D, o: InkObject, a: Point, b: Point) {
  if (o.style === "fountain") {
    ctx.fillStyle = o.color; ctx.beginPath(); fountainRibbon(ctx, o, a, b); ctx.fill(); return;
  }
  const pressure = o.style === "highlighter" ? 0 : o.pressure;
  ctx.lineWidth = Math.max(.2, o.width * (1 - pressure * .65 + ((a.p + b.p) / 2) * pressure * 1.3));
  ctx.strokeStyle = o.color; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  if (a.x === b.x && a.y === b.y) { ctx.fillStyle = o.color; ctx.arc(b.x, b.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
}
export function drawObject(ctx: CanvasRenderingContext2D, o: InkObject, study = false, revealed = false) {
  ctx.save(); ctx.globalAlpha = o.opacity;
  if (o.kind === "stroke") {
    if (o.style === "fountain") {
      ctx.fillStyle = o.color; ctx.beginPath();
      for (let i = 0; i < o.points.length; i++) fountainRibbon(ctx, o, o.points[Math.max(0, i - 1)], o.points[i]);
      ctx.fill();
    } else if (o.style === "highlighter") {
      ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
      if (o.points.length === 1) { const p = o.points[0]; ctx.fillStyle = o.color; ctx.arc(p.x, p.y, o.width / 2, 0, Math.PI * 2); ctx.fill(); }
      else { o.points.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke(); }
    } else if (o.points.length === 1) { const p = o.points[0]; ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(p.x, p.y, o.width / 2, 0, Math.PI * 2); ctx.fill(); }
    else { if (o.style === "pencil") ctx.globalAlpha *= .72; for (let i = 1; i < o.points.length; i++) drawSegment(ctx, o, o.points[i - 1], o.points[i]); }
  } else {
    const x = o.x ?? 0, y = o.y ?? 0, w = o.w ?? 0, h = o.h ?? 0;
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate((o.rotation ?? 0) * Math.PI / 180);
    if (o.kind === "image" && o.url) { const image = images.get(o.url); if (image?.complete && image.naturalWidth) ctx.drawImage(image, -w / 2, -h / 2, w, h); }
    if (o.kind === "text") { ctx.fillStyle = o.color; ctx.font = `${o.width}px system-ui`; ctx.textBaseline = "top"; (o.text ?? "").split("\n").forEach((line, i) => ctx.fillText(line, -w / 2, -h / 2 + i * o.width * 1.4)); }
    if (o.kind === "cover") {
      ctx.globalAlpha = study ? (revealed ? .08 : 1) : .12;
      ctx.fillStyle = "#171717";
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(8, w / 4, h / 4)); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = study ? "#737373" : "#525252"; ctx.lineWidth = 1;
      ctx.setLineDash([]); ctx.stroke();
      if (study && !revealed) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = "#f5f5f5"; ctx.font = `500 ${Math.min(12, h / 3)}px system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (w >= 65 && h >= 24) ctx.fillText("Tap to reveal", 0, 0, w - 16);
        else { ctx.strokeStyle = "#f5f5f5"; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(2, 0); ctx.lineTo(-3, 4); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
export function drawObjects(ctx: CanvasRenderingContext2D, objects: InkObject[], highlightBelow = true, study = false, revealed = new Set<string>()) {
  const sorted = [...objects].sort((a, b) => {
    const layer = (o: InkObject) => o.kind === "image" ? -2 : o.kind === "cover" ? 2 : highlightBelow && o.style === "highlighter" ? -1 : 0;
    return layer(a) - layer(b) || a.order - b.order || a.id.localeCompare(b.id);
  });
  for (const o of sorted) drawObject(ctx, o, study, study && revealed.has(o.id));
}
export function drawPaper(ctx: CanvasRenderingContext2D, paper: Paper) {
  const { width: w, height: h, spacing: s, kind } = paper;
  ctx.save(); ctx.fillStyle = paper.color; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = paper.lineColor; ctx.fillStyle = paper.lineColor; ctx.lineWidth = .7;
  const line = (x: number, y: number, xx: number, yy: number) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke(); };
  if (kind === "dots") { for (let y = s; y < h; y += s) for (let x = s; x < w; x += s) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); } }
  else if (kind !== "blank") {
    for (let y = s; y < h; y += s) line(0, y, w, y);
    if (kind === "grid" || kind === "graph") for (let x = s; x < w; x += s) line(x, 0, x, h);
    if (kind === "graph") { ctx.lineWidth = 1.3; for (let x = s * 5; x < w; x += s * 5) line(x, 0, x, h); for (let y = s * 5; y < h; y += s * 5) line(0, y, w, y); }
    if (kind === "cornell") { ctx.lineWidth = 2; line(w * .27, 0, w * .27, h * .82); line(0, h * .82, w, h * .82); }
  }
  if (paper.margin && kind !== "cornell") { ctx.strokeStyle = "#df9ea0"; line(72, 0, 72, h); }
  ctx.restore();
}
export async function objectsPng(objects: InkObject[], paper?: Paper, transparent = false): Promise<Blob> {
  await Promise.all(objects.filter(o => o.url).map(o => loadInkImage(o.url!)));
  const bounds = paper ? { x: 0, y: 0, w: paper.width, h: paper.height } : objectBounds(objects);
  if (!bounds) throw new Error("Select some ink first.");
  const padding = paper ? 0 : 10;
  const scale = Math.min(2, 4096 / Math.max(bounds.w + padding * 2, bounds.h + padding * 2));
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil((bounds.w + padding * 2) * scale); canvas.height = Math.ceil((bounds.h + padding * 2) * scale);
  const ctx = canvas.getContext("2d")!; ctx.scale(scale, scale); ctx.translate(-bounds.x + padding, -bounds.y + padding);
  if (paper && !transparent) drawPaper(ctx, paper);
  drawObjects(ctx, objects);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create image.")), "image/png"));
}
