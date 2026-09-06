import { db } from "@/lib/firebase";
import { Project, Task } from "@/lib/types";
import { subscribeToProjects } from "@/lib/projects-service";
import { taskGoalId } from "@/lib/task-planning";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  runTransaction,
} from "firebase/firestore";

const COLLECTION_NAME = "tasks";

export function taskFromFirestore(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    userId: (data.userId as string) ?? "",
    type: (data.type as "todo" | "task") ?? "todo",
    title: (data.title as string) ?? "",
    description: (data.description as string) ?? "",
    priority: (data.priority as Task["priority"]) ?? "medium",
    goalId: (data.goalId as string) ?? "",
    projectId: (data.projectId as string) ?? "",
    estimatedMinutes: typeof data.estimatedMinutes === "number" && data.estimatedMinutes > 0 ? data.estimatedMinutes : null,
    calendarLink: (data.calendarLink as Task["calendarLink"]) ?? null,
    deleted: Boolean(data.deleted),
    dueDate: (data.dueDate as string) ?? null,
    startDateTime: (data.startDateTime as string) ?? null,
    dueDateTime: (data.dueDateTime as string) ?? null,
    startAllDay: Boolean(data.startAllDay ?? data.allDay ?? false),
    dueAllDay: Boolean(data.dueAllDay ?? data.allDay ?? false),
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
  callback: (tasks: Task[]) => void,
  includeDeleted = false,
): () => void {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId)
  );

  let tasks: Task[] | null = null;
  let projects: Project[] = [];
  const publish = () => {
    if (tasks) callback(tasks.map((task) => ({ ...task, goalId: taskGoalId(task, projects) })));
  };
  const unsubscribeProjects = subscribeToProjects(userId, (items) => {
    projects = items;
    publish();
  });
  const unsubscribeTasks = onSnapshot(
    q,
    (snapshot) => {
      tasks = snapshot.docs
        .map((d) => taskFromFirestore(d.id, d.data() as Record<string, unknown>))
        .filter((task) => includeDeleted || !task.deleted)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      publish();
    },
    (error) => {
      console.error("subscribeToTasks error:", error);
      tasks = [];
      callback([]);
    }
  );
  return () => { unsubscribeTasks(); unsubscribeProjects(); };
}

export async function saveTask(task: Task): Promise<void> {
  if (task.estimatedMinutes != null && (!Number.isInteger(task.estimatedMinutes) || task.estimatedMinutes <= 0)) {
    throw new Error("Enter a positive whole number of minutes.");
  }
  const data = {
    userId: task.userId,
    type: task.type,
    title: task.title,
    description: task.description,
    priority: task.priority,
    goalId: task.goalId,
    projectId: task.projectId ?? "",
    estimatedMinutes: task.estimatedMinutes ?? null,
    dueDate: task.dueDate,
    startDateTime: task.startDateTime,
    dueDateTime: task.dueDateTime,
    startAllDay: task.startAllDay,
    dueAllDay: task.dueAllDay,
    notificationDateTime: task.notificationDateTime,
    completed: task.completed,
    completedAt: task.completedAt,
    archived: task.archived,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt,
  };
  const ref = doc(db, COLLECTION_NAME, task.id);
  if (task.projectId) {
    // Read inside the transaction so a project edit cannot leave a newly saved
    // task with an outdated goal. Every task entry point goes through here.
    await runTransaction(db, async (transaction) => {
      const project = await transaction.get(doc(db, "projects", task.projectId!));
      if (!project.exists() || project.data().userId !== task.userId) {
        throw new Error("This project is unavailable. Choose another project or remove the project selection.");
      }
      transaction.set(ref, { ...data, goalId: project.data().goalId ?? "" }, { merge: true });
    });
  } else {
    await setDoc(ref, data, { merge: true });
  }
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
  const ref = doc(db, COLLECTION_NAME, taskId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    // Keep linked deletions retryable, even when Google is disconnected.
    if (snapshot.data().calendarLink) transaction.update(ref, { deleted: true });
    else transaction.delete(ref);
  });
}
