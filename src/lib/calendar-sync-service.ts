import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

/**
 * Shared Google Calendar state.  It deliberately lives on the existing
 * userSettings document, which is already restricted to its owner in the
 * Firestore rules.  This avoids turning a per-device browser cache into the
 * source of truth for a signed-in account.
 */
const SETTINGS_COLLECTION = "userSettings";
const PREFERENCES_FIELD = "calendarSyncPreferences";
const CACHE_FIELD = "calendarSyncCache";
// Firestore documents have a 1 MiB ceiling. Leave substantial room for the
// rest of the user settings document and measure encoded bytes, not JS chars.
const MAX_CACHE_BYTES = 700_000;

/**
 * Google omits many optional fields. Object spreads and the cache compactor can
 * turn those omissions into explicit `undefined` values, which Firestore does
 * not accept. Calendar snapshots are JSON data, so a JSON round-trip is a
 * reliable way to remove undefined values at every nesting level.
 */
function firestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type SyncedGoogleCalendar = {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: "freeBusyReader" | "reader" | "writerWithoutPrivateAccess" | "writer" | "owner";
  timeZone?: string;
};

export type SyncedGoogleCalendarEvent = {
  id: string;
  summary?: string;
  etag?: string;
  status?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  description?: string;
  organizer?: { displayName?: string; email?: string; self?: boolean };
  creator?: { displayName?: string; email?: string; self?: boolean };
  attendees?: { displayName?: string; email?: string; responseStatus?: string; self?: boolean }[];
  hangoutLink?: string;
  htmlLink?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string; timeZone?: string };
  locked?: boolean;
  guestsCanModify?: boolean;
  conferenceData?: { entryPoints?: { uri?: string; label?: string; entryPointType?: string }[] };
  attachments?: { title?: string; fileUrl?: string }[];
  calendarId: string;
  color?: string;
};

export type GoogleCalendarCache = {
  calendars: SyncedGoogleCalendar[];
  events: SyncedGoogleCalendarEvent[];
  savedAt: number;
};

/**
 * These keys are intentionally feature based rather than tied to a screen.
 * Any app feature can persist the Google calendar it targets through this
 * shared record, so a mapping selected on one device is available everywhere.
 */
export type CalendarFeatureMappings = Record<string, string | null>;

export type CalendarSyncPreferences = {
  calendarOrder: string[];
  visibleCalendarIds: string[];
  featureCalendarMappings: CalendarFeatureMappings;
  updatedAt: number;
};

export const EMPTY_CALENDAR_SYNC_PREFERENCES: CalendarSyncPreferences = {
  calendarOrder: [],
  visibleCalendarIds: [],
  featureCalendarMappings: {},
  updatedAt: 0,
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function preferencesFromFirestore(data: Record<string, unknown>): CalendarSyncPreferences {
  const raw = data[PREFERENCES_FIELD] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return EMPTY_CALENDAR_SYNC_PREFERENCES;
  const mappings = raw.featureCalendarMappings;
  return {
    calendarOrder: isStringArray(raw.calendarOrder) ? raw.calendarOrder : [],
    visibleCalendarIds: isStringArray(raw.visibleCalendarIds) ? raw.visibleCalendarIds : [],
    featureCalendarMappings: mappings && typeof mappings === "object" && !Array.isArray(mappings)
      ? Object.fromEntries(Object.entries(mappings).filter(([, value]) => typeof value === "string" || value === null))
      : {},
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function cacheFromFirestore(data: Record<string, unknown>): GoogleCalendarCache | null {
  const raw = data[CACHE_FIELD] as GoogleCalendarCache | undefined;
  if (!raw || !Array.isArray(raw.calendars) || !Array.isArray(raw.events) || typeof raw.savedAt !== "number") return null;
  return raw;
}

function isCalendarCache(value: unknown): value is GoogleCalendarCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<GoogleCalendarCache>;
  return Array.isArray(cache.calendars) && Array.isArray(cache.events) && typeof cache.savedAt === "number";
}

/**
 * The Calendar screen writes its newest Google snapshot locally before the
 * cloud copy completes. Other features can use this for an immediate,
 * same-device handoff instead of briefly appearing disconnected.
 */
export function readLocalCalendarSyncCache(userId: string): GoogleCalendarCache | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`committed-google-calendar-cache:${userId}`) ?? "null");
    return isCalendarCache(value) ? value : null;
  } catch {
    return null;
  }
}

export function subscribeToCalendarSync(
  userId: string,
  callback: (preferences: CalendarSyncPreferences, cache: GoogleCalendarCache | null) => void,
): () => void {
  return onSnapshot(
    doc(db, SETTINGS_COLLECTION, userId),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() as Record<string, unknown> : {};
      callback(preferencesFromFirestore(data), cacheFromFirestore(data));
    },
    (error) => {
      console.error("subscribeToCalendarSync error:", error);
      callback(EMPTY_CALENDAR_SYNC_PREFERENCES, null);
    },
  );
}

export async function saveCalendarSyncPreferences(userId: string, preferences: Omit<CalendarSyncPreferences, "updatedAt">): Promise<void> {
  await setDoc(doc(db, SETTINGS_COLLECTION, userId), firestoreSafe({
    [PREFERENCES_FIELD]: {
      calendarOrder: [...preferences.calendarOrder],
      visibleCalendarIds: [...preferences.visibleCalendarIds],
      featureCalendarMappings: { ...preferences.featureCalendarMappings },
      updatedAt: Date.now(),
    },
  }), { merge: true });
}

function compactEvent(event: SyncedGoogleCalendarEvent): SyncedGoogleCalendarEvent {
  // Keep cross-device cache documents predictable. A fresh Google sync always
  // restores the untrimmed API payload on the device that requested it.
  return {
    ...event,
    summary: event.summary?.slice(0, 500),
    location: event.location?.slice(0, 1_000),
    description: event.description?.slice(0, 8_000),
    attendees: event.attendees?.slice(0, 100),
    recurrence: event.recurrence?.slice(0, 20),
    attachments: event.attachments?.slice(0, 30),
  };
}

function boundedCache(cache: GoogleCalendarCache): GoogleCalendarCache {
  const compacted: GoogleCalendarCache = {
    calendars: cache.calendars.map((calendar) => ({ ...calendar, summary: calendar.summary.slice(0, 500) })),
    events: cache.events.map(compactEvent),
    savedAt: cache.savedAt,
  };
  const acceptedEvents: SyncedGoogleCalendarEvent[] = [];
  for (const event of compacted.events) {
    const candidate = { ...compacted, events: [...acceptedEvents, event] };
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_CACHE_BYTES) break;
    acceptedEvents.push(event);
  }
  return { ...compacted, events: acceptedEvents };
}

/** Saves a portable, bounded calendar snapshot for other signed-in devices. */
export async function saveCalendarSyncCache(userId: string, cache: GoogleCalendarCache): Promise<void> {
  await setDoc(doc(db, SETTINGS_COLLECTION, userId), firestoreSafe({
    [CACHE_FIELD]: boundedCache(cache),
  }), { merge: true });
}

export async function saveCalendarFeatureMapping(
  userId: string,
  preferences: CalendarSyncPreferences,
  feature: string,
  calendarId: string | null,
): Promise<void> {
  await saveCalendarSyncPreferences(userId, {
    calendarOrder: preferences.calendarOrder,
    visibleCalendarIds: preferences.visibleCalendarIds,
    featureCalendarMappings: { ...preferences.featureCalendarMappings, [feature]: calendarId },
  });
}
