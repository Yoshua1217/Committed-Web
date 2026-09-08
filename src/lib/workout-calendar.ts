import type { WorkoutDefinition, WorkoutSession } from "@/lib/types";
import type { SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";
import { estimateWorkoutMinutes } from "@/lib/workout-coaching";
import { workoutTimeOn } from "@/lib/workout-schedule";

export const WORKOUT_CALENDAR_ID = "committed-workouts";
export type WorkoutOccurrence = SyncedGoogleCalendarEvent & { workoutId: string; scheduledDate: string; estimatedMinutes: number; completed: boolean };
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

/** Derived local occurrences only: never passed to Google or persisted as events. */
export function workoutCalendarOccurrences(workouts: WorkoutDefinition[], sessions: WorkoutSession[], from: Date, through: Date): WorkoutOccurrence[] {
  const result: WorkoutOccurrence[] = [];
  // Include earlier starts whose estimated blocks overlap the visible range.
  const longest = Math.max(1, ...workouts.map((workout) => estimateWorkoutMinutes(workout, sessions)));
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() - Math.ceil(longest / 1440), 12);
  const last = new Date(through.getFullYear(), through.getMonth(), through.getDate(), 12);
  const boundary = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (; date <= last; date.setDate(date.getDate() + 1)) {
    const key = dayKey(date);
    for (const workout of workouts) {
      if (!workout.scheduledDays.includes((date.getDay() + 6) % 7 as 0 | 1 | 2 | 3 | 4 | 5 | 6)) continue;
      const time = workoutTimeOn(workout, key);
      const estimatedMinutes = estimateWorkoutMinutes(workout, sessions);
      const start = time ? new Date(`${key}T${time}:00`) : new Date(`${key}T00:00:00`);
      const end = time ? new Date(start.getTime() + estimatedMinutes * 60_000) : new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      if (end <= boundary) continue;
      const completed = sessions.some((session) => session.userId === workout.userId && session.sessionType === "workout" && session.status === "completed" && session.workoutId === workout.id && (session.completedDate ?? (session.completedAt ? dayKey(new Date(session.completedAt)) : "")) === key);
      result.push({ id: `committed-workout:${workout.id}:${key}`, calendarId: WORKOUT_CALENDAR_ID, workoutId: workout.id, scheduledDate: key, estimatedMinutes, completed, locked: true,
        summary: `${completed ? "✓ " : ""}${workout.name}`, description: workout.description, color: completed ? "#53785f" : "#659772",
        start: time ? { dateTime: start.toISOString() } : { date: key }, end: time ? { dateTime: end.toISOString() } : { date: dayKey(end) } });
    }
  }
  return result;
}
