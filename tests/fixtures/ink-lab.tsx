"use client";
// Development-only, isolated integration fixture. Production renders no fixture.
import { useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import NoteWorkspace from "@/components/note-workspace";
import CourseSettings from "@/components/course-settings";
import { MarkdownNote, saveMarkdownNote, saveNoteFolder } from "@/lib/notes-service";
import { saveInk, coursesPath } from "@/lib/ink-service";
import { DEFAULT_PAPER } from "@/lib/ink-model";
export default function InkLab() {
  const [note, setNote] = useState<MarkdownNote | null>(null), [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_FIREBASE_EMULATORS !== "1") return <p>Not available.</p>;
  const start = async () => { try { const user = auth.currentUser ?? (await signInAnonymously(auth)).user; const value: MarkdownNote = { id: `fixture-${user.uid}`, userId: user.uid, notebookId: `book-${user.uid}`, folderId: `book-${user.uid}`, title: "CHEM 101 · Lecture workspace", content: "Lecture definitions\n\nInsert a handwritten calculation below.", initialSurface: "typed", sortOrder: 0, createdAt: Date.now(), updatedAt: Date.now() }; await saveMarkdownNote(value); await saveNoteFolder({ id: value.notebookId, name: "Chemistry", userId: user.uid, kind: "notebook", parentId: null, notebookId: value.notebookId, calendarId: null, sortOrder: 0, createdAt: Date.now(), updatedAt: Date.now() }); await saveInk(coursesPath(user.uid), { id: "chem", name: "CHEM 101", color: "#16a34a", notebookIds: [value.notebookId], calendarIds: [], paper: { ...DEFAULT_PAPER, kind: "grid" } }); setNote(value); } catch (e) { setError(String(e)); } };
  const samplePdf = async () => { const { PDFDocument, StandardFonts, degrees } = await import("pdf-lib"); const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const page = pdf.addPage([612, 792]); page.drawText("CHEM 101 - Sample PDF", { x: 60, y: 700, size: 26, font }); page.drawText("A catalyst changes the reaction rate.", { x: 60, y: 640, size: 18, font }); const rotated = pdf.addPage([612, 792]); rotated.setRotation(degrees(90)); rotated.drawText("Rotated page annotation test", { x: 60, y: 650, size: 22, font }); const { downloadBlob } = await import("@/lib/note-pdf"); downloadBlob(new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" }), "ink-test.pdf"); };
  return <main style={{ padding: 20 }} className="ink-ui"><h1>Isolated ink integration test</h1><p>Local Firebase emulators only. No production data.</p><div className="ink-actions"><button onClick={() => void start()}>Open test workspace</button><button onClick={() => void samplePdf()}>Download sample PDF</button><button onClick={() => { void (offline ? enableNetwork(db) : disableNetwork(db)).then(() => setOffline(!offline)); }}>{offline ? "Reconnect Firestore" : "Go offline"}</button></div>{error && <p>{error}</p>}{note && <><NoteWorkspace key={note.id} note={note} onSurfaceChange={() => {}} onInsert={markdown => setNote({ ...note, content: `${note.content}\n\n${markdown}` })}><textarea aria-label="Test typed content" rows={12} value={note.content} onChange={e => setNote({ ...note, content: e.target.value })} /></NoteWorkspace><CourseSettings userId={note.userId} /></>}</main>;
}
