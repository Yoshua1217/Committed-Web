import type { Habit, HabitCompletion, Task } from "@/lib/types";

export interface Reminder {
  key: string;
  kind: "habit" | "task";
  title: string;
  time: string;
  days: number[];
  pauses: Habit["pausePeriods"];
  completedDates: string[];
  createdOn: string;
}

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const clockTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Send calendar rules, not a finite queue: Android schedules the next occurrence itself. */
export function buildReminderPlan(habits: Habit[], tasks: Task[], completions: HabitCompletion[]): Reminder[] {
  const reminders: Reminder[] = [];
  for (const habit of habits) {
    if (habit.deletedOn || !habit.reminderTime || !clockTime.test(habit.reminderTime)) continue;
    const days = weekdays.flatMap((day, index) => habit[day] ? [index + 1] : []);
    if (!days.length) continue;
    reminders.push({
      key: `habit:${habit.id}`, kind: "habit", title: habit.name, time: habit.reminderTime,
      days, pauses: habit.pausePeriods ?? [], createdOn: habit.createdOn ?? "",
      completedDates: completions.filter((item) => item.habitId === habit.id && (item.completed
        || (habit.completionType === "counter" && habit.counterGoal > 0 && item.counterValue >= habit.counterGoal)
        || (habit.completionType === "timer" && habit.timerGoalSeconds > 0 && item.timerSeconds >= habit.timerGoalSeconds)))
        .map((item) => item.date).sort(),
    });
  }
  for (const task of tasks) {
    if (task.type !== "task" || task.deleted || task.completed || task.archived || !task.notificationDateTime) continue;
    const time = task.notificationDateTime;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(time) || !clockTime.test(time.slice(11)) || !Number.isFinite(new Date(time).getTime())) continue;
    reminders.push({ key: `task:${task.id}`, kind: "task", title: task.title, time, days: [], pauses: [], completedDates: [], createdOn: "" });
  }
  return reminders.sort((a, b) => a.key.localeCompare(b.key));
}
