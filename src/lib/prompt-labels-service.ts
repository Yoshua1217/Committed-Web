import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PromptLabel } from "@/lib/types";

const COLLECTION_NAME = "prompt_labels";

function labelToFirestoreMap(label: PromptLabel): Record<string, unknown> {
  return {
    name: label.name,
    sortOrder: label.sortOrder ?? 0,
    createdAt: label.createdAt,
    userId: label.userId,
  };
}

function labelFromFirestoreMap(id: string, data: Record<string, unknown>): PromptLabel {
  return {
    id,
    name: data.name as string,
    sortOrder: (data.sortOrder as number) ?? 0,
    createdAt: data.createdAt as number,
    userId: data.userId as string,
  };
}

/**
 * Subscribes to the user's prompt labels, ordered by sortOrder then creation time.
 */
export function subscribeToPromptLabels(
  userId: string,
  callback: (labels: PromptLabel[]) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME), where("userId", "==", userId));

  return onSnapshot(q, (snapshot) => {
    const labels: PromptLabel[] = snapshot.docs
      .map((doc) => labelFromFirestoreMap(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.createdAt - b.createdAt;
      });
    callback(labels);
  }, (error) => {
    console.error("subscribeToPromptLabels error:", error);
  });
}

/**
 * Creates or updates a label.
 */
export async function savePromptLabel(label: PromptLabel): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, label.id);
  await setDoc(docRef, labelToFirestoreMap(label), { merge: true });
}

/**
 * Deletes a label by ID.
 */
export async function deletePromptLabel(labelId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, labelId);
  await deleteDoc(docRef);
}

/**
 * Generate a new random ID for a label.
 */
export function generatePromptLabelId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Batch update the sortOrder of multiple labels.
 */
export async function updatePromptLabelOrder(updates: { id: string; sortOrder: number }[]): Promise<void> {
  const batch = writeBatch(db);
  for (const update of updates) {
    const docRef = doc(db, COLLECTION_NAME, update.id);
    batch.update(docRef, { sortOrder: update.sortOrder });
  }
  await batch.commit();
}
