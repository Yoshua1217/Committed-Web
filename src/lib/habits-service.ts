import { db } from "@/lib/firebase";
import { Habit, HabitCompletion } from "@/lib/types";
import { assertHabitDayWritable, habitDay, localDateString, preserveHabitHistory } from "@/lib/habit-history";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  runTransaction,
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
  return localDateString();
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
    ...(typeof data.createdOn === "string" ? { createdOn: data.createdOn } : {}),
    ...(typeof data.effectiveFrom === "string" ? { effectiveFrom: data.effectiveFrom } : {}),
    deletedOn: (data.deletedOn as string) ?? null,
    history: (data.history as Habit["history"]) ?? {},
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
  callback: (habits: Habit[]) => void,
  options: { includeDeleted?: boolean; onError?: () => void; keepPreviousOnError?: boolean } = {}
): () => void {
  const q = query(
    collection(db, "habits"),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const habits: Habit[] = snapshot.docs
      .map((d) => habitFromFirestore({ ...d.data(), id: d.id }))
      .filter((habit) => options.includeDeleted || !habit.deletedOn)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    callback(habits);
  }, (error) => {
    console.error("subscribeToHabits error:", error);
    options.onError?.();
    if (!options.keepPreviousOnError) callback([]);
  });
}

export function subscribeToCompletionsForDate(
  userId: string,
  date: string,
  callback: (completions: HabitCompletion[]) => void,
  onError?: () => void,
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
    if (onError) onError();
    else callback([]);
  });
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function habitToFirestore(habit: Habit) {
  return {
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
    ...(habit.createdOn ? { createdOn: habit.createdOn } : {}),
    effectiveFrom: habit.effectiveFrom,
    deletedOn: habit.deletedOn ?? null,
    history: habit.history ?? {},
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  };
}

/** New IDs have no owner to authorize a read under owner-only Firestore rules. */
export async function createHabit(habit: Habit): Promise<void> {
  const saved = preserveHabitHistory(null, { ...habit, deletedOn: null });
  await setDoc(doc(db, "habits", habit.id), habitToFirestore(saved));
}

export async function saveHabit(habit: Habit): Promise<void> {
  const ref = doc(db, "habits", habit.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists() ? habitFromFirestore({ ...snapshot.data(), id: snapshot.id }) : null;
    if (previous && previous.userId !== habit.userId) throw new Error("Habit owner cannot change.");
    const saved = preserveHabitHistory(previous, { ...habit, deletedOn: null });
    transaction.set(ref, habitToFirestore(saved));
  });
}

export async function deleteHabit(habitId: string): Promise<void> {
  const ref = doc(db, "habits", habitId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const previous = habitFromFirestore({ ...snapshot.data(), id: snapshot.id });
    if (previous.deletedOn) return;
    const saved = preserveHabitHistory(previous, { ...previous, deletedOn: todayString() });
    transaction.set(ref, habitToFirestore(saved));
  });
}

export async function saveCompletion(
  completion: HabitCompletion
): Promise<void> {
  assertHabitDayWritable(completion.date);
  const now = new Date();
  const dayEndsAt = completion.dayEndsAt ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  await setDoc(doc(db, "habit_completions", completion.id), {
    id: completion.id,
    habitId: completion.habitId,
    date: completion.date,
    completed: completion.completed,
    counterValue: completion.counterValue,
    timerSeconds: completion.timerSeconds,
    completedAt: completion.completedAt,
    userId: completion.userId,
    utcOffsetMinutes: -now.getTimezoneOffset(),
    dayEndsAt,
    includedInDay: completion.includedInDay ?? false,
    manualHistoryEdit: false,
  });
}

/** Explicit day-editor corrections change completions, never habit definitions. */
export async function editHabitCompletion(
  userId: string,
  habitId: string,
  date: string,
  completed: boolean,
  existingId?: string
): Promise<void> {
  const parsed = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || localDateString(parsed) !== date || date > todayString()) {
    throw new Error("Choose today or a past date.");
  }
  const habitRef = doc(db, "habits", habitId);
  const completionRef = doc(db, "habit_completions", existingId ?? `habit-day-${habitId}-${date}`);
  await runTransaction(db, async (transaction) => {
    const habitSnapshot = await transaction.get(habitRef);
    const completionSnapshot = await transaction.get(completionRef);
    if (!habitSnapshot.exists()) throw new Error("Habit history is unavailable.");
    const habit = habitFromFirestore({ ...habitSnapshot.data(), id: habitId });
    const existing = completionSnapshot.exists() ? completionSnapshot.data() as HabitCompletion : null;
    if (habit.userId !== userId || (existing && (existing.userId !== userId || existing.habitId !== habitId || existing.date !== date))) {
      throw new Error("Completion does not belong to this habit and day.");
    }
    // Uses the original schedule/targets even if the habit is now paused or deleted.
    if (!habitDay([habit], existing ? [existing] : [], date).scheduled) {
      throw new Error("This habit was not part of that day.");
    }
    const nextMidnight = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 1);
    transaction.set(completionRef, {
      id: existingId ?? `habit-day-${habitId}-${date}`,
      habitId, userId, date, completed,
      // Clearing completion must also clear a full counter/timer's percentage.
      counterValue: completed ? existing?.counterValue ?? 0 : 0,
      timerSeconds: completed ? existing?.timerSeconds ?? 0 : 0,
      completedAt: completed ? existing?.completedAt ?? Date.now() : null,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      dayEndsAt: existing?.dayEndsAt ?? nextMidnight.getTime(),
      includedInDay: true,
      manualHistoryEdit: true,
    });
  });
}

export function subscribeToCompletionHistory(userId: string, callback: (items: HabitCompletion[]) => void): () => void {
  return onSnapshot(query(collection(db, "habit_completions"), where("userId", "==", userId)),
    (snapshot) => callback(snapshot.docs.map((item) => item.data() as HabitCompletion)),
    (error) => console.error("Could not load habit history:", error));
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
  // Delayed check-ins and workout mappings must never rewrite a closed day.
  if (date !== todayString()) return null;
  const habitSnapshot = await getDoc(doc(db, "habits", habitId));
  if (!habitSnapshot.exists()) return null;

  const habit = habitFromFirestore(habitSnapshot.data() as Record<string, unknown>);
  if (habit.userId !== userId || habit.deletedOn) return null;

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
