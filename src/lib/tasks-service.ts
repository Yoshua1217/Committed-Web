import { db } from "@/lib/firebase";
import { Task } from "@/lib/types";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

const COLLECTION_NAME = "tasks";

function taskFromFirestore(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    userId: (data.userId as string) ?? "",
    type: (data.type as "todo" | "task") ?? "todo",
    title: (data.title as string) ?? "",
    description: (data.description as string) ?? "",
    goalId: (data.goalId as string) ?? "",
    dueDate: (data.dueDate as string) ?? null,
    notificationDateTime: (data.notificationDateTime as string) ?? null,
    completed: Boolean(data.completed ?? false),
    completedAt: data.completedAt != null ? Number(data.completedAt) : null,
    archived: Boolean(data.archived ?? false),
    sortOrder: Number(data.sortOrder ?? 0),
    createdAt: Number(data.createdAt ?? 0),
  };
}

export function subscribeToTasks(
  userId: string,
  callback: (tasks: Task[]) => void
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
    where("archived", "==", false)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks: Task[] = snapshot.docs
        .map((d) => taskFromFirestore(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      callback(tasks);
    },
    (error) => {
      console.error("subscribeToTasks error:", error);
      callback([]);
    }
  );
}

export async function saveTask(task: Task): Promise<void> {
  await setDoc(doc(db, COLLECTION_NAME, task.id), {
    userId: task.userId,
    type: task.type,
    title: task.title,
    description: task.description,
    goalId: task.goalId,
    dueDate: task.dueDate,
    notificationDateTime: task.notificationDateTime,
    completed: task.completed,
    completedAt: task.completedAt,
    archived: task.archived,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt,
  });
}

export async function completeTask(task: Task): Promise<void> {
  await saveTask({
    ...task,
    completed: true,
    completedAt: Date.now(),
    archived: task.type === "todo",
  });
}

export async function uncompleteTask(task: Task): Promise<void> {
  await saveTask({
    ...task,
    completed: false,
    completedAt: null,
    archived: false,
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION_NAME, taskId));
}
