import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PromptPlatform } from "@/lib/types";

const COLLECTION_NAME = "prompt_platforms";

function platformToFirestoreMap(platform: PromptPlatform): Record<string, unknown> {
  return {
    name: platform.name,
    color: platform.color,
    createdAt: platform.createdAt,
    userId: platform.userId,
  };
}

function platformFromFirestoreMap(id: string, data: Record<string, unknown>): PromptPlatform {
  return {
    id,
    name: data.name as string,
    color: data.color as string,
    createdAt: data.createdAt as number,
    userId: data.userId as string,
  };
}

/**
 * Subscribes to the user's prompt platforms, ordered by creation time.
 */
export function subscribeToPlatforms(
  userId: string,
  callback: (platforms: PromptPlatform[]) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME), where("userId", "==", userId));

  return onSnapshot(q, (snapshot) => {
    const platforms: PromptPlatform[] = snapshot.docs
      .map((doc) => platformFromFirestoreMap(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort by name alphabetically
    callback(platforms);
  }, (error) => {
    console.error("subscribeToPlatforms error:", error);
  });
}

/**
 * Creates or updates a prompt platform.
 */
export async function savePlatform(platform: PromptPlatform): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, platform.id);
  await setDoc(docRef, platformToFirestoreMap(platform), { merge: true });
}

/**
 * Deletes a prompt platform by ID.
 */
export async function deletePlatform(platformId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, platformId);
  await deleteDoc(docRef);
}

/**
 * Generate a new random ID for a platform.
 */
export function generatePlatformId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
