import type { WorkoutDay, WorkoutDefinition } from "@/lib/types";

export const workoutDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function normalizeWorkoutTimes(days: WorkoutDay[], input: unknown): Partial<Record<WorkoutDay, string>> {
  const times = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(days.flatMap((day) => typeof times[day] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(times[day] as string) ? [[day, times[day]]] : []));
}
export function formatWorkoutTime(time?: string) {
  if (!time) return "Any time";
  const [hour, minute] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function workoutTimeOn(workout: WorkoutDefinition, date: string) {
  const day = (new Date(`${date}T12:00:00`).getDay() + 6) % 7 as WorkoutDay;
  if (!workout.scheduledDays.includes(day)) return undefined;
  const override = normalizeWorkoutTimeOverrides(workout.scheduledTimeOverrides)[date];
  if (override) return override;
  return normalizeWorkoutTimes(workout.scheduledDays, workout.scheduledStartTimes)[day];
}
export function normalizeWorkoutTimeOverrides(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).filter(([date, time]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(new Date(`${date}T12:00:00`).getTime()) && typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)));
}
export function compareWorkoutTimes(a: WorkoutDefinition, b: WorkoutDefinition, day: WorkoutDay, date?: string) {
  const first = (date ? workoutTimeOn(a, date) : normalizeWorkoutTimes(a.scheduledDays, a.scheduledStartTimes)[day]) ?? "99:99";
  const second = (date ? workoutTimeOn(b, date) : normalizeWorkoutTimes(b.scheduledDays, b.scheduledStartTimes)[day]) ?? "99:99";
  return first.localeCompare(second) || a.sortOrder - b.sortOrder;
}
export function workoutScheduleSummary(workout: Pick<WorkoutDefinition, "scheduledDays" | "scheduledStartTimes">) {
  const days = [...new Set(workout.scheduledDays)].sort((a, b) => a - b);
  if (!days.length) return "Not scheduled";
  const times = normalizeWorkoutTimes(days, workout.scheduledStartTimes);
  const same = days.every((day) => times[day] === times[days[0]]);
  return same ? `${days.map((day) => workoutDayNames[day].slice(0, 3)).join(", ")} · ${formatWorkoutTime(times[days[0]])}`
    : days.map((day) => `${workoutDayNames[day].slice(0, 3)} · ${formatWorkoutTime(times[day])}`).join(", ");
}
