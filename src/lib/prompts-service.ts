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
import { Prompt } from "@/lib/types";

const COLLECTION_NAME = "prompts";

function promptToFirestoreMap(prompt: Prompt): Record<string, unknown> {
  return {
    title: prompt.title,
    description: prompt.description,
    promptText: prompt.promptText,
    labelIds: prompt.labelIds,
    platformId: prompt.platformId,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    userId: prompt.userId,
  };
}

function promptFromFirestoreMap(id: string, data: Record<string, unknown>): Prompt {
  return {
    id,
    title: data.title as string,
    description: data.description as string,
    promptText: data.promptText as string,
    labelIds: (data.labelIds as string[]) || [], // Provide default empty array just in case
    platformId: data.platformId as string,
    createdAt: data.createdAt as number,
    updatedAt: data.updatedAt as number,
    userId: data.userId as string,
  };
}

/**
 * Subscribes to the user's prompts.
 */
export function subscribeToPrompts(
  userId: string,
  callback: (prompts: Prompt[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const prompts: Prompt[] = snapshot.docs
      .map((doc) => promptFromFirestoreMap(doc.id, doc.data() as Record<string, unknown>))
      .sort((a, b) => b.updatedAt - a.updatedAt); // Most recently updated first
    callback(prompts);
  }, (error) => {
    console.error("subscribeToPrompts error:", error);
  });
}

/**
 * Creates or updates a prompt.
 */
export async function savePrompt(prompt: Prompt): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, prompt.id);
  const now = Date.now();
  // Ensure we always update the 'updatedAt' timestamp
  const promptToSave = { ...prompt, updatedAt: now };
  if (!promptToSave.createdAt) {
      promptToSave.createdAt = now;
  }
  await setDoc(docRef, promptToFirestoreMap(promptToSave), { merge: true });
}

/**
 * Deletes a prompt by ID.
 */
export async function deletePrompt(promptId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, promptId);
  await deleteDoc(docRef);
}

/**
 * Generate a new random ID for a prompt.
 */
export function generatePromptId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
