import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
  updateDoc,
  deleteField,
} from "firebase/firestore";

const USER_DATA_COLLECTIONS = [
  "buckets",
  "goals",
  "habits",
  "habit_completions",
  "tasks",
  "projects",
  "ideas",
  "note_folders",
  "notes",
  "weight_logs",
] as const;

const LOCAL_STORAGE_KEYS = [
  "committed-conversations",
  "committed-dark-mode",
] as const;

/** Permanently removes all application data belonging to a signed-in user. */
export async function resetAccountData(userId: string): Promise<void> {
  // Explicit account reset is the only path allowed to erase habit history.
  const settingsRef = doc(db, "userSettings", userId);
  await setDoc(settingsRef, { resettingHabits: true }, { merge: true });
  try {
    for (const collectionName of USER_DATA_COLLECTIONS) {
      const snapshot = await getDocs(
        query(collection(db, collectionName), where("userId", "==", userId))
      );

      if (collectionName === "notes") {
        const { deleteNoteWorkspace } = await import("@/lib/ink-service");
        const { deleteNoteImages } = await import("@/lib/note-image-service");
        for (const note of snapshot.docs) { await deleteNoteWorkspace(userId, note.id); await deleteNoteImages(userId, note.id); }
      }

      // Firestore limits a batch to 500 writes. Chunking keeps reset reliable for
      // accounts with a long habit history.
      for (let start = 0; start < snapshot.docs.length; start += 500) {
        const batch = writeBatch(db);
        snapshot.docs.slice(start, start + 500).forEach((document) => {
          batch.delete(document.ref);
        });
        await batch.commit();
      }
    }

    const courses = await getDocs(collection(db, "userSettings", userId, "courses"));
    for (const course of courses.docs) await deleteDoc(course.ref);
    const { deleteInkTemplate, templatesPath } = await import("@/lib/ink-service");
    const templates = await getDocs(collection(db, templatesPath(userId)));
    for (const template of templates.docs) await deleteInkTemplate(userId, template.id);
    await deleteDoc(settingsRef);
  } catch (error) {
    await updateDoc(settingsRef, { resettingHabits: deleteField() });
    throw error;
  }

  if (typeof window !== "undefined") {
    LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    [
      "committed-google-calendar-token",
      "committed-google-calendar-order",
      "committed-google-calendar-cache",
    ].forEach((prefix) => localStorage.removeItem(`${prefix}:${userId}`));
    sessionStorage.removeItem(`committed-google-calendar-token:${userId}`);
    sessionStorage.removeItem(`committed-google-calendar-write-token-v2:${userId}`);
    sessionStorage.removeItem(`committed-google-calendar-write-token-time-v2:${userId}`);
  }
}
