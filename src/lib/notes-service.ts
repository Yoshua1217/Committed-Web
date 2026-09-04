import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const FOLDER_COLLECTION = "note_folders";
const NOTE_COLLECTION = "notes";

export type NoteFolderKind = "notebook" | "folder";

export interface NoteFolder {
  id: string;
  userId: string;
  name: string;
  kind: NoteFolderKind;
  parentId: string | null;
  notebookId: string;
  calendarId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface MarkdownNote {
  id: string;
  userId: string;
  folderId: string;
  notebookId: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function folderFromFirestore(id: string, data: Record<string, unknown>): NoteFolder {
  const kind = data.kind === "folder" ? "folder" : "notebook";
  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    name: typeof data.name === "string" ? data.name : "Untitled",
    kind,
    parentId: typeof data.parentId === "string" ? data.parentId : null,
    notebookId: typeof data.notebookId === "string" ? data.notebookId : id,
    calendarId: typeof data.calendarId === "string" ? data.calendarId : null,
    sortOrder: asNumber(data.sortOrder),
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt),
  };
}

function noteFromFirestore(id: string, data: Record<string, unknown>): MarkdownNote {
  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    folderId: typeof data.folderId === "string" ? data.folderId : "",
    notebookId: typeof data.notebookId === "string" ? data.notebookId : "",
    title: typeof data.title === "string" ? data.title : "Untitled note",
    content: typeof data.content === "string" ? data.content : "",
    sortOrder: asNumber(data.sortOrder),
    createdAt: asNumber(data.createdAt),
    updatedAt: asNumber(data.updatedAt),
  };
}

export function generateNotesId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function subscribeToNoteFolders(userId: string, callback: (folders: NoteFolder[]) => void): () => void {
  const foldersQuery = query(collection(db, FOLDER_COLLECTION), where("userId", "==", userId));
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe = () => {};
  const listen = () => {
    unsubscribe = onSnapshot(
      foldersQuery,
      (snapshot) => callback(snapshot.docs
        .map((folderDoc) => folderFromFirestore(folderDoc.id, folderDoc.data() as Record<string, unknown>))
        .sort((first, second) => first.sortOrder - second.sortOrder || first.createdAt - second.createdAt)),
      (error) => {
        console.error("subscribeToNoteFolders error:", error);
        // A rejected listener is terminal in Firestore. Retry so a freshly
        // deployed rule or restored connection recovers without clearing the
        // user's optimistic workspace state.
        if (!stopped) retryTimer = setTimeout(listen, 2_500);
      },
    );
  };
  listen();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    unsubscribe();
  };
}

export function subscribeToMarkdownNotes(userId: string, callback: (notes: MarkdownNote[]) => void): () => void {
  const notesQuery = query(collection(db, NOTE_COLLECTION), where("userId", "==", userId));
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe = () => {};
  const listen = () => {
    unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => callback(snapshot.docs
        .map((noteDoc) => noteFromFirestore(noteDoc.id, noteDoc.data() as Record<string, unknown>))
        .sort((first, second) => first.sortOrder - second.sortOrder || second.updatedAt - first.updatedAt)),
      (error) => {
        console.error("subscribeToMarkdownNotes error:", error);
        if (!stopped) retryTimer = setTimeout(listen, 2_500);
      },
    );
  };
  listen();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    unsubscribe();
  };
}

export async function saveNoteFolder(folder: NoteFolder): Promise<void> {
  await setDoc(doc(db, FOLDER_COLLECTION, folder.id), { ...folder });
}

/** Atomically persists notebook ordering so other devices never see a partial reorder. */
export async function saveNoteFolderOrder(folders: NoteFolder[]): Promise<void> {
  for (let start = 0; start < folders.length; start += 500) {
    const batch = writeBatch(db);
    folders.slice(start, start + 500).forEach((folder) => {
      batch.set(doc(db, FOLDER_COLLECTION, folder.id), { ...folder });
    });
    await batch.commit();
  }
}

export async function saveMarkdownNote(note: MarkdownNote): Promise<void> {
  await setDoc(doc(db, NOTE_COLLECTION, note.id), { ...note });
}

export async function deleteMarkdownNote(noteId: string): Promise<void> {
  await deleteDoc(doc(db, NOTE_COLLECTION, noteId));
}
