import type { NoteSurface } from "./ink-model";

export function markdownPages(note: { title: string; content: string }, surfaces: NoteSurface[]) {
  const pages = [
    { title: note.title, content: note.content },
    ...surfaces.filter(surface => surface.id !== "main" && surface.kind === "typed" && !surface.deleted)
      .sort((a, b) => a.order - b.order)
      .map(surface => ({ title: surface.name, content: surface.content ?? "" })),
  ];
  const filenames = new Set<string>();
  return pages.map(page => {
    const title = page.title.trim() || "Untitled note";
    const base = title.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "") || "Untitled note";
    let filename = `${base}.md`;
    for (let suffix = 2; filenames.has(filename.toLowerCase()); suffix++) filename = `${base} (${suffix}).md`;
    filenames.add(filename.toLowerCase());
    return { filename, body: `# ${title}\n\n${page.content}` };
  });
}
