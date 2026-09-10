import type { MarkdownNote } from "./notes-service";
import type { InkPage, NoteSurface } from "./ink-model";
import { pagePath, readInk, surfacePath } from "./ink-service";

export type WorkspaceSearchEntry = { noteId: string; surfaceId: string; pageId?: string; title: string; text: string };
/** Load a compact text index on demand, never drawing data or PDF file bytes. */
export async function loadWorkspaceSearch(notes: MarkdownNote[], progress: (count: number) => void): Promise<WorkspaceSearchEntry[]> {
  const entries: WorkspaceSearchEntry[] = [];
  let cursor = 0, complete = 0;
  const worker = async () => {
    while (cursor < notes.length) {
      const note = notes[cursor++], surfaces = await readInk<NoteSurface>(surfacePath(note.id));
      for (const surface of surfaces.filter(s => !s.deleted)) {
        if (surface.kind === "typed" && surface.id !== "main") entries.push({ noteId: note.id, surfaceId: surface.id, title: `${note.title} · ${surface.name}`, text: surface.content ?? "" });
        if (surface.kind !== "typed") {
          const pages = (await readInk<InkPage>(pagePath(note.id, surface.id))).filter(p => !p.deleted).sort((a, b) => a.order - b.order);
          pages.forEach((page, i) => entries.push({ noteId: note.id, surfaceId: surface.id, pageId: page.id, title: `${note.title} · ${surface.name} · ${page.label || `Page ${i + 1}`}`, text: page.searchText ?? "" }));
        }
      }
      progress(++complete);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, notes.length) }, worker));
  return entries;
}
