import { db } from "@/lib/firebase";
import { Idea } from "@/lib/types";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const COLLECTION_NAME = "ideas";

function ideaFromFirestore(id: string, data: Record<string, unknown>): Idea {
  return {
    id,
    userId: (data.userId as string) ?? "",
    text: (data.text as string) ?? "",
    starred: Boolean(data.starred ?? false),
    completed: Boolean(data.completed ?? false),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? data.createdAt ?? 0),
  };
}

function generateIdeaId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function subscribeToIdeas(
  userId: string,
  callback: (ideas: Idea[]) => void
): () => void {
  const ideasQuery = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  return onSnapshot(
    ideasQuery,
    (snapshot) => {
      const ideas = snapshot.docs
        .map((ideaDocument) => ideaFromFirestore(
          ideaDocument.id,
          ideaDocument.data() as Record<string, unknown>
        ))
        .sort((first, second) => first.createdAt - second.createdAt);
      callback(ideas);
    },
    (error) => {
      console.error("subscribeToIdeas error:", error);
      callback([]);
    }
  );
}

export async function createIdea(
  userId: string,
  text: string,
  starred: boolean
): Promise<Idea> {
  const now = Date.now();
  const idea: Idea = {
    id: generateIdeaId(),
    userId,
    text: text.trim(),
    starred,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, COLLECTION_NAME, idea.id), idea);
  return idea;
}

export async function setIdeaStarred(idea: Idea, starred: boolean): Promise<void> {
  await updateDoc(doc(db, COLLECTION_NAME, idea.id), {
    starred,
    updatedAt: Date.now(),
  });
}

export async function setIdeaCompleted(idea: Idea, completed: boolean): Promise<void> {
  await updateDoc(doc(db, COLLECTION_NAME, idea.id), {
    completed,
    updatedAt: Date.now(),
  });
}
