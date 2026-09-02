import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { markHabitComplete } from "@/lib/habits-service";
import { getSettings } from "@/lib/settings-service";
import { completeWorkoutSession, createStretchRoutineSession, saveWorkoutSession } from "@/lib/workouts-service";
import { Habit, ScheduledCheckIn, ScheduledCheckInSourceType, StretchRoutineDefinition } from "@/lib/types";

function localDateString(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The selected time is scheduled for today when possible, otherwise tomorrow. */
export function nextDueAt(time: string, now = new Date()): number {
  const [hour, minute] = time.split(":").map(Number);
  const due = new Date(now);
  due.setHours(Number.isFinite(hour) ? hour : 20, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
  return due.getTime();
}

function checkInId(sourceType: ScheduledCheckInSourceType, sourceId: string): string {
  // There is one current check-in per item. Scheduling it again intentionally
  // replaces the previous pending time rather than producing duplicate prompts.
  return `${sourceType}_${sourceId}`;
}

async function saveScheduledCheckIn(checkIn: ScheduledCheckIn): Promise<void> {
  await setDoc(doc(db, "scheduled_check_ins", checkIn.id), checkIn);
}

export async function scheduleHabitCheckIn(habit: Habit, time: string): Promise<ScheduledCheckIn> {
  const dueAt = nextDueAt(time);
  const scheduledForDate = localDateString(dueAt);
  const now = Date.now();
  const checkIn: ScheduledCheckIn = { id: checkInId("habit", habit.id), userId: habit.userId, sourceType: "habit", sourceId: habit.id, sourceNameSnapshot: habit.name, scheduledForDate, dueAt, status: "pending", resolvedAt: null, createdAt: now, updatedAt: now };
  await saveScheduledCheckIn(checkIn);
  return checkIn;
}

export async function scheduleStretchRoutineCheckIn(routine: StretchRoutineDefinition, time: string): Promise<ScheduledCheckIn> {
  const dueAt = nextDueAt(time);
  const scheduledForDate = localDateString(dueAt);
  const now = Date.now();
  const checkIn: ScheduledCheckIn = { id: checkInId("stretch_routine", routine.id), userId: routine.userId, sourceType: "stretch_routine", sourceId: routine.id, sourceNameSnapshot: routine.name, scheduledForDate, dueAt, status: "pending", resolvedAt: null, stretchRoutineSnapshot: routine, createdAt: now, updatedAt: now };
  await saveScheduledCheckIn(checkIn);
  return checkIn;
}

function scheduledCheckInFromFirestore(data: Record<string, unknown>): ScheduledCheckIn {
  const sourceType = data.sourceType === "stretch_routine" ? "stretch_routine" : "habit";
  const status = data.status === "completed" || data.status === "missed" ? data.status : "pending";
  return {
    id: (data.id as string) ?? "", userId: (data.userId as string) ?? "", sourceType, sourceId: (data.sourceId as string) ?? "", sourceNameSnapshot: (data.sourceNameSnapshot as string) ?? "", scheduledForDate: (data.scheduledForDate as string) ?? "", dueAt: Number(data.dueAt ?? 0), status, resolvedAt: typeof data.resolvedAt === "number" ? data.resolvedAt : null,
    stretchRoutineSnapshot: data.stretchRoutineSnapshot as StretchRoutineDefinition | undefined,
    createdAt: Number(data.createdAt ?? 0), updatedAt: Number(data.updatedAt ?? 0),
  };
}

export function subscribeToScheduledCheckIns(userId: string, callback: (checkIns: ScheduledCheckIn[]) => void): () => void {
  return onSnapshot(query(collection(db, "scheduled_check_ins"), where("userId", "==", userId)), (snapshot) => {
    callback(snapshot.docs.map((item) => scheduledCheckInFromFirestore(item.data())).sort((a, b) => a.dueAt - b.dueAt));
  }, (error) => { console.error("subscribeToScheduledCheckIns error:", error); callback([]); });
}

/** Applies the user’s answer and creates the real completion record only when confirmed. */
export async function resolveScheduledCheckIn(checkIn: ScheduledCheckIn, status: Exclude<ScheduledCheckIn["status"], "pending">): Promise<void> {
  const now = Date.now();
  if (status === "completed") {
    if (checkIn.sourceType === "habit") {
      await markHabitComplete(checkIn.userId, checkIn.sourceId, checkIn.scheduledForDate);
    } else if (checkIn.stretchRoutineSnapshot) {
      const session = createStretchRoutineSession(checkIn.userId, checkIn.stretchRoutineSnapshot);
      const plannedDurationSeconds = checkIn.stretchRoutineSnapshot.stretches.reduce((total, stretch) => total + stretch.holdSeconds, 0);
      // A check-in may be answered the next morning. Record the routine against
      // the time it was due, not as an accidental all-night training session.
      const completed = {
        ...completeWorkoutSession(session),
        startedAt: checkIn.dueAt - plannedDurationSeconds * 1000,
        completedAt: checkIn.dueAt,
        completedDate: checkIn.scheduledForDate,
        durationSeconds: plannedDurationSeconds,
        updatedAt: now,
      };
      await saveWorkoutSession(completed);
      const settings = await getSettings(checkIn.userId);
      if (settings.stretchHabitMappingEnabled && settings.stretchHabitMappingHabitId) {
        await markHabitComplete(checkIn.userId, settings.stretchHabitMappingHabitId, checkIn.scheduledForDate);
      }
    }
  }
  await updateDoc(doc(db, "scheduled_check_ins", checkIn.id), { status, resolvedAt: now, updatedAt: now });
}
