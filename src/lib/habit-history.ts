import type { Habit, HabitCompletion, HabitDefinition } from "@/lib/types";

export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function habitCreatedOn(habit: Habit): string | null {
  return habit.createdOn || (habit.createdAt > 0 ? localDateString(new Date(habit.createdAt)) : null);
}

/** Resolve the definition that actually applied on a day, including deleted habits. */
export function habitForDate(habit: Habit, date: string): HabitDefinition | null {
  const boundary = Object.keys(habit.history ?? {}).sort().find((end) => date < end);
  const version = boundary ? habit.history![boundary] : habit;
  const createdOn = habitCreatedOn(version);
  if ((createdOn && date < createdOn) || (version.deletedOn && date >= version.deletedOn)) return null;
  return version;
}

export function isPaused(habit: HabitDefinition, date: string): boolean {
  return (habit.pausePeriods ?? []).some((period) => date >= period.startedOn && (period.endedOn === null || date <= period.endedOn));
}

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function scheduledOn(habit: HabitDefinition, date: string): boolean {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && localDateString(parsed) === date
    && !isPaused(habit, date) && habit[weekdays[parsed.getDay()]];
}

/** Use the same partial-progress calculation in the dashboard, chart and history. */
export function habitProgress(habit: HabitDefinition, completion?: HabitCompletion): number {
  if (completion?.completed) return 1;
  if (habit.completionType === "counter" && habit.counterGoal > 0) return Math.max(0, Math.min((completion?.counterValue ?? 0) / habit.counterGoal, 1));
  if (habit.completionType === "timer" && habit.timerGoalSeconds > 0) return Math.max(0, Math.min((completion?.timerSeconds ?? 0) / habit.timerGoalSeconds, 1));
  return 0;
}

export function habitDay(habits: Habit[], completions: HabitCompletion[], date: string) {
  const completionMap = new Map(completions.filter((item) => item.date === date).map((item) => [item.habitId, item]));
  const scheduled = habits.flatMap((habit) => {
    const version = habitForDate(habit, date);
    return version && (scheduledOn(version, date) || completionMap.get(habit.id)?.completed || completionMap.get(habit.id)?.includedInDay) ? [version] : [];
  });
  const progress = scheduled.reduce((sum, habit) => sum + habitProgress(habit, completionMap.get(habit.id)), 0);
  return {
    habits: scheduled,
    scheduled: scheduled.length,
    completed: scheduled.filter((habit) => completionMap.get(habit.id)?.completed).length,
    progress,
    percentage: scheduled.length ? Math.round(progress / scheduled.length * 100) : 0,
  };
}

/** Called with the latest persisted record inside a transaction, never a form's history. */
export function preserveHabitHistory(previous: Habit | null, proposed: Habit, today = localDateString()): Habit {
  if (previous?.deletedOn) throw new Error("This habit has been deleted. Reload before editing.");
  if (previous?.effectiveFrom && previous.effectiveFrom > today) throw new Error("Cannot change a habit before its latest saved day.");
  const history = { ...(previous?.history ?? {}) };
  const createdOn = previous ? habitCreatedOn(previous) : today;
  if (previous && (!previous.effectiveFrom || previous.effectiveFrom < today)) {
    const snapshot: HabitDefinition = { ...previous };
    delete (snapshot as Habit).history;
    history[today] = { ...snapshot, ...(createdOn ? { createdOn } : {}) };
  }
  return {
    ...proposed,
    createdAt: previous?.createdAt ?? Date.now(),
    ...(createdOn ? { createdOn } : {}),
    effectiveFrom: today,
    deletedOn: proposed.deletedOn ?? null,
    history,
  };
}

export function assertHabitDayWritable(date: string): void {
  if (date !== localDateString()) throw new Error("Past habit days are frozen. Only today can be changed.");
}
