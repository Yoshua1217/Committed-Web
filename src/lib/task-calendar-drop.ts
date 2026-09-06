import type { Task } from "@/lib/types";
import { effortMinutes, isUnscheduledTask, localDateTime } from "@/lib/task-planning";

export const TASK_DRAG_TYPE = "application/x-committed-task";

/** Coordinates are relative to the full, scrolled time grid, not its viewport. */
export function taskDropBlock(task: Task, days: Date[], bounds: { left: number; top: number; width: number }, x: number, y: number, hourHeight: number, snapMinutes = 15) {
  if (!isUnscheduledTask(task) || !days.length || bounds.width <= 0 || hourHeight <= 0 || snapMinutes <= 0) return null;
  const offsetX = x - bounds.left;
  const offsetY = y - bounds.top;
  if (!Number.isFinite(offsetX + offsetY) || offsetX < 0 || offsetX >= bounds.width || offsetY < 0 || offsetY >= 24 * hourHeight) return null;
  const day = days[Math.floor(offsetX / bounds.width * days.length)];
  const minutes = Math.min(1440 - snapMinutes, Math.round(offsetY / hourHeight * 60 / snapMinutes) * snapMinutes);
  const start = new Date(day);
  start.setHours(0, minutes, 0, 0);
  const end = new Date(start.getTime() + effortMinutes(task) * 60_000);
  return Number.isFinite(end.getTime()) ? { start, end } : null;
}

export function scheduleDroppedTask(task: Task, start: Date): Task {
  if (!isUnscheduledTask(task) || !Number.isFinite(start.getTime())) throw new Error("This task is no longer available to schedule. Refresh and try again.");
  return { ...task, startDateTime: localDateTime(start), startAllDay: false };
}
