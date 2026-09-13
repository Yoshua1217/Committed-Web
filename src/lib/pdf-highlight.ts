import type { InkObject } from "./ink-model";

export type PdfTextLine = {
  text: string; x: number; y: number; w: number; h: number;
  // Centerline in page coordinates, including the PDF page/text rotation.
  baseline?: { x: number; y: number; ux: number; uy: number; length: number; height: number };
};

/** Snap a completed, mostly straight gesture to the text it crosses. */
export function snapPdfHighlight(stroke: InkObject, lines: PdfTextLine[]): InkObject {
  if (stroke.kind !== "stroke" || stroke.style !== "highlighter" || stroke.points.length < 2) return stroke;
  const first = stroke.points[0], last = stroke.points.at(-1)!;
  const distance = Math.hypot(last.x - first.x, last.y - first.y);
  if (distance < 6) return stroke;
  let pathLength = 0;
  for (let i = 1; i < stroke.points.length; i++) pathLength += Math.hypot(stroke.points[i].x - stroke.points[i - 1].x, stroke.points[i].y - stroke.points[i - 1].y);
  if (distance < pathLength * .7) return stroke;
  const runs = lines.filter(l => l.text.trim() && l.w > 0 && l.h > 0).map(l => l.baseline ?? { x: l.x, y: l.y + l.h / 2, ux: 1, uy: 0, length: l.w, height: l.h });
  let best: InkObject | undefined, bestScore = Infinity;
  for (const run of runs) {
    const along = (p: { x: number; y: number }) => (p.x - run.x) * run.ux + (p.y - run.y) * run.uy;
    const across = (p: { x: number; y: number }) => -(p.x - run.x) * run.uy + (p.y - run.y) * run.ux;
    const a = along(first), b = along(last), low = Math.min(a, b), high = Math.max(a, b);
    if (high - low < distance * .9 || high <= 0 || low >= run.length) continue;
    // Require the whole stroke to stay near this line, rather than snapping
    // diagrams, vertical marks, or gestures crossing several rows of text.
    let error = 0, valid = true;
    for (const point of stroke.points) {
      const delta = Math.abs(across(point));
      if (delta > run.height * .8) { valid = false; break; }
      error += delta;
    }
    if (!valid) continue;
    const intervals = runs.flatMap(other => {
      if (other.ux * run.ux + other.uy * run.uy < .99 || Math.abs(across(other)) > Math.min(run.height, other.height) * .35) return [];
      const start = along(other);
      return [[start, start + other.length]];
    }).sort((x, y) => x[0] - y[0]);
    // Join adjacent PDF text fragments, but never bridge separate columns.
    const groups: number[][] = [];
    for (const interval of intervals) {
      const previous = groups.at(-1);
      if (previous && interval[0] - previous[1] <= run.height) previous[1] = Math.max(previous[1], interval[1]);
      else groups.push([...interval]);
    }
    const group = groups.find(g => g[0] <= 0 && g[1] >= run.length);
    if (!group) continue;
    const start = Math.max(low, group[0]), end = Math.min(high, group[1]);
    if (end - start < (high - low) * .65) continue;
    const score = error / stroke.points.length / run.height;
    if (score >= bestScore) continue;
    bestScore = score;
    // Lower the highlight toward the text baseline, following rotated text too.
    const offset = run.height * .15;
    const point = (t: number) => ({ x: run.x + run.ux * t - run.uy * offset, y: run.y + run.uy * t + run.ux * offset, p: .5, t: first.t });
    best = { ...stroke, width: run.height * 1.15, pressure: 0, points: [point(a < b ? start : end), { ...point(a < b ? end : start), t: last.t }] };
  }
  return best ?? stroke;
}
