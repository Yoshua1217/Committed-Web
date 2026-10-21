import type { MarkdownNote } from "./notes-service";
import type { NoteSurface } from "./ink-model";
import { readInk, surfacePath } from "./ink-service";

export type NoteKind = NoteSurface["kind"];
export function noteKind(note: Pick<MarkdownNote, "initialSurface">, surfaces: NoteSurface[] = []): NoteKind {
  const current = surfaces.filter(surface => !surface.deleted);
  if (current.some(surface => surface.kind === "pdf")) return "pdf";
  if (note.initialSurface === "pdf") return "pdf";
  if (current.some(surface => surface.kind === "whiteboard") || note.initialSurface === "whiteboard") return "whiteboard";
  if (current.some(surface => surface.kind === "canvas" && !surface.hidden) || note.initialSurface === "canvas") return "canvas";
  if (current.some(surface => surface.kind === "ink") || note.initialSurface === "ink") return "ink";
  return "typed";
}

export function noteKindIcon(kind: NoteKind): string {
  return kind === "pdf" ? "picture_as_pdf" : kind === "whiteboard" ? "dashboard_customize" : kind === "canvas" ? "all_inclusive" : kind === "ink" ? "draw" : "description";
}

/** Resolve old note types using surface metadata only. No pages, ink, or files
 * are loaded, and a large notebook never starts more than four reads at once. */
export async function loadNoteKinds(notes: Pick<MarkdownNote, "id" | "initialSurface">[], stopped: () => boolean = () => false): Promise<Record<string, NoteKind>> {
  const kinds: Record<string, NoteKind> = {};
  let cursor = 0;
  const worker = async () => {
    while (!stopped() && cursor < notes.length) {
      const note = notes[cursor++];
      if (note.initialSurface === "pdf" || note.initialSurface === "whiteboard" || note.initialSurface === "canvas") { kinds[note.id] = note.initialSurface; continue; }
      try { kinds[note.id] = noteKind(note, await readInk<NoteSurface>(surfacePath(note.id))); }
      catch { /* Keep the declared type until metadata can be read or the note opens. */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, notes.length) }, worker));
  return kinds;
}
