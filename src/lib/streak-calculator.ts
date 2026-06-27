import { Habit, HabitCompletion, StreakInfo } from "@/lib/types";

/**
 * Check if a habit is scheduled for a given day of the week.
 * @param habit The habit to check
 * @param dayOfWeek 1=Monday, 2=Tuesday, ..., 7=Sunday
 */
export function isScheduledForDay(habit: Habit, dayOfWeek: number): boolean {
  switch (dayOfWeek) {
    case 1: return habit.monday;
    case 2: return habit.tuesday;
    case 3: return habit.wednesday;
    case 4: return habit.thursday;
    case 5: return habit.friday;
    case 6: return habit.saturday;
    case 7: return habit.sunday;
    default: return false;
  }
}

export function isHabitPausedOnDate(habit: Habit, date: string): boolean {
  return (habit.pausePeriods ?? []).some(
    (period) => date >= period.startedOn && (period.endedOn === null || date <= period.endedOn)
  );
}

export function isScheduledForDate(habit: Habit, date: string): boolean {
  const parsed = parseDate(date);
  if (!parsed || isHabitPausedOnDate(habit, date)) return false;
  return isScheduledForDay(habit, jsDayToIsoDayOfWeek(parsed.getDay()));
}

/**
 * Convert a JavaScript Date.getDay() value (0=Sunday, 1=Monday, ..., 6=Saturday)
 * to 1=Monday, 2=Tuesday, ..., 7=Sunday.
 */
function jsDayToIsoDayOfWeek(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Format a Date as "YYYY-MM-DD".
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Create a local-midnight Date from a "YYYY-MM-DD" string.
 * Returns null if the string cannot be parsed.
 */
function parseDate(dateStr: string): Date | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m, d);
}

/**
 * Subtract a number of days from a Date, returning a new Date at local midnight.
 */
function subtractDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - days);
  return result;
}

/**
 * Calculate streak / anti-streak for a habit.
 *
 * This is a direct port of the Android app's Kotlin streak calculation logic.
 * It must produce identical results.
 *
 * @param habit The habit (includes schedule flags)
 * @param completions Pre-fetched completions for this habit
 * @returns StreakInfo with currentStreak and currentAntiStreak
 */
export function calculateStreak(
  habit: Habit,
  completions: HabitCompletion[]
): StreakInfo {
  if (completions.length === 0) {
    return { currentStreak: 0, currentAntiStreak: 0 };
  }

  // Build a lookup map keyed by date string
  const completionMap = new Map<string, HabitCompletion>();
  for (const c of completions) {
    completionMap.set(c.date, c);
  }

  let streak = 0;
  let antiStreak = 0;
  let foundFirst = false;
  let isStreaking = true;

  // Start from yesterday (today isn't over yet)
  const today = new Date();
  let date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  date = subtractDays(date, 1);

  const limit = subtractDays(date, 365);

  // Find the earliest completion date
  let earliestDate: Date | null = null;
  for (const c of completions) {
    const parsed = parseDate(c.date);
    if (parsed !== null) {
      if (earliestDate === null || parsed < earliestDate) {
        earliestDate = parsed;
      }
    }
  }
  if (earliestDate === null) {
    earliestDate = date;
  }

  // Walk backward day by day
  while (date > limit && date >= earliestDate) {
    const dateStr = formatDate(date);
    if (!isScheduledForDate(habit, dateStr)) {
      date = subtractDays(date, 1);
      continue;
    }
    const completion = completionMap.get(dateStr);
    const wasCompleted = completion?.completed === true;

    if (!foundFirst) {
      foundFirst = true;
      isStreaking = wasCompleted;
    }

    if (isStreaking) {
      if (wasCompleted) {
        streak++;
      } else {
        break;
      }
    } else {
      if (!wasCompleted) {
        antiStreak++;
      } else {
        break;
      }
    }

    date = subtractDays(date, 1);
  }

  if (isStreaking) {
    return { currentStreak: streak, currentAntiStreak: 0 };
  } else {
    return { currentStreak: 0, currentAntiStreak: antiStreak };
  }
}
