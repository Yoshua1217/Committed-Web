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
import { Bucket } from "@/lib/types";

const COLLECTION_NAME = "buckets";

function bucketToFirestoreMap(bucket: Bucket): Record<string, unknown> {
  return {
    name: bucket.name,
    iconName: bucket.iconName,
    color: bucket.color,
    sortOrder: bucket.sortOrder,
    createdAt: bucket.createdAt,
    userId: bucket.userId,
  };
}

function bucketFromFirestoreMap(id: string, data: Record<string, unknown>): Bucket {
  return {
    id,
    name: data.name as string,
    iconName: data.iconName as string,
    color: data.color as number,
    sortOrder: data.sortOrder as number,
    createdAt: data.createdAt as number,
    userId: data.userId as string,
  };
}

/**
 * Subscribe to real-time updates for a user's buckets, ordered by sortOrder.
 * Returns an unsubscribe function.
 */
export function subscribeToBuckets(
  userId: string,
  callback: (buckets: Bucket[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const buckets: Bucket[] = snapshot.docs
      .map((doc) => bucketFromFirestoreMap(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    callback(buckets);
  }, (error) => {
    console.error("subscribeToBuckets error:", error);
    callback([]);
  });
}

/**
 * Create or update a bucket document. Uses the bucket's id as the document ID.
 */
export async function saveBucket(bucket: Bucket): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, bucket.id);
  await setDoc(docRef, bucketToFirestoreMap(bucket));
}

/**
 * Delete a bucket document by ID.
 */
export async function deleteBucket(bucketId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, bucketId);
  await deleteDoc(docRef);
}

/**
 * Generate a UUID-style string for new bucket IDs.
 */
export function generateBucketId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
