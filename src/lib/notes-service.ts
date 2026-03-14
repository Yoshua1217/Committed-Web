import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Note } from "@/lib/types";

const COLLECTION_NAME = "notes";

function noteToFirestoreMap(note: Note): Record<string, unknown> {
  return {
    title: note.title,
    content: note.content,
    labelIds: note.labelIds,
    bucketId: note.bucketId,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    userId: note.userId,
  };
}

function noteFromFirestoreMap(id: string, data: Record<string, unknown>): Note {
  return {
    id,
    title: data.title as string,
    content: data.content as string,
    labelIds: (data.labelIds as string[]) || [],
    bucketId: data.bucketId as string,
    createdAt: data.createdAt as number,
    updatedAt: data.updatedAt as number,
    userId: data.userId as string,
  };
}

/**
 * Subscribe to real-time updates for a user's notes.
 */
export function subscribeToNotes(
  userId: string,
  callback: (notes: Note[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const notes: Note[] = snapshot.docs
      .map((doc) => noteFromFirestoreMap(doc.id, doc.data() as Record<string, unknown>))
      // Sort newest first
      .sort((a, b) => b.updatedAt - a.updatedAt);
    callback(notes);
  }, (error) => {
    console.error("subscribeToNotes error:", error);
    callback([]);
  });
}

/**
 * Create or update a note document.
 */
export async function saveNote(note: Note): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, note.id);
  await setDoc(docRef, noteToFirestoreMap(note));
}

/**
 * Delete a note document by ID.
 */
export async function deleteNote(noteId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, noteId);
  await deleteDoc(docRef);
}

/**
 * Generate a UUID-style string for new note IDs.
 */
export function generateNoteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
