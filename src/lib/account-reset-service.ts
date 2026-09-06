import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
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
] as const;

const LOCAL_STORAGE_KEYS = [
  "committed-conversations",
  "committed-dark-mode",
] as const;

/** Permanently removes all application data belonging to a signed-in user. */
export async function resetAccountData(userId: string): Promise<void> {
  for (const collectionName of USER_DATA_COLLECTIONS) {
    const snapshot = await getDocs(
      query(collection(db, collectionName), where("userId", "==", userId))
    );

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

  await deleteDoc(doc(db, "userSettings", userId));

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
