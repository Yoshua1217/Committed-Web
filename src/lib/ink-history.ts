import type { InkObject } from "./ink-model";
type Change = { id: string; before?: InkObject; after?: InkObject };
type Edit = Change[];
const same = (a?: InkObject, b?: InkObject) => a === b || JSON.stringify(a) === JSON.stringify(b);
/** Undo changes only the objects involved in the action, preserving remote ink. */
export class InkHistory {
  undo: Edit[] = [];
  redo: Edit[] = [];
  record(before: InkObject[], after: InkObject[]) {
    const a = new Map(before.map(o => [o.id, o])), b = new Map(after.map(o => [o.id, o]));
    const changes = [...new Set([...a.keys(), ...b.keys()])].filter(id => !same(a.get(id), b.get(id))).map(id => ({ id, before: a.get(id), after: b.get(id) }));
    if (!changes.length) return;
    this.undo.push(changes); this.redo = [];
    if (this.undo.length > 100) this.undo.shift();
  }
  step(current: InkObject[], back: boolean): InkObject[] | null {
    const edit = (back ? this.undo : this.redo).pop(); if (!edit) return null;
    const values = new Map(current.map(o => [o.id, o])), applied: Edit = [];
    for (const change of edit) {
      const expected = back ? change.after : change.before, replacement = back ? change.before : change.after;
      // A subsequent edit on another device owns that object now. Do not undo it.
      if (!same(values.get(change.id), expected)) continue;
      if (replacement) values.set(change.id, replacement); else values.delete(change.id);
      applied.push(change);
    }
    if (applied.length) (back ? this.redo : this.undo).push(applied);
    return [...values.values()];
  }
}
