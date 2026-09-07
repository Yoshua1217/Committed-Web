import type { CalendarEventDraft } from "@/components/calendar-event-editor-modal";
import type { GoogleEventWrite } from "@/lib/google-calendar-api";
import type { SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";
import { zonedDateTime } from "@/lib/calendar-recurrence";

export function eventWriteFromDraft(draft: CalendarEventDraft): GoogleEventWrite {
  const common = { summary: draft.summary, location: draft.location, description: draft.description, ...(draft.recurrence !== undefined ? { recurrence: draft.recurrence } : {}) };
  if (draft.allDay) {
    const end = new Date(`${draft.endDate}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    if (draft.endDate < draft.startDate) throw new Error("The event must end after it starts.");
    return { ...common, start: { date: draft.startDate }, end: { date: end.toISOString().slice(0, 10) } };
  }
  const start = zonedDateTime(draft.startDate, draft.startTime, draft.timeZone);
  const end = zonedDateTime(draft.endDate, draft.endTime, draft.timeZone);
  if (end <= start) throw new Error("The event must end after it starts.");
  return { ...common, start: { dateTime: start.toISOString(), timeZone: draft.timeZone }, end: { dateTime: end.toISOString(), timeZone: draft.timeZone } };
}

export function eventPatchFromDraft(draft: CalendarEventDraft, event: SyncedGoogleCalendarEvent): Partial<GoogleEventWrite> {
  const patch: Partial<GoogleEventWrite> = eventWriteFromDraft(draft);
  // Omitting untouched times preserves Google's original timezone/precision and
  // prevents instance-to-series edits from shifting the parent start date.
  for (const key of ["start", "end"] as const) {
    const original = event[key];
    const proposed = patch[key];
    if (original?.date && original.date === proposed?.date || original?.dateTime && proposed?.dateTime && Math.floor(Date.parse(original.dateTime) / 60_000) === Math.floor(Date.parse(proposed.dateTime) / 60_000)) delete patch[key];
  }
  if (event.recurringEventId) delete patch.recurrence;
  return patch;
}
