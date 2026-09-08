import { deleteField, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeWorkoutTimeOverrides } from "@/lib/workout-schedule";
import type { WorkoutDay, WorkoutDefinition } from "@/lib/types";

/** Update just one occurrence, without overwriting recurring times or other edits. */
export async function saveWorkoutOccurrenceTime(workout: WorkoutDefinition, date: string, time: string | null): Promise<void> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7 as WorkoutDay;
  if (!normalizeWorkoutTimeOverrides({ [date]: time ?? "00:00" })[date] || date < today || !workout.scheduledDays.includes(weekday)) throw new Error("This scheduled day is no longer available.");
  await updateDoc(doc(db, "workouts", workout.id), { [`scheduledTimeOverrides.${date}`]: time === null ? deleteField() : time, updatedAt: Date.now() });
}
