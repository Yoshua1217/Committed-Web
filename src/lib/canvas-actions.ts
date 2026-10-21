import type { InkObject } from "./ink-model";
import { uid } from "./ink-model";
import { bounds, cloneObjects, moveObjects, removeObjects } from "./canvas-model";
export function arrangeCanvas(name: string, objects: InkObject[], selected: string[], save: (objects: InkObject[]) => void, setSelected: (ids: string[]) => void) {
    const current = objects, ids = new Set(selected), unlocked = new Set(current.filter(o => ids.has(o.id) && !o.board?.locked).map(o => o.id));
    if (name === "delete") { save(removeObjects(current, unlocked)); setSelected([]); return; }
    if (name === "duplicate") { const copies = cloneObjects(current, ids, uid); save([...current, ...copies]); setSelected(copies.map(o => o.id)); return; }
    if (name === "lock") { const lock = !current.filter(o => ids.has(o.id)).every(o => o.board?.locked); save(current.map(o => ids.has(o.id) ? { ...o, board: { ...o.board, locked: lock } } : o)); return; }
    if (name === "group" || name === "ungroup") { const group = name === "group" ? uid() : undefined; save(current.map(o => unlocked.has(o.id) ? { ...o, group } : o)); return; }
    if (name === "front" || name === "back") { const order = (name === "front" ? Math.max(0, ...current.map(o => o.order)) + 1 : Math.min(0, ...current.map(o => o.order)) - selected.length - 1); save(current.map((o, i) => unlocked.has(o.id) ? { ...o, order: order + i / current.length } : o)); return; }
    const chosen = current.filter(o => unlocked.has(o.id) && o.kind !== "connector").sort((a, b) => bounds(a).x - bounds(b).x); if (chosen.length < 2) return;
    const left = Math.min(...chosen.map(o => bounds(o).x)), top = Math.min(...chosen.map(o => bounds(o).y)), right = Math.max(...chosen.map(o => bounds(o).x + bounds(o).w));
    const gap = (right - left - chosen.reduce((sum, o) => sum + bounds(o).w, 0)) / (chosen.length - 1); let x = left, next = current;
    for (const o of chosen) { const b = bounds(o), dx = name === "left" ? left - b.x : name === "center" ? (left + right - b.w) / 2 - b.x : name === "distribute" ? x - b.x : 0; next = moveObjects(next, new Set([o.id]), dx, name === "top" ? top - b.y : 0); x += b.w + gap; } save(next);
}
