import { SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type GuestUpdateMode = "all" | "none";

export type GoogleEventWrite = {
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  description?: string;
  recurrence?: string[];
};

export class GoogleCalendarApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

async function calendarRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let detail = "Google Calendar could not save that change.";
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload.error?.message) detail = payload.error.message;
    } catch {
      // Google occasionally returns an empty error response.
    }
    throw new GoogleCalendarApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

function updatesQuery(sendUpdates: GuestUpdateMode) {
  return `sendUpdates=${encodeURIComponent(sendUpdates)}`;
}

export async function insertGoogleEvent(token: string, calendarId: string, event: GoogleEventWrite) {
  return calendarRequest<SyncedGoogleCalendarEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export async function patchGoogleEvent(
  token: string,
  calendarId: string,
  eventId: string,
  patch: Partial<GoogleEventWrite>,
  sendUpdates: GuestUpdateMode,
  etag?: string,
) {
  return calendarRequest<SyncedGoogleCalendarEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${updatesQuery(sendUpdates)}&conferenceDataVersion=1`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : undefined,
    body: JSON.stringify(patch),
  });
}

export async function getGoogleEvent(token: string, calendarId: string, eventId: string) {
  return calendarRequest<SyncedGoogleCalendarEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
}

export async function deleteGoogleEvent(
  token: string,
  calendarId: string,
  eventId: string,
  sendUpdates: GuestUpdateMode,
) {
  return calendarRequest<void>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${updatesQuery(sendUpdates)}`, {
    method: "DELETE",
  });
}

export async function moveGoogleEvent(
  token: string,
  calendarId: string,
  eventId: string,
  destinationCalendarId: string,
  sendUpdates: GuestUpdateMode,
) {
  return calendarRequest<SyncedGoogleCalendarEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(destinationCalendarId)}&${updatesQuery(sendUpdates)}`, {
    method: "POST",
  });
}
