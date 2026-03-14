import { db } from "@/lib/firebase";
import { Goal } from "@/lib/types";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

const COLLECTION_NAME = "goals";

function goalFromFirestore(id: string, data: Record<string, unknown>): Goal {
  return {
    id,
    bucketId: (data.bucketId as string) ?? "",
    name: (data.name as string) ?? "",
    iconName: (data.iconName as string) ?? "Flag",
    description: (data.description as string) ?? "",
    sortOrder: Number(data.sortOrder ?? 0),
    createdAt: Number(data.createdAt ?? 0),
    userId: (data.userId as string) ?? "",
  };
}

export function subscribeToGoals(
  userId: string,
  callback: (goals: Goal[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const goals: Goal[] = snapshot.docs
      .map((d) => goalFromFirestore(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    callback(goals);
  }, (error) => {
    console.error("subscribeToGoals error:", error);
    callback([]);
  });
}

export async function saveGoal(goal: Goal): Promise<void> {
  await setDoc(doc(db, COLLECTION_NAME, goal.id), {
    bucketId: goal.bucketId,
    name: goal.name,
    iconName: goal.iconName,
    description: goal.description,
    sortOrder: goal.sortOrder,
    createdAt: goal.createdAt,
    userId: goal.userId,
  });
}

export async function deleteGoal(goalId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION_NAME, goalId));
}
