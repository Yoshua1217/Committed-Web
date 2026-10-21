"use client";
import { useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { saveMarkdownNote, type MarkdownNote } from "@/lib/notes-service";
import { saveInk, pagePath, surfacePath } from "@/lib/ink-service";
import { newPage, WHITEBOARD_PAPER } from "@/lib/ink-model";
import NotesMarkdown from "@/components/notes-markdown";
import { DrawingInsertButton } from "@/components/drawing-block-context";
import NoteWorkspace from "@/components/note-workspace";
export default function CanvasWorkspaceLab() {
  const [note, setNote] = useState<MarkdownNote | null>(null), [error, setError] = useState(""), [offline, setOffline] = useState(false), [mount, setMount] = useState(0);
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_FIREBASE_EMULATORS !== "1") return <p>Local emulators required.</p>;
  const start = async () => {
    try {
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
      const value: MarkdownNote = { id: `canvas-${user.uid}`, userId: user.uid, notebookId: "test", folderId: "test", title: "Saved canvas test", content: "", initialSurface: "canvas", sortOrder: 0, createdAt: Date.now(), updatedAt: Date.now() };
      await saveMarkdownNote(value);
      await saveInk(surfacePath(value.id), { id: "canvas", kind: "canvas", name: "Infinite canvas", order: 0 });
      await saveInk(pagePath(value.id, "canvas"), { ...newPage(WHITEBOARD_PAPER, 0), id: "first-page" });
      await saveInk(surfacePath(value.id), { id: "handwriting", kind: "ink", name: "Handwritten pages", order: 1 });
      await saveInk(pagePath(value.id, "handwriting"), { ...newPage(), id: "first-page" });
      await saveInk(surfacePath(value.id), { id: "main", kind: "typed", name: "Notes", order: 2 });
      setNote(value);
    } catch (e) { setError(String(e)); }
  };
  return <main className="dark" style={{ padding: 16 }}><div style={{ display: "flex", gap: 12, marginBottom: 12 }}><button onClick={() => void start()}>Open saved canvas test</button><button onClick={() => void (offline ? enableNetwork(db) : disableNetwork(db)).then(() => setOffline(!offline))}>{offline ? "Reconnect" : "Go offline"}</button><button onClick={() => setMount(n => n + 1)}>Reopen canvas</button><a href="/ink-lab">Visual fixture</a></div>{error && <p role="alert">{error}</p>}{note && <NoteWorkspace key={mount} note={note} onInsert={source => { const next = {...note, content:note.content+source}; setNote(next); void saveMarkdownNote(next); }} onSurfaceChange={() => {}}><DrawingInsertButton /><NotesMarkdown content={note.content} /></NoteWorkspace>}</main>;
}
