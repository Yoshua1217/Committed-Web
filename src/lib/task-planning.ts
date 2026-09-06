import type { Project, Task } from "./types";

/** Project membership is the source of the goal, including an unset goal. */
export function taskGoalId(task: Pick<Task, "projectId" | "goalId">, projects: Project[]): string {
  const project = projects.find((item) => item.id === task.projectId);
  return project ? project.goalId : task.goalId;
}

export function effortMinutes(task: Task): number {
  const value = task.estimatedMinutes;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function taskBlock(task: Task): { start: Date; end: Date } | null {
  if (task.deleted || task.type !== "task" || task.startAllDay || !task.startDateTime || !effortMinutes(task)) return null;
  const start = new Date(task.startDateTime);
  if (!Number.isFinite(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + effortMinutes(task) * 60_000) };
}

export function isUnscheduledTask(task: Task): boolean {
  return task.type === "task" && !task.deleted && !task.completed && !task.archived && effortMinutes(task) > 0 && !taskBlock(task);
}

export function projectProgress(tasks: Task[]) {
  const members = tasks.filter((task) => !task.deleted);
  const totalMinutes = members.reduce((sum, task) => sum + effortMinutes(task), 0);
  const completedMinutes = members.reduce((sum, task) => sum + (task.completed ? effortMinutes(task) : 0), 0);
  return {
    totalMinutes,
    completedMinutes,
    percent: totalMinutes ? Math.round(completedMinutes / totalMinutes * 100) : 0,
    unestimated: members.filter((task) => !effortMinutes(task)).length,
    finished: members.length > 0 && members.every((task) => task.completed),
  };
}

export function formatEffort(minutes: number): string {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ");
}

export function localDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function taskCalendarFingerprint(task: Task): string {
  const block = taskBlock(task);
  return JSON.stringify([task.title, task.description, task.completed, task.archived, !!task.deleted, block?.start.toISOString() ?? null, block?.end.toISOString() ?? null]);
}
