import type { WorkoutDay, WorkoutDefinition, WorkoutSession, WorkoutSessionType } from "@/lib/types";
import { compareWorkoutTimes } from "@/lib/workout-schedule";

export type TrainingSection = "train" | "routines" | "history";
export type HistoryFilter = "all" | WorkoutSessionType;
export const trainingDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function localTrainingDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function sessionDay(session: WorkoutSession): string {
  return session.completedDate ?? (session.completedAt !== null ? localTrainingDate(new Date(session.completedAt)) : "");
}

export function sessionSeconds(session: WorkoutSession): number {
  const seconds = session.durationSeconds ?? ((session.completedAt ?? session.startedAt) - session.startedAt) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
}

export function trainingDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m` : `${seconds}s`;
}

export function trainingDateLabel(day: string): string {
  return day ? new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never performed";
}

export function weeklyTraining(sessions: WorkoutSession[], today: string) {
  const monday = new Date(`${today}T12:00:00`);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const start = localTrainingDate(monday);
  const week = sessions.filter((session) => session.status === "completed" && sessionDay(session) >= start && sessionDay(session) <= today);
  const totals = (type: WorkoutSessionType) => {
    const matches = week.filter((session) => session.sessionType === type);
    return { count: matches.length, seconds: matches.reduce((sum, session) => sum + sessionSeconds(session), 0) };
  };
  const lifting = week.filter((session) => session.sessionType === "workout");
  return {
    workouts: totals("workout"), activities: totals("activity"), stretching: totals("stretch"),
    prs: lifting.reduce((sum, session) => sum + session.personalRecords.length, 0),
    days: trainingDays.map((name, index) => {
      const date = new Date(monday); date.setDate(date.getDate() + index);
      const day = localTrainingDate(date);
      return { name, day, today: day === today, count: lifting.filter((session) => sessionDay(session) === day).length };
    }),
  };
}

export function latestRoutineSessions(sessions: WorkoutSession[]): Record<string, WorkoutSession> {
  const latest: Record<string, WorkoutSession> = {};
  for (const session of sessions.filter((item) => item.status === "completed").slice().sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))) {
    const key = `${session.sessionType}:${session.workoutId}`;
    latest[key] ??= session;
  }
  return latest;
}

export function todayTraining(workouts: WorkoutDefinition[], sessions: WorkoutSession[], today: string) {
  const weekday = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const todayWorkouts = workouts.filter((workout) => workout.scheduledDays.some((day) => day === weekday))
    .slice().sort((a, b) => compareWorkoutTimes(a, b, weekday as WorkoutDay, today))
    .map((workout) => ({ workout, completed: sessions.some((session) => session.status === "completed" && session.sessionType === "workout" && session.workoutId === workout.id && sessionDay(session) === today) }));
  const last = latestRoutineSessions(sessions);
  const recent = workouts.filter((workout) => last[`workout:${workout.id}`]).slice()
    .sort((a, b) => last[`workout:${b.id}`].completedAt! - last[`workout:${a.id}`].completedAt!).slice(0, 3);
  return { todayWorkouts, recent, last };
}

export function filterTrainingHistory(sessions: WorkoutSession[], query: string, type: HistoryFilter, prsOnly: boolean): WorkoutSession[] {
  const search = query.trim().toLocaleLowerCase();
  return sessions.filter((session) => session.status === "completed"
    && (type === "all" || session.sessionType === type)
    && (!prsOnly || (session.sessionType === "workout" && session.personalRecords.length > 0))
    && (!search || [session.workoutNameSnapshot, ...session.exercises.map((exercise) => exercise.exerciseNameSnapshot), ...(session.stretches ?? []).map((stretch) => stretch.stretchNameSnapshot)].join(" ").toLocaleLowerCase().includes(search)))
    .slice().sort((a, b) => sessionDay(b).localeCompare(sessionDay(a)) || (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

/** Use the performed date so backfilled sessions and the next day retain the correct recap. */
export function latestWorkoutRecap(sessions: WorkoutSession[], workoutId: string, today: string) {
  return filterTrainingHistory(sessions, "", "workout", false)
    .find((session) => session.workoutId === workoutId && sessionDay(session) <= today);
}

export function groupTrainingHistory(sessions: WorkoutSession[]) {
  const groups = new Map<string, WorkoutSession[]>();
  for (const session of sessions) {
    const month = sessionDay(session).slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month)!.push(session);
  }
  return [...groups].map(([month, items]) => ({ month, label: month ? new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Undated", sessions: items }));
}

/** First scheduled strength workout still ahead, including unfinished work today. */
export function nextScheduledWorkout(workouts: WorkoutDefinition[], sessions: WorkoutSession[], today: string) {
  const ordered = workouts.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  for (let offset = 0; offset <= 7; offset++) {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() + offset);
    const day = localTrainingDate(date);
    const weekday = (date.getDay() + 6) % 7;
    const workout = ordered.slice().sort((a, b) => compareWorkoutTimes(a, b, weekday as WorkoutDay, day)).find((routine) => routine.scheduledDays.some((scheduledDay) => scheduledDay === weekday)
      && !sessions.some((session) => session.status === "completed" && session.sessionType === "workout" && session.workoutId === routine.id && sessionDay(session) === day));
    if (workout) return { workout, day, label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) };
  }
  return null;
}

export function latestTrainingRecords(sessions: WorkoutSession[]) {
  const seen = new Set<string>();
  return filterTrainingHistory(sessions, "", "workout", true).flatMap((session) => session.personalRecords.flatMap((record) => {
    if (seen.has(record.exerciseId)) return [];
    seen.add(record.exerciseId);
    return [{ record, session }];
  })).slice(0, 3);
}

/** Keep coaching available on rest days, without changing the saved schedule. */
export function trainingPreview(workouts: WorkoutDefinition[], sessions: WorkoutSession[], today: string, selectedId = "") {
  const upcoming = nextScheduledWorkout(workouts, sessions, today);
  const selected = workouts.find((workout) => workout.id === selectedId);
  const overview = todayTraining(workouts, sessions, today);
  const scheduledToday = overview.todayWorkouts.find((item) => !item.completed) ?? overview.todayWorkouts[0];
  const workout = selected ?? scheduledToday?.workout ?? upcoming?.workout ?? overview.recent[0]
    ?? workouts.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!workout) return null;
  return { workout, label: workout.id === upcoming?.workout.id ? `Up next · ${upcoming.label}` : selected ? "Selected workout" : "Your next session" };
}
