import { db } from "@/lib/firebase";
import { Habit, HabitCompletion } from "@/lib/types";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function generateId(): string {
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

export function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Firestore → Habit converter (matches Android's fromFirestoreMap defaults)
// ---------------------------------------------------------------------------

function habitFromFirestore(data: Record<string, unknown>): Habit {
  return {
    id: (data.id as string) ?? "",
    bucketId: (data.bucketId as string) ?? "",
    goalId: (data.goalId as string) ?? "",
    name: (data.name as string) ?? "",
    iconName: (data.iconName as string) ?? "",
    completionType: (data.completionType as Habit["completionType"]) ?? "checkbox",
    counterIncrement: Number(data.counterIncrement ?? 1),
    counterGoal: Number(data.counterGoal ?? 10),
    timerGoalSeconds: Number(data.timerGoalSeconds ?? 300),
    // Default to true (matches Android's Habit data class defaults)
    monday: data.monday !== false && data.monday !== 0,
    tuesday: data.tuesday !== false && data.tuesday !== 0,
    wednesday: data.wednesday !== false && data.wednesday !== 0,
    thursday: data.thursday !== false && data.thursday !== 0,
    friday: data.friday !== false && data.friday !== 0,
    saturday: data.saturday !== false && data.saturday !== 0,
    sunday: data.sunday !== false && data.sunday !== 0,
    reminderTime: (data.reminderTime as string) ?? null,
    sortOrder: Number(data.sortOrder ?? 0),
    createdAt: Number(data.createdAt ?? 0),
    userId: (data.userId as string) ?? "",
    pausePeriods: Array.isArray(data.pausePeriods)
      ? (data.pausePeriods as Habit["pausePeriods"])
      : [],
  };
}

// ---------------------------------------------------------------------------
// Real-time subscriptions
// ---------------------------------------------------------------------------

export function subscribeToHabits(
  userId: string,
  callback: (habits: Habit[]) => void
): () => void {
  const q = query(
    collection(db, "habits"),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const habits: Habit[] = snapshot.docs
      .map((d) => habitFromFirestore(d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    callback(habits);
  }, (error) => {
    console.error("subscribeToHabits error:", error);
    callback([]);
  });
}

export function subscribeToCompletionsForDate(
  userId: string,
  date: string,
  callback: (completions: HabitCompletion[]) => void
): () => void {
  const q = query(
    collection(db, "habit_completions"),
    where("userId", "==", userId),
    where("date", "==", date)
  );

  return onSnapshot(q, (snapshot) => {
    const completions: HabitCompletion[] = snapshot.docs.map(
      (d) => d.data() as HabitCompletion
    );
    callback(completions);
  }, (error) => {
    console.error("subscribeToCompletionsForDate error:", error);
    callback([]);
  });
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function saveHabit(habit: Habit): Promise<void> {
  // Store all fields including id — matches Android's toFirestoreMap()
  await setDoc(doc(db, "habits", habit.id), {
    id: habit.id,
    bucketId: habit.bucketId,
    goalId: habit.goalId,
    name: habit.name,
    iconName: habit.iconName,
    completionType: habit.completionType,
    counterIncrement: habit.counterIncrement,
    counterGoal: habit.counterGoal,
    timerGoalSeconds: habit.timerGoalSeconds,
    monday: habit.monday,
    tuesday: habit.tuesday,
    wednesday: habit.wednesday,
    thursday: habit.thursday,
    friday: habit.friday,
    saturday: habit.saturday,
    sunday: habit.sunday,
    reminderTime: habit.reminderTime ?? null,
    sortOrder: habit.sortOrder,
    createdAt: habit.createdAt,
    userId: habit.userId,
    pausePeriods: habit.pausePeriods ?? [],
  });
}

export async function deleteHabit(habitId: string): Promise<void> {
  await deleteDoc(doc(db, "habits", habitId));
}

export async function saveCompletion(
  completion: HabitCompletion
): Promise<void> {
  await setDoc(doc(db, "habit_completions", completion.id), {
    id: completion.id,
    habitId: completion.habitId,
    date: completion.date,
    completed: completion.completed,
    counterValue: completion.counterValue,
    timerSeconds: completion.timerSeconds,
    completedAt: completion.completedAt,
    userId: completion.userId,
  });
}

// ---------------------------------------------------------------------------
// Completion logic (matches Android behaviour)
// ---------------------------------------------------------------------------

function buildCompletion(
  habit: Habit,
  date: string,
  existing: HabitCompletion | null,
  overrides: Partial<HabitCompletion>
): HabitCompletion {
  const base: HabitCompletion = existing ?? {
    id: generateId(),
    habitId: habit.id,
    date,
    completed: false,
    counterValue: 0,
    timerSeconds: 0,
    completedAt: null,
    userId: habit.userId,
  };
  return { ...base, ...overrides };
}

export async function toggleCheckbox(
  habit: Habit,
  date: string,
  existing: HabitCompletion | null
): Promise<HabitCompletion> {
  const wasCompleted = existing?.completed ?? false;
  const nowCompleted = !wasCompleted;
  const completion = buildCompletion(habit, date, existing, {
    completed: nowCompleted,
    completedAt: nowCompleted ? Date.now() : null,
  });
  await saveCompletion(completion);
  return completion;
}

export async function incrementCounter(
  habit: Habit,
  date: string,
  existing: HabitCompletion | null
): Promise<HabitCompletion> {
  const currentValue = (existing?.counterValue ?? 0) + habit.counterIncrement;
  const nowCompleted = currentValue >= habit.counterGoal;
  const completedAt =
    nowCompleted && !(existing?.completed)
      ? Date.now()
      : existing?.completedAt ?? null;

  const completion = buildCompletion(habit, date, existing, {
    counterValue: currentValue,
    completed: nowCompleted,
    completedAt,
  });
  await saveCompletion(completion);
  return completion;
}

export async function addTimerSeconds(
  habit: Habit,
  date: string,
  existing: HabitCompletion | null,
  seconds: number
): Promise<HabitCompletion> {
  const currentSeconds = (existing?.timerSeconds ?? 0) + seconds;
  const nowCompleted = currentSeconds >= habit.timerGoalSeconds;
  const completedAt =
    nowCompleted && !(existing?.completed)
      ? Date.now()
      : existing?.completedAt ?? null;

  const completion = buildCompletion(habit, date, existing, {
    timerSeconds: currentSeconds,
    completed: nowCompleted,
    completedAt,
  });
  await saveCompletion(completion);
  return completion;
}

// ---------------------------------------------------------------------------
// One-time queries
// ---------------------------------------------------------------------------

export async function getCompletionsForDate(
  userId: string,
  date: string
): Promise<HabitCompletion[]> {
  const q = query(
    collection(db, "habit_completions"),
    where("userId", "==", userId),
    where("date", "==", date)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as HabitCompletion);
}

/** Marks a habit complete without changing existing counter or timer progress. */
export async function markHabitComplete(
  userId: string,
  habitId: string,
  date: string
): Promise<HabitCompletion | null> {
  const habitSnapshot = await getDoc(doc(db, "habits", habitId));
  if (!habitSnapshot.exists()) return null;

  const habit = habitFromFirestore(habitSnapshot.data() as Record<string, unknown>);
  if (habit.userId !== userId) return null;

  const existing = (await getCompletionsForDate(userId, date))
    .find((completion) => completion.habitId === habitId) ?? null;
  // A stable ID prevents two near-simultaneous completed sessions from creating
  // duplicate mapped completions when the habit has no completion yet.
  const mappedBase = existing ?? {
    id: `workout-map-${habitId}-${date}`,
    habitId,
    date,
    completed: false,
    counterValue: 0,
    timerSeconds: 0,
    completedAt: null,
    userId,
  };
  const completion = buildCompletion(habit, date, mappedBase, {
    completed: true,
    completedAt: existing?.completedAt ?? Date.now(),
  });
  await saveCompletion(completion);
  return completion;
}

/** Fetch a user's completion history for progress and reporting views. */
export async function getCompletionsForUser(
  userId: string
): Promise<HabitCompletion[]> {
  const q = query(
    collection(db, "habit_completions"),
    where("userId", "==", userId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as HabitCompletion);
}

export async function getCompletionsForHabit(
  userId: string,
  habitId: string
): Promise<HabitCompletion[]> {
  const q = query(
    collection(db, "habit_completions"),
    where("userId", "==", userId),
    where("habitId", "==", habitId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as HabitCompletion);
}
