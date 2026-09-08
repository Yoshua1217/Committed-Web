interface Edit {
  before: string;
  after: string;
  group: string | null;
  time: number;
}
interface History { undo: Edit[]; redo: Edit[] }

/** Session-local content history. Each menu action is one independent step. */
export class NotesHistory {
  private notes = new Map<string, History>();

  record(noteId: string, before: string, after: string, group: string | null = null, time = Date.now()) {
    if (before === after) return;
    let history = this.notes.get(noteId);
    const previous = history?.undo.at(-1);
    // Never restore a snapshot over a change received from another device.
    if (!history || (previous && previous.after !== before)) {
      history = { undo: [], redo: [] };
      this.notes.set(noteId, history);
    }
    const last = history.undo.at(-1);
    if (!history.redo.length && group && last?.group === group && time - last.time < 750) {
      last.after = after;
      last.time = time;
    } else history.undo.push({ before, after, group, time });
    history.redo = [];
    if (history.undo.length > 100) history.undo.shift();
  }

  step(noteId: string, current: string, direction: "undo" | "redo"): string | null {
    const history = this.notes.get(noteId);
    if (!history) return null;
    const from = history[direction];
    const edit = from.at(-1);
    if (!edit) return null;
    if (current !== (direction === "undo" ? edit.after : edit.before)) {
      this.notes.delete(noteId);
      return null;
    }
    from.pop();
    // Typing after an undo/redo starts a new step.
    edit.group = null;
    history[direction === "undo" ? "redo" : "undo"].push(edit);
    return direction === "undo" ? edit.before : edit.after;
  }

  // An upload completing resolves its placeholder in every snapshot, so undo
  // can never resurrect an upload placeholder that will no longer resolve.
  resolveText(noteId: string, token: string, replacement: string) {
    const history = this.notes.get(noteId);
    if (!history) return;
    for (const edit of [...history.undo, ...history.redo]) {
      edit.before = edit.before.replace(token, replacement);
      edit.after = edit.after.replace(token, replacement);
    }
  }
}

export function noteHistoryShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean }) {
  if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

export function listenForNoteHistory(container: HTMLElement | null, onStep: (direction: "undo" | "redo") => void) {
  const handleHistory = (event: KeyboardEvent) => {
    const direction = noteHistoryShortcut(event);
    if (!container || !direction || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // Deleting a table removes its focused menu; subsequent keys target body.
    // Other inputs (including the title and search) retain their native undo.
    if (target !== document.body && target !== document.documentElement && (!container.contains(target) || target.closest("input, .notes-title-input"))) return;
    event.preventDefault();
    onStep(direction);
  };
  window.addEventListener("keydown", handleHistory);
  return () => window.removeEventListener("keydown", handleHistory);
}
