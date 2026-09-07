import { SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type GuestUpdateMode = "all" | "none";

export type GoogleEventWrite = {
  id?: string;
  extendedProperties?: { private: Record<string, string> };
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
  const body = {
    ...patch,
    // PATCH merges nested objects. Clear the opposite time representation when
    // switching between timed and all-day events so Google never sees both.
    ...(patch.start ? { start: patch.start.date ? { ...patch.start, dateTime: null, timeZone: null } : { ...patch.start, date: null } } : {}),
    ...(patch.end ? { end: patch.end.date ? { ...patch.end, dateTime: null, timeZone: null } : { ...patch.end, date: null } } : {}),
  };
  return calendarRequest<SyncedGoogleCalendarEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${updatesQuery(sendUpdates)}&conferenceDataVersion=1`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : undefined,
    body: JSON.stringify(body),
  });
}

export async function getGoogleEvent(token: string, calendarId: string, eventId: string) {
  return calendarRequest<SyncedGoogleCalendarEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
}

export async function listGoogleEvents(token: string, calendarId: string, timeMin: string, timeMax: string, timeZone: string) {
  const events: SyncedGoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin, timeMax, timeZone, maxResults: "2500" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await calendarRequest<{ items?: SyncedGoogleCalendarEvent[]; nextPageToken?: string }>(token, `/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
    events.push(...(page.items ?? []).filter((event) => event.status !== "cancelled"));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
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
