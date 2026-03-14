import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Label } from "@/lib/types";

const COLLECTION_NAME = "labels";

function labelToFirestoreMap(label: Label): Record<string, unknown> {
  return {
    name: label.name,
    bucketId: label.bucketId,
    sortOrder: label.sortOrder ?? 0,
    createdAt: label.createdAt,
    userId: label.userId,
  };
}

function labelFromFirestoreMap(id: string, data: Record<string, unknown>): Label {
  return {
    id,
    name: data.name as string,
    bucketId: data.bucketId as string,
    sortOrder: (data.sortOrder as number) ?? 0,
    createdAt: data.createdAt as number,
    userId: data.userId as string,
  };
}

/**
 * Subscribe to real-time updates for a user's labels, ordered by creation time.
 */
export function subscribeToLabels(
  userId: string,
  callback: (labels: Label[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const labels: Label[] = snapshot.docs
      .map((doc) => labelFromFirestoreMap(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.createdAt - b.createdAt;
      });
    callback(labels);
  }, (error) => {
    console.error("subscribeToLabels error:", error);
    callback([]);
  });
}

/**
 * Create or update a label document.
 */
export async function saveLabel(label: Label): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, label.id);
  await setDoc(docRef, labelToFirestoreMap(label));
}

/**
 * Delete a label document by ID.
 */
export async function deleteLabel(labelId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, labelId);
  await deleteDoc(docRef);
}

/**
 * Generate a UUID-style string for new label IDs.
 */
export function generateLabelId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Batch update the sortOrder of multiple labels.
 */
export async function updateLabelOrder(updates: { id: string; sortOrder: number }[]): Promise<void> {
  const batch = writeBatch(db);
  for (const update of updates) {
    const docRef = doc(db, COLLECTION_NAME, update.id);
    batch.update(docRef, { sortOrder: update.sortOrder });
  }
  await batch.commit();
}
