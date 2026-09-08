import type { Task } from "./types";
import type { SyncedGoogleCalendarEvent } from "./calendar-sync-service";
import type { MarkdownNote } from "./notes-service";

function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function homeTasks(tasks: Task[], today: string) {
  const pending = tasks.filter((task) => !task.completed && !task.archived && !task.deleted);
  const due = (task: Task) => dateKey(task.dueDateTime || task.dueDate);
  const priority = { critical: 0, high: 1, medium: 2, low: 3 };
  const sort = (a: Task, b: Task) => (a.dueDateTime || a.dueDate || a.startDateTime || today).localeCompare(b.dueDateTime || b.dueDate || b.startDateTime || today)
    || priority[a.priority] - priority[b.priority] || a.sortOrder - b.sortOrder;
  const overdue = pending.filter((task) => due(task) && due(task) < today).sort(sort);
  const overdueIds = new Set(overdue.map((task) => task.id));
  const scheduled = pending.filter((task) => !overdueIds.has(task.id) && (due(task) === today || dateKey(task.startDateTime) === today)).sort(sort);
  return { overdue, today: scheduled };
}

/** Google all-day end dates are exclusive; timed events may cross midnight. */
export function homeEvents(events: SyncedGoogleCalendarEvent[], calendarId: string | null, today: string) {
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const seen = new Set<string>();
  return events.filter((event) => {
    if (!calendarId || event.calendarId !== calendarId || event.status === "cancelled" || seen.has(event.id)) return false;
    seen.add(event.id);
    if (event.start?.date) return event.start.date <= today && (event.end?.date ? event.end.date > today : event.start.date === today);
    const from = new Date(event.start?.dateTime ?? "").getTime();
    const to = new Date(event.end?.dateTime ?? event.start?.dateTime ?? "").getTime();
    return from < end.getTime() && (to > start.getTime() || from === to && from >= start.getTime());
  }).sort((a, b) => Number(!a.start?.date) - Number(!b.start?.date)
    || (a.start?.date && b.start?.date ? a.start.date.localeCompare(b.start.date)
      : new Date(a.start?.dateTime ?? "").getTime() - new Date(b.start?.dateTime ?? "").getTime()));
}

export function recentHomeNotes(notes: MarkdownNote[]) {
  return notes.slice().sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, 5);
}
