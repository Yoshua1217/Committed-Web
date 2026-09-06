"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Task, Project, Goal, Bucket } from "@/lib/types";
import { saveTask, subscribeToTasks } from "@/lib/tasks-service";
import { subscribeToProjects } from "@/lib/projects-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { taskBlock, localDateTime, taskCalendarFingerprint, isUnscheduledTask } from "@/lib/task-planning";
import { syncTaskCalendar } from "@/lib/task-calendar-sync";
import CalendarTaskPlanner, { TaskTimeBlockDialog } from "@/components/calendar-task-planner";
import TaskEditModal from "@/components/task-edit-modal";
import TaskDetailsModal from "@/components/task-details-modal";
import { useTaskCalendarDrop } from "@/components/use-task-calendar-drop";
import { scheduleDroppedTask, TASK_DRAG_TYPE } from "@/lib/task-calendar-drop";
import { Haptics } from "@capacitor/haptics";
import { useAuth } from "@/lib/auth-context";
import CalendarEventEditorModal, { CalendarEditorPreset, CalendarEventDraft } from "@/components/calendar-event-editor-modal";
import {
  CalendarSyncPreferences,
  EMPTY_CALENDAR_SYNC_PREFERENCES,
  GoogleCalendarCache,
  SyncedGoogleCalendar,
  SyncedGoogleCalendarEvent,
  saveCalendarFeatureMapping,
  saveCalendarSyncCache,
  saveCalendarSyncPreferences,
  subscribeToCalendarSync,
} from "@/lib/calendar-sync-service";
import {
  GoogleCalendarApiError,
  GoogleEventWrite,
  GuestUpdateMode,
  deleteGoogleEvent,
  getGoogleEvent,
  insertGoogleEvent,
  moveGoogleEvent,
  patchGoogleEvent,
} from "@/lib/google-calendar-api";

type CalendarView = "week" | "day" | "month";

type GoogleCalendar = SyncedGoogleCalendar;
type GoogleCalendarEvent = SyncedGoogleCalendarEvent;

function CalendarItemTitle({ event }: { event: GoogleCalendarEvent }) {
  const title = event.summary ?? "Untitled event";
  if (event.calendarId !== "committed-tasks") return <>{title}</>;
  const completed = title.startsWith("✓ ");
  return <span className="calendar-item-title"><svg className="calendar-task-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15" rx="4" /><path d="m6 10 2.6 2.6L14 7" /></svg><span className="calendar-item-title-text">{completed ? title.slice(2) : title}</span></span>;
}

const HOUR_HEIGHT = 45;
const TIME_GRID_TOP_OFFSET = 8;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const EVENT_GAP = 6;
const GRID_TICK_LENGTH = 7;
const SNAP_MINUTES = 15;
const EVENT_LONG_PRESS_MS = 450;
const EVENT_LONG_PRESS_CANCEL_DISTANCE = 10;
const DAY_SWIPE_THRESHOLD = 64;
const DAY_SWIPE_DIRECTION_RATIO = 1.25;
const DAY_SWIPE_MAX_DRAG = 120;
const DAY_SWIPE_SETTLE_MS = 150;
const ACCESS_TOKEN_MAX_AGE = 50 * 60_000;

type EventMutation =
  | { kind: "patch"; event: GoogleCalendarEvent; patch: Partial<GoogleEventWrite>; destinationCalendarId?: string }
  | { kind: "delete"; event: GoogleCalendarEvent };

type EventActionPrompt =
  | { kind: "recurrence"; mutation: EventMutation }
  | { kind: "guests"; mutation: EventMutation; scope: "occurrence" | "series" };

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDateTime(value: string) {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function addIsoDateDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function calendarDayDifference(from: Date, to: Date) {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function eventWriteFromDraft(draft: CalendarEventDraft): GoogleEventWrite {
  if (draft.allDay) {
    return {
      summary: draft.summary,
      start: { date: draft.startDate },
      end: { date: addIsoDateDays(draft.endDate, 1) },
      location: draft.location,
      description: draft.description,
    };
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    summary: draft.summary,
    start: { dateTime: parseLocalDateTime(`${draft.startDate}T${draft.startTime}`).toISOString(), timeZone },
    end: { dateTime: parseLocalDateTime(`${draft.endDate}T${draft.endTime}`).toISOString(), timeZone },
    location: draft.location,
    description: draft.description,
  };
}

function isCalendarWritable(calendar?: GoogleCalendar) {
  return calendar?.accessRole === "owner" || calendar?.accessRole === "writer" || calendar?.accessRole === "writerWithoutPrivateAccess";
}

function isEventWritable(event: GoogleCalendarEvent, calendar?: GoogleCalendar) {
  if (!isCalendarWritable(calendar) || event.locked || event.status === "cancelled") return false;
  if (event.eventType && event.eventType !== "default") return false;
  const hasOwnershipMetadata = Boolean(event.organizer || event.creator);
  const ownedByUser = event.organizer?.self === true || event.creator?.self === true;
  if (hasOwnershipMetadata && !ownedByUser && !event.guestsCanModify) return false;
  return true;
}

function eventHasGuests(event: GoogleCalendarEvent) {
  return Boolean(event.attendees?.some((attendee) => !attendee.self));
}

function eventPreset(event: GoogleCalendarEvent): CalendarEditorPreset {
  const allDay = Boolean(event.start?.date);
  const start = event.start?.dateTime ? new Date(event.start.dateTime) : new Date(`${event.start?.date ?? dateKey(new Date())}T00:00:00`);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(`${event.end?.date ?? addIsoDateDays(dateKey(start), 1)}T00:00:00`);
  return { start, end, allDay };
}

function shiftGoogleTime(value: NonNullable<GoogleCalendarEvent["start"]>, milliseconds: number, dayDelta: number) {
  if (value.dateTime) return { ...value, dateTime: new Date(new Date(value.dateTime).getTime() + milliseconds).toISOString() };
  if (value.date) return { ...value, date: addIsoDateDays(value.date, dayDelta) };
  return value;
}

function shiftRecurrenceWeekdays(recurrence: string[], dayDelta: number) {
  if (!dayDelta) return recurrence;
  const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return recurrence.map((line) => line.replace(/BYDAY=([^;]+)/, (_match, value: string) => {
    const shifted = value.split(",").map((entry) => {
      const weekday = entry.slice(-2);
      const index = weekdays.indexOf(weekday);
      return index < 0 ? entry : `${entry.slice(0, -2)}${weekdays[(index + dayDelta % 7 + 7) % 7]}`;
    });
    return `BYDAY=${shifted.join(",")}`;
  }));
}


function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function monthName(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fullDayHeader(date: Date) {
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "long" });
  return `${weekday} ${month} ${date.getDate()}`;
}

function shortTime(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:00 ${suffix}`;
}

function eventTimeRange(event: GoogleCalendarEvent) {
  if (!event.start?.dateTime) return "All day";
  const start = new Date(event.start.dateTime);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  const format = (value: Date) => value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${format(start)}${end ? ` – ${format(end)}` : ""}`;
}

function eventDateTimeRange(event: GoogleCalendarEvent) {
  if (!event.start) return "Time not specified";
  if (!event.start.dateTime) return new Date(`${event.start.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const start = new Date(event.start.dateTime);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  const date = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return `${date} · ${eventTimeRange(event)}${end && dateKey(start) !== dateKey(end) ? ` – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}`;
}

function plainDescription(description?: string) {
  return description?.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, "").replace(/\n\s*\n\s*\n/g, "\n\n").trim();
}

function mutedCalendarColor(color?: string) {
  // Preserve Google Calendar's chosen event color so both calendars match.
  return color ?? "#7f9ccd";
}

function hasEventPassed(event: GoogleCalendarEvent, now: Date) {
  const endValue = event.end?.dateTime ?? event.end?.date;
  return endValue ? new Date(endValue).getTime() <= now.getTime() : false;
}

function allDayEventOccursOn(event: GoogleCalendarEvent, day: Date) {
  const start = event.start?.date;
  if (!start) return false;
  const key = dateKey(day);
  // Google represents an all-day event's end date as exclusive.
  return key >= start && (!event.end?.date || key < event.end.date);
}

function hasAllDayEventPassed(event: GoogleCalendarEvent, now: Date) {
  const today = dateKey(now);
  // Google all-day end dates are exclusive, so an event ending today was
  // active yesterday and should now be dimmed.
  return event.end?.date ? event.end.date <= today : Boolean(event.start?.date && event.start.date < today);
}

function calendarCheckboxColor(calendar: GoogleCalendar) {
  // The native checkbox uses a white check on Google Calendar's darker red.
  // A slightly lighter Google-red keeps Math consistent with the other layers.
  return calendar.summary.toLowerCase().includes("math") ? "#f28b82" : (calendar.backgroundColor ?? "#41e987");
}

function orderCalendars(calendars: GoogleCalendar[], order: string[]) {
  return [...calendars].sort((first, second) => {
    const firstIndex = order.indexOf(first.id);
    const secondIndex = order.indexOf(second.id);
    return (firstIndex < 0 ? Number.MAX_SAFE_INTEGER : firstIndex) - (secondIndex < 0 ? Number.MAX_SAFE_INTEGER : secondIndex);
  });
}

function visibleIdsForCalendars(calendars: GoogleCalendar[], preferences: CalendarSyncPreferences, fallback: string[]) {
  const calendarIds = calendars.map((calendar) => calendar.id);
  if (!preferences.updatedAt) return fallback.length ? fallback.filter((id) => calendarIds.includes(id)) : calendarIds;
  const configuredCalendarIds = new Set(preferences.calendarOrder);
  return [
    ...preferences.visibleCalendarIds.filter((id) => calendarIds.includes(id)),
    // Calendars newly found in Google are visible by default until the user
    // explicitly changes their layer setting.
    ...calendarIds.filter((id) => !configuredCalendarIds.has(id)),
  ];
}

function MiniCalendar({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => void }) {
  const [month, setMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const start = new Date(month);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const today = dateKey(new Date());

  return (
    <section className="calendar-mini-card">
      <div className="calendar-mini-header">
        <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <div>
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><span className="material-symbols-rounded">chevron_left</span></button>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><span className="material-symbols-rounded">chevron_right</span></button>
        </div>
      </div>
      <div className="calendar-mini-weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-mini-grid">
        {days.map((day) => {
          const key = dateKey(day);
          const selected = key === dateKey(selectedDate);
          return <button key={key} onClick={() => onSelect(day)} className={`${day.getMonth() !== month.getMonth() ? "other-month " : ""}${selected ? "selected " : ""}${key === today ? "today" : ""}`}>{day.getDate()}</button>;
        })}
      </div>
    </section>
  );
}

export default function CalendarPage() {
  const { user, connectGoogleCalendar } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskGoals, setTaskGoals] = useState<Goal[]>([]);
  const [taskBuckets, setTaskBuckets] = useState<Bucket[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"layers" | "unscheduled">("layers");
  const [showTasks, setShowTasks] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const viewingTask = tasks.find((task) => task.id === viewingTaskId && !task.deleted) ?? null;
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [savingDroppedTaskId, setSavingDroppedTaskId] = useState<string | null>(null);
  const taskDropSavingRef = useRef(false);
  const draggedTask = tasks.find((task) => task.id === draggedTaskId && isUnscheduledTask(task)) ?? null;
  const [taskSyncError, setTaskSyncError] = useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    if (!user) return;
    const unsubs = [subscribeToTasks(user.uid, setTasks, true), subscribeToProjects(user.uid, setProjects, (error) => setTaskSyncError(error.message)), subscribeToGoals(user.uid, setTaskGoals), subscribeToBuckets(user.uid, setTaskBuckets)];
    setShowTasks(localStorage.getItem(`committed-task-layer:${user.uid}`) !== "hidden");
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);
  const taskSyncKey = tasks.map((task) => `${task.id}:${taskCalendarFingerprint(task)}`).join("|");
  const [view, setView] = useState<CalendarView>("week");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<string[]>([]);
  const [draggedCalendarId, setDraggedCalendarId] = useState<string | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [calendarSyncPreferences, setCalendarSyncPreferences] = useState<CalendarSyncPreferences>(EMPTY_CALENDAR_SYNC_PREFERENCES);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasSavedCalendarSync, setHasSavedCalendarSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEvent | null>(null);
  const [editorState, setEditorState] = useState<{ event: GoogleCalendarEvent | null; preset: CalendarEditorPreset } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventActionPrompt, setEventActionPrompt] = useState<EventActionPrompt | null>(null);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  const calendarPreferencesRef = useRef<CalendarSyncPreferences>(EMPTY_CALENDAR_SYNC_PREFERENCES);
  const visibleCalendarIdsRef = useRef<string[]>([]);
  const migratedLocalCalendarCacheRef = useRef(false);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(focusDate), index));
  const tokenStorageKey = user ? `committed-google-calendar-write-token-v2:${user.uid}` : null;
  const tokenTimeStorageKey = user ? `committed-google-calendar-write-token-time-v2:${user.uid}` : null;
  const calendarOrderStorageKey = user ? `committed-google-calendar-order:${user.uid}` : null;
  const calendarCacheStorageKey = user ? `committed-google-calendar-cache:${user.uid}` : null;

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const applyMobileDefault = () => {
      if (mobileViewport.matches) setView((current) => current === "week" ? "day" : current);
    };
    applyMobileDefault();
    const animationFrame = window.requestAnimationFrame(applyMobileDefault);
    mobileViewport.addEventListener("change", applyMobileDefault);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      mobileViewport.removeEventListener("change", applyMobileDefault);
    };
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    calendarPreferencesRef.current = calendarSyncPreferences;
  }, [calendarSyncPreferences]);

  useEffect(() => {
    visibleCalendarIdsRef.current = visibleCalendarIds;
  }, [visibleCalendarIds]);

  const loadGoogleCalendar = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const calendarResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers });
    if (!calendarResponse.ok) {
      let message = "Google Calendar could not be loaded.";
      try {
        const payload = await calendarResponse.json() as { error?: { message?: string } };
        if (payload.error?.message) message = payload.error.message;
      } catch {
        // Google occasionally returns an empty error response.
      }
      throw new GoogleCalendarApiError(message, calendarResponse.status);
    }
    const calendarData = await calendarResponse.json() as { items?: GoogleCalendar[] };
    const receivedCalendars = calendarData.items ?? [];
    const preferences = calendarPreferencesRef.current;
    const nextCalendars = orderCalendars(receivedCalendars, preferences.calendarOrder);
    setCalendars(nextCalendars);
    const nextVisibleCalendarIds = visibleIdsForCalendars(nextCalendars, preferences, visibleCalendarIdsRef.current);
    setVisibleCalendarIds(nextVisibleCalendarIds);

    const start = new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, 1).toISOString();
    const end = new Date(focusDate.getFullYear(), focusDate.getMonth() + 2, 1).toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (user && calendarPreferencesRef.current.updatedAt > 0) {
      try { await syncTaskCalendar(user.uid, token, preferences.featureCalendarMappings.tasks ?? null); setTaskSyncError(null); }
      catch (error) { setTaskSyncError(`Task sync pending: ${error instanceof Error ? error.message : "Could not sync tasks."} Use Refresh Sync to retry.`); }
    }
    const eventLists = await Promise.all(nextCalendars.map(async (calendar) => {
      // Request local-time values so calendars configured to return UTC do not
      // appear hours later in the grid.
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&timeZone=${encodeURIComponent(timeZone)}&conferenceDataVersion=1`, { headers });
      if (!response.ok) return [] as GoogleCalendarEvent[];
      const data = await response.json() as { items?: Omit<GoogleCalendarEvent, "calendarId" | "color">[] };
      return (data.items ?? []).map((event) => ({ ...event, calendarId: calendar.id, color: calendar.backgroundColor }));
    }));
    const nextEvents = eventLists.flat();
    setEvents(nextEvents);
    const nextCache = { calendars: nextCalendars, events: nextEvents, savedAt: Date.now() } satisfies GoogleCalendarCache;
    if (calendarCacheStorageKey) {
      localStorage.setItem(calendarCacheStorageKey, JSON.stringify(nextCache));
      setHasSavedCalendarSync(true);
    }
    if (user) {
      try {
        await Promise.all([
          saveCalendarSyncCache(user.uid, nextCache),
          saveCalendarSyncPreferences(user.uid, {
            calendarOrder: nextCalendars.map((calendar) => calendar.id),
            visibleCalendarIds: nextVisibleCalendarIds,
            featureCalendarMappings: calendarPreferencesRef.current.featureCalendarMappings,
          }),
        ]);
        setSyncError(null);
      } catch (error) {
        // Google has already loaded successfully at this point. Keep the fresh
        // calendar on screen and report only the cross-device cache problem.
        setSyncError(error instanceof Error ? `Calendar loaded, but cross-device sync could not be saved: ${error.message}` : "Calendar loaded, but cross-device sync could not be saved.");
      }
    }
  }, [calendarCacheStorageKey, focusDate, user]);

  const syncGoogleCalendar = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const token = accessToken ?? await connectGoogleCalendar();
      setAccessToken(token);
      if (tokenStorageKey) sessionStorage.setItem(tokenStorageKey, token);
      if (tokenTimeStorageKey) sessionStorage.setItem(tokenTimeStorageKey, String(Date.now()));
      await loadGoogleCalendar(token);
    } catch (error) {
      setAccessToken(null);
      if (tokenStorageKey) sessionStorage.removeItem(tokenStorageKey);
      if (tokenTimeStorageKey) sessionStorage.removeItem(tokenTimeStorageKey);
      setSyncError(error instanceof Error ? error.message : "Could not connect Google Calendar.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    migratedLocalCalendarCacheRef.current = false;
    if (!user || !tokenStorageKey || !calendarCacheStorageKey) {
      calendarPreferencesRef.current = EMPTY_CALENDAR_SYNC_PREFERENCES;
      setAccessToken(null);
      setHasSavedCalendarSync(false);
      setCalendars([]);
      setEvents([]);
      setVisibleCalendarIds([]);
      setCalendarSyncPreferences(EMPTY_CALENDAR_SYNC_PREFERENCES);
      return;
    }
    const storedToken = sessionStorage.getItem(tokenStorageKey);
    const storedAt = Number(tokenTimeStorageKey ? sessionStorage.getItem(tokenTimeStorageKey) : 0);
    if (storedToken && storedAt && Date.now() - storedAt < ACCESS_TOKEN_MAX_AGE) setAccessToken(storedToken);
    else {
      setAccessToken(null);
      sessionStorage.removeItem(tokenStorageKey);
      if (tokenTimeStorageKey) sessionStorage.removeItem(tokenTimeStorageKey);
    }
    let localCache: GoogleCalendarCache | null = null;
    let localOrder: string[] = [];
    try {
      const cache = JSON.parse(localStorage.getItem(calendarCacheStorageKey) ?? "null") as GoogleCalendarCache | null;
      if (cache && Array.isArray(cache.calendars) && Array.isArray(cache.events)) localCache = cache;
      localOrder = calendarOrderStorageKey ? JSON.parse(localStorage.getItem(calendarOrderStorageKey) ?? "[]") : [];
    } catch {
      localStorage.removeItem(calendarCacheStorageKey);
    }
    if (localCache) {
      const localCalendars = orderCalendars(localCache.calendars, localOrder);
      setCalendars(localCalendars);
      setVisibleCalendarIds(localCalendars.map((calendar) => calendar.id));
      setEvents(localCache.events);
      setHasSavedCalendarSync(true);
    }

    const unsubscribe = subscribeToCalendarSync(user.uid, (preferences, cloudCache) => {
      calendarPreferencesRef.current = preferences;
      setCalendarSyncPreferences(preferences);
      setPreferencesReady(true);
      const cache = cloudCache ?? localCache;
      if (cache) {
        const syncedCalendars = orderCalendars(cache.calendars, preferences.calendarOrder.length ? preferences.calendarOrder : localOrder);
        setCalendars(syncedCalendars);
        setVisibleCalendarIds(visibleIdsForCalendars(syncedCalendars, preferences, syncedCalendars.map((calendar) => calendar.id)));
        setEvents(cache.events);
        setHasSavedCalendarSync(true);
      }
      if (!cloudCache && localCache && !migratedLocalCalendarCacheRef.current) {
        migratedLocalCalendarCacheRef.current = true;
        void Promise.all([
          saveCalendarSyncCache(user.uid, localCache),
          saveCalendarSyncPreferences(user.uid, {
            calendarOrder: localOrder.length ? localOrder : localCache.calendars.map((calendar) => calendar.id),
            visibleCalendarIds: localCache.calendars.map((calendar) => calendar.id),
            featureCalendarMappings: {},
          }),
        ]).catch((error) => setSyncError(error instanceof Error ? error.message : "Calendar sync could not be saved to your account."));
      }
    });
    return unsubscribe;
  }, [calendarCacheStorageKey, calendarOrderStorageKey, tokenStorageKey, tokenTimeStorageKey, user]);

  useEffect(() => {
    if (!accessToken) return;
    void loadGoogleCalendar(accessToken).catch(() => {
      setAccessToken(null);
      if (tokenStorageKey) sessionStorage.removeItem(tokenStorageKey);
      if (tokenTimeStorageKey) sessionStorage.removeItem(tokenTimeStorageKey);
    });
  }, [accessToken, loadGoogleCalendar, tokenStorageKey, tokenTimeStorageKey, taskSyncKey, preferencesReady, calendarSyncPreferences.featureCalendarMappings.tasks]);

  const heading = view === "day"
    ? focusDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : view === "week"
      ? `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : monthName(focusDate);

  const move = (direction: number) => {
    const next = new Date(focusDate);
    if (view === "day") next.setDate(next.getDate() + direction);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    setFocusDate(next);
  };

  const moveCalendar = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setCalendars((current) => {
      const fromIndex = current.findIndex((calendar) => calendar.id === fromId);
      const toIndex = current.findIndex((calendar) => calendar.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      if (calendarOrderStorageKey) localStorage.setItem(calendarOrderStorageKey, JSON.stringify(reordered.map((calendar) => calendar.id)));
      if (user) {
        void saveCalendarSyncPreferences(user.uid, {
          calendarOrder: reordered.map((calendar) => calendar.id),
          visibleCalendarIds: visibleCalendarIdsRef.current,
          featureCalendarMappings: calendarPreferencesRef.current.featureCalendarMappings,
        }).catch((error) => setSyncError(error instanceof Error ? error.message : "Calendar order could not be saved."));
      }
      return reordered;
    });
  };

  const toggleCalendarVisibility = (calendarId: string) => {
    setVisibleCalendarIds((current) => {
      const next = current.includes(calendarId) ? current.filter((id) => id !== calendarId) : [...current, calendarId];
      if (user) {
        void saveCalendarSyncPreferences(user.uid, {
          calendarOrder: calendars.map((calendar) => calendar.id),
          visibleCalendarIds: next,
          featureCalendarMappings: calendarPreferencesRef.current.featureCalendarMappings,
        }).catch((error) => setSyncError(error instanceof Error ? error.message : "Calendar visibility could not be saved."));
      }
      return next;
    });
  };

  const setFeatureCalendarMapping = (feature: string, calendarId: string | null) => {
    const current = calendarPreferencesRef.current;
    const next: CalendarSyncPreferences = {
      ...current,
      featureCalendarMappings: { ...current.featureCalendarMappings, [feature]: calendarId },
      updatedAt: Date.now(),
    };
    calendarPreferencesRef.current = next;
    setCalendarSyncPreferences(next);
    if (user) {
      void saveCalendarFeatureMapping(user.uid, current, feature, calendarId)
        .catch((error) => setSyncError(error instanceof Error ? error.message : "Calendar mapping could not be saved."));
    }
  };

  useEffect(() => {
    if (!calendarNotice) return;
    const timeout = window.setTimeout(() => setCalendarNotice(null), 4_500);
    return () => window.clearTimeout(timeout);
  }, [calendarNotice]);

  const writableCalendars = calendars.filter(isCalendarWritable);

  const defaultEditorPreset = () => {
    const now = new Date();
    const isFocusedToday = dateKey(focusDate) === dateKey(now);
    const start = new Date(focusDate);
    if (isFocusedToday) {
      start.setHours(now.getHours(), Math.ceil(now.getMinutes() / SNAP_MINUTES) * SNAP_MINUTES, 0, 0);
    } else {
      start.setHours(9, 0, 0, 0);
    }
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { start, end };
  };

  const openCreateEditor = (preset: CalendarEditorPreset = defaultEditorPreset()) => {
    setSelectedEvent(null);
    setEditorError(null);
    setEditorState({ event: null, preset });
  };

  const openEditEditor = (event: GoogleCalendarEvent) => {
    setSelectedEvent(null);
    setEditorError(null);
    setEditorState({ event, preset: eventPreset(event) });
  };

  const saveWriteAccessToken = (token: string) => {
    setAccessToken(token);
    if (tokenStorageKey) sessionStorage.setItem(tokenStorageKey, token);
    if (tokenTimeStorageKey) sessionStorage.setItem(tokenTimeStorageKey, String(Date.now()));
    return token;
  };

  const getWriteAccessToken = async (forceRefresh = false) => {
    const storedAt = Number(tokenTimeStorageKey ? sessionStorage.getItem(tokenTimeStorageKey) : 0);
    if (!forceRefresh && accessToken && storedAt && Date.now() - storedAt < ACCESS_TOKEN_MAX_AGE) return accessToken;
    setAccessToken(null);
    if (tokenStorageKey) sessionStorage.removeItem(tokenStorageKey);
    if (tokenTimeStorageKey) sessionStorage.removeItem(tokenTimeStorageKey);
    const token = await connectGoogleCalendar();
    return saveWriteAccessToken(token);
  };

  const clearExpiredWriteAccess = () => {
    setAccessToken(null);
    if (tokenStorageKey) sessionStorage.removeItem(tokenStorageKey);
    if (tokenTimeStorageKey) sessionStorage.removeItem(tokenTimeStorageKey);
  };

  const executeEventMutation = async (mutation: EventMutation, scope: "occurrence" | "series", sendUpdates: GuestUpdateMode) => {
    setEventActionPrompt(null);
    setSavingEvent(true);
    setEditorError(null);
    const previousEvents = events;
    if (scope === "occurrence") {
      if (mutation.kind === "delete") {
        setEvents((current) => current.filter((event) => !(event.id === mutation.event.id && event.calendarId === mutation.event.calendarId)));
      } else {
        setEvents((current) => current.map((event) => event.id === mutation.event.id && event.calendarId === mutation.event.calendarId
          ? {
              ...event,
              ...mutation.patch,
              calendarId: mutation.destinationCalendarId ?? event.calendarId,
              color: mutation.destinationCalendarId ? calendars.find((calendar) => calendar.id === mutation.destinationCalendarId)?.backgroundColor : event.color,
            }
          : event));
      }
    }
    try {
      let token = await getWriteAccessToken();
      const authorized = async <T,>(operation: (currentToken: string) => Promise<T>) => {
        try {
          return await operation(token);
        } catch (error) {
          if (!(error instanceof GoogleCalendarApiError) || error.status !== 401) throw error;
          token = await getWriteAccessToken(true);
          return await operation(token);
        }
      };
      const recurringParentId = mutation.event.recurringEventId;
      let targetEvent = mutation.event;
      let targetEventId = mutation.event.id;

      if (scope === "series" && recurringParentId) {
        targetEvent = await authorized((currentToken) => getGoogleEvent(currentToken, mutation.event.calendarId, recurringParentId));
        targetEventId = recurringParentId;
      }

      if (mutation.kind === "delete") {
        await authorized((currentToken) => deleteGoogleEvent(currentToken, mutation.event.calendarId, targetEventId, sendUpdates));
      } else {
        let patch = mutation.patch;
        if (scope === "series" && recurringParentId) {
          const instanceStart = mutation.event.start;
          const instanceEnd = mutation.event.end;
          const proposedStart = mutation.patch.start;
          const proposedEnd = mutation.patch.end;
          const instanceStartDate = instanceStart?.dateTime ? new Date(instanceStart.dateTime) : new Date(`${instanceStart?.date}T12:00:00`);
          const proposedStartDate = proposedStart?.dateTime ? new Date(proposedStart.dateTime) : new Date(`${proposedStart?.date ?? instanceStart?.date}T12:00:00`);
          const startMilliseconds = proposedStart?.dateTime && instanceStart?.dateTime ? new Date(proposedStart.dateTime).getTime() - new Date(instanceStart.dateTime).getTime() : 0;
          const endMilliseconds = proposedEnd?.dateTime && instanceEnd?.dateTime ? new Date(proposedEnd.dateTime).getTime() - new Date(instanceEnd.dateTime).getTime() : 0;
          const startDayDelta = calendarDayDifference(instanceStartDate, proposedStartDate);
          const endDayDelta = proposedEnd?.date && instanceEnd?.date ? calendarDayDifference(new Date(`${instanceEnd.date}T12:00:00`), new Date(`${proposedEnd.date}T12:00:00`)) : startDayDelta;
          if (startDayDelta && targetEvent.recurrence?.some((line) => /BYMONTHDAY=|BYYEARDAY=|BYWEEKNO=/.test(line))) {
            throw new Error("This series uses a complex recurrence rule. Move this occurrence instead, or edit the full series in Google Calendar.");
          }
          patch = {
            ...mutation.patch,
            ...(proposedStart && targetEvent.start ? { start: shiftGoogleTime(targetEvent.start, startMilliseconds, startDayDelta) } : {}),
            ...(proposedEnd && targetEvent.end ? { end: shiftGoogleTime(targetEvent.end, endMilliseconds, endDayDelta) } : {}),
            ...(proposedStart && startDayDelta && targetEvent.recurrence ? { recurrence: shiftRecurrenceWeekdays(targetEvent.recurrence, startDayDelta) } : {}),
          };
        }

        let destinationCalendarId = mutation.event.calendarId;
        if (mutation.destinationCalendarId && mutation.destinationCalendarId !== mutation.event.calendarId) {
          // The following PATCH sends the user's chosen guest update once;
          // suppress a duplicate notification from the intermediate move.
          const moved = await authorized((currentToken) => moveGoogleEvent(currentToken, mutation.event.calendarId, targetEventId, mutation.destinationCalendarId!, "none"));
          destinationCalendarId = mutation.destinationCalendarId;
          targetEventId = moved.id;
          targetEvent = moved;
        }
        await authorized((currentToken) => patchGoogleEvent(currentToken, destinationCalendarId, targetEventId, patch, sendUpdates, targetEvent.etag));
      }

      await authorized((currentToken) => loadGoogleCalendar(currentToken));
      setEditorState(null);
      setSelectedEvent(null);
      setCalendarNotice(mutation.kind === "delete" ? "Event deleted from Google Calendar." : "Google Calendar updated.");
    } catch (error) {
      setEvents(previousEvents);
      if (error instanceof GoogleCalendarApiError && (error.status === 401 || error.status === 403)) clearExpiredWriteAccess();
      if (error instanceof GoogleCalendarApiError && error.status === 412 && accessToken) {
        void loadGoogleCalendar(accessToken);
      }
      const message = error instanceof GoogleCalendarApiError && error.status === 401
        ? "Google Calendar access expired. Reconnect Google Calendar and try again."
        : error instanceof GoogleCalendarApiError && error.status === 403
          ? "Google Calendar did not allow that change. Reconnect with event access and try again."
        : error instanceof GoogleCalendarApiError && error.status === 412
        ? "This event changed in Google Calendar. The latest version has been reloaded."
        : error instanceof Error ? error.message : "Google Calendar could not save that change.";
      setEditorError(message);
      setCalendarNotice(message);
    } finally {
      setSavingEvent(false);
    }
  };

  const continueEventMutation = (mutation: EventMutation, scope: "occurrence" | "series") => {
    if (eventHasGuests(mutation.event)) setEventActionPrompt({ kind: "guests", mutation, scope });
    else void executeEventMutation(mutation, scope, "none");
  };

  const requestEventMutation = (mutation: EventMutation) => {
    const task = tasks.find((item) => mutation.event.id === `committed-task:${item.id}`);
    if (task) {
      if (mutation.kind === "delete") { setSchedulingTask(task); return; }
      const start = mutation.patch.start ?? mutation.event.start;
      const end = mutation.patch.end ?? mutation.event.end;
      const minutes = start?.dateTime && end?.dateTime ? Math.round((new Date(end.dateTime).getTime() - new Date(start.dateTime).getTime()) / 60_000) : task.estimatedMinutes;
      if (minutes != null && minutes <= 0) return;
      void saveTask({ ...task, startDateTime: start?.dateTime ? localDateTime(new Date(start.dateTime)) : start?.date ? `${start.date}T00:00` : null, startAllDay: !!start?.date, estimatedMinutes: minutes ?? null }).catch((error) => setCalendarNotice(error.message));
      return;
    }
    const repeats = Boolean(mutation.event.recurringEventId || mutation.event.recurrence?.length);
    if (repeats) setEventActionPrompt({ kind: "recurrence", mutation });
    else continueEventMutation(mutation, "occurrence");
  };

  const saveEditorEvent = async (draft: CalendarEventDraft) => {
    if (!editorState) return;
    if (!editorState.event) {
      setSavingEvent(true);
      setEditorError(null);
      try {
        let token = await getWriteAccessToken();
        const authorized = async <T,>(operation: (currentToken: string) => Promise<T>) => {
          try {
            return await operation(token);
          } catch (error) {
            if (!(error instanceof GoogleCalendarApiError) || error.status !== 401) throw error;
            token = await getWriteAccessToken(true);
            return await operation(token);
          }
        };
        await authorized((currentToken) => insertGoogleEvent(currentToken, draft.calendarId, eventWriteFromDraft(draft)));
        await authorized((currentToken) => loadGoogleCalendar(currentToken));
        setEditorState(null);
        setCalendarNotice("Event created in Google Calendar.");
      } catch (error) {
        if (error instanceof GoogleCalendarApiError && (error.status === 401 || error.status === 403)) clearExpiredWriteAccess();
        const message = error instanceof GoogleCalendarApiError && error.status === 401
          ? "Google Calendar access expired. Reconnect Google Calendar and try again."
          : error instanceof GoogleCalendarApiError && error.status === 403
            ? "Google Calendar did not allow that change. Reconnect with event access and try again."
            : error instanceof Error ? error.message : "Google Calendar could not create that event.";
        setEditorError(message);
      } finally {
        setSavingEvent(false);
      }
      return;
    }
    requestEventMutation({
      kind: "patch",
      event: editorState.event,
      patch: eventWriteFromDraft(draft),
      destinationCalendarId: draft.calendarId,
    });
  };

  const taskCalendar: GoogleCalendar = { id: "committed-tasks", summary: "Tasks", backgroundColor: "#6e9fdb", accessRole: "owner" };
  const taskEvents: GoogleCalendarEvent[] = tasks.filter((task) => !task.deleted && !task.archived && task.type === "task").flatMap((task) => {
    const block = taskBlock(task);
    const day = task.startDateTime?.split("T")[0] ?? task.dueDateTime?.split("T")[0] ?? task.dueDate;
    if (!block && !day) return [];
    return [{ id: `committed-task:${task.id}`, calendarId: taskCalendar.id, locked: !block, summary: `${task.completed ? "✓ " : ""}${task.title}`, description: task.description, color: task.completed ? "#65816f" : taskCalendar.backgroundColor,
      start: block ? { dateTime: block.start.toISOString() } : { date: day! },
      end: block ? { dateTime: block.end.toISOString() } : { date: addIsoDateDays(day!, 1) } }];
  });
  const visibleEvents = [...events.filter((event) => visibleCalendarIds.includes(event.calendarId) && !tasks.some((task) => task.calendarLink?.eventId === event.id && task.calendarLink?.calendarId === event.calendarId)), ...(showTasks ? taskEvents : [])];
  const displayCalendars = [...calendars, taskCalendar];
  const selectCalendarEvent = (event: GoogleCalendarEvent) => {
    const task = tasks.find((item) => event.id === `committed-task:${item.id}`);
    if (task) setViewingTaskId(task.id);
    else setSelectedEvent(event);
  };

  const dropTaskAtTime = async (taskId: string, start: Date) => {
    setDraggedTaskId(null);
    if (taskDropSavingRef.current) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !user) return;
    taskDropSavingRef.current = true;
    setSavingDroppedTaskId(taskId);
    setTaskSyncError(null);
    try {
      const scheduled = scheduleDroppedTask(task, start);
      setShowTasks(true);
      localStorage.setItem(`committed-task-layer:${user.uid}`, "visible");
      await saveTask(scheduled);
      setCalendarNotice(calendarSyncPreferences.featureCalendarMappings.tasks ? "Task scheduled. Google sync will run when connected." : "Task scheduled on your calendar.");
    } catch (error) {
      setTaskSyncError(error instanceof Error ? error.message : "Could not schedule task. Please try again.");
    } finally {
      taskDropSavingRef.current = false;
      setSavingDroppedTaskId(null);
    }
  };

  return (
    <div className="committed-calendar-page">
      <header className="calendar-toolbar">
        <div className="calendar-title-lockup">
          <button type="button" className="calendar-icon-button calendar-mobile-menu" aria-label="Open calendars and settings" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><span className="material-symbols-rounded">menu</span></button>
          <span className="calendar-title-mark" aria-hidden="true"><span className="material-symbols-rounded">calendar_month</span></span>
          <div><h1>Calendar</h1><span className="calendar-mobile-title-meta">{heading}</span></div>
        </div>
        <div className="calendar-controls">
          <button className="calendar-outline-button" onClick={() => setFocusDate(new Date())}>Today</button>
          <button className="calendar-icon-button" aria-label="Previous" onClick={() => move(-1)}><span className="material-symbols-rounded">chevron_left</span></button>
          <button className="calendar-icon-button" aria-label="Next" onClick={() => move(1)}><span className="material-symbols-rounded">chevron_right</span></button>
          <h2>{heading}</h2>
        </div>
        <div className="calendar-view-select" role="group" aria-label="Calendar view">
          {(["day", "week", "month"] as CalendarView[]).map((option) => <button key={option} className={view === option ? "active" : ""} aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>)}
        </div>
        <div className="calendar-toolbar-actions">
          <button className="calendar-top-placeholder" aria-label="Search"><span className="material-symbols-rounded">search</span></button>
          <button className="calendar-outline-button calendar-sync-button" aria-label={syncing ? "Syncing Google Calendar" : accessToken || hasSavedCalendarSync ? "Refresh Google Calendar" : "Connect Google Calendar"} onClick={syncGoogleCalendar} disabled={syncing}><span className={`material-symbols-rounded${syncing ? " is-spinning" : ""}`} aria-hidden="true">{accessToken || hasSavedCalendarSync ? "sync" : "link"}</span><span className="calendar-sync-label">{syncing ? "Syncing…" : accessToken || hasSavedCalendarSync ? "Refresh Sync" : "Connect Google"}</span></button>
          <button className="calendar-icon-button calendar-mobile-create" aria-label="Create event" onClick={() => openCreateEditor()}><span className="material-symbols-rounded">add</span></button>
        </div>
      </header>

      <div className="calendar-workspace">
        {mobileSidebarOpen && <button type="button" className="calendar-sidebar-scrim" aria-label="Close calendars and settings" onClick={() => setMobileSidebarOpen(false)} />}
        <aside className={`calendar-sidebar${mobileSidebarOpen ? " is-open" : ""}`} role={mobileSidebarOpen ? "dialog" : undefined} aria-modal={mobileSidebarOpen || undefined} aria-label={mobileSidebarOpen ? "Calendars and settings" : undefined}>
          <div className="calendar-mobile-sidebar-header"><div><span className="material-symbols-rounded" aria-hidden="true">calendar_month</span><span><strong>Calendar</strong><small>Layers &amp; settings</small></span></div><button type="button" aria-label="Close calendars and settings" onClick={() => setMobileSidebarOpen(false)}><span className="material-symbols-rounded">close</span></button></div>
          <button className="calendar-create-button" onClick={() => openCreateEditor()}><span className="material-symbols-rounded">add</span>Create</button>
          <div className="planning-tabs calendar-planning-tabs" role="tablist" aria-label="Calendar sidebar">
            <button role="tab" aria-selected={sidebarTab === "layers"} onClick={() => setSidebarTab("layers")}>Calendars</button>
            <button role="tab" aria-selected={sidebarTab === "unscheduled"} onClick={() => setSidebarTab("unscheduled")}>Unscheduled <span>{tasks.filter(isUnscheduledTask).length}</span></button>
          </div>
          {taskSyncError && <p className="planning-error" role="alert">{taskSyncError}</p>}
          {sidebarTab === "unscheduled" ? <CalendarTaskPlanner tasks={tasks} projects={projects} draggedTaskId={draggedTaskId} savingTaskId={savingDroppedTaskId} onTaskDrag={(task) => setDraggedTaskId(task?.id ?? null)} onEdit={(task) => { setEditingTask(task); setMobileSidebarOpen(false); }} onSchedule={(task) => { setSchedulingTask(task); setMobileSidebarOpen(false); }} /> : <>
          <MiniCalendar selectedDate={focusDate} onSelect={(date) => { setFocusDate(date); setMobileSidebarOpen(false); }} />
          <section className="calendar-layers">
            <p>My calendars</p>
            <label className="calendar-layer"><input type="checkbox" checked={showTasks} onChange={(event) => { setShowTasks(event.target.checked); if (user) localStorage.setItem(`committed-task-layer:${user.uid}`, event.target.checked ? "visible" : "hidden"); }} style={{ accentColor: "#6e9fdb" }} />Tasks</label>
            {calendars.length === 0
              ? <span className="calendar-empty-layers">{syncError ?? "Connect Google Calendar to see your schedule."}</span>
              : calendars.map((calendar) => <label className="calendar-layer" key={calendar.id} draggable onDragStart={() => setDraggedCalendarId(calendar.id)} onDragEnd={() => setDraggedCalendarId(null)} onDragOver={(dragEvent) => dragEvent.preventDefault()} onDrop={() => { if (draggedCalendarId) moveCalendar(draggedCalendarId, calendar.id); setDraggedCalendarId(null); }} style={{ opacity: draggedCalendarId === calendar.id ? 0.55 : 1 }}>
                <span className="material-symbols-rounded" aria-hidden="true" style={{ color: "var(--secondary)", fontSize: 16, cursor: "grab" }}>drag_indicator</span>
                <input type="checkbox" checked={visibleCalendarIds.includes(calendar.id)} onChange={() => toggleCalendarVisibility(calendar.id)} aria-label={`Show ${calendar.summary}`} style={{ accentColor: calendarCheckboxColor(calendar) }} />
                {calendar.summary}{calendar.primary ? " (primary)" : ""}
              </label>)}
          </section>
          {calendars.length > 0 && <section className="calendar-layers" style={{ marginTop: 22 }}>
            <p>App calendar mapping</p>
            <span className="calendar-empty-layers" style={{ display: "block", margin: "-3px 0 9px", fontSize: 11, lineHeight: 1.35 }}>Choose the imported calendar each app feature is associated with. These choices sync with your account.</span>
            {[
              ["tasks", "Task schedules"],
              ["habits", "Habit reminders"],
              ["workouts", "Workout schedules"],
            ].map(([feature, label]) => <label key={feature} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, marginTop: 10, color: "var(--primary)", fontSize: 12, fontWeight: 700 }}>
              <span>{label}</span>
              <select value={calendarSyncPreferences.featureCalendarMappings[feature] ?? ""} onChange={(event) => setFeatureCalendarMapping(feature, event.target.value || null)} style={{ width: "100%", padding: "7px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-variant)", color: "var(--primary)", fontSize: 12 }}>
                <option value="">Not mapped</option>
                {(feature === "tasks" ? writableCalendars : calendars).map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (primary)" : ""}</option>)}
              </select>
            </label>)}
          </section>}
          <p className="planning-muted" style={{ fontSize: 11, marginTop: 16 }}>Task blocks sync to the mapped Google calendar while this page is open. Connect Google and choose “Task schedules” to enable syncing.</p>
          </>}
        </aside>
        <main className="calendar-main">
          {view === "month"
            ? <MonthView focusDate={focusDate} events={visibleEvents} calendars={displayCalendars} onSelectEvent={selectCalendarEvent} onCreateEvent={openCreateEditor} onRequestMutation={requestEventMutation} draggedTask={draggedTask} onTaskDrop={(task, date) => { setDraggedTaskId(null); setFocusDate(date); setSchedulingTask(task); setMobileSidebarOpen(false); }} />
            : <TimeGrid view={view} days={view === "day" ? [focusDate] : weekDays} events={visibleEvents} calendars={displayCalendars} onSelectEvent={selectCalendarEvent} onCreateEvent={openCreateEditor} onRequestMutation={requestEventMutation} onSwipeDay={move} draggedTask={draggedTask} onTaskDrop={(id, start) => void dropTaskAtTime(id, start)} />}
        </main>
      </div>
      {schedulingTask && <TaskTimeBlockDialog key={schedulingTask.id} task={tasks.find((task) => task.id === schedulingTask.id) ?? schedulingTask} date={focusDate} onClose={() => setSchedulingTask(null)} onEdit={() => { setEditingTask(schedulingTask); setSchedulingTask(null); }} onSave={async (task) => { await saveTask(task); if (task.startDateTime) setFocusDate(new Date(task.startDateTime)); setCalendarNotice(calendarSyncPreferences.featureCalendarMappings.tasks ? "Task saved. Google sync will run when connected." : "Task saved to your calendar."); }} />}
      <TaskEditModal isOpen={editingTask !== null} task={editingTask} onClose={() => setEditingTask(null)} onSave={saveTask} goals={taskGoals} buckets={taskBuckets} userId={user?.uid ?? ""} nextSortOrder={tasks.length} />
      <TaskDetailsModal isOpen={!!viewingTask} task={viewingTask} goals={taskGoals} buckets={taskBuckets} onClose={() => setViewingTaskId(null)} onEdit={() => { setEditingTask(viewingTask); setViewingTaskId(null); }} />
      {selectedEvent && <CalendarEventModal event={selectedEvent} calendar={calendars.find((calendar) => calendar.id === selectedEvent.calendarId)} onClose={() => setSelectedEvent(null)} onEdit={isEventWritable(selectedEvent, calendars.find((calendar) => calendar.id === selectedEvent.calendarId)) ? () => openEditEditor(selectedEvent) : undefined} />}
      {editorState && <CalendarEventEditorModal event={editorState.event} preset={editorState.preset} calendars={writableCalendars} saving={savingEvent} error={editorError} onClose={() => !savingEvent && setEditorState(null)} onSave={(draft) => void saveEditorEvent(draft)} onDelete={editorState.event ? () => requestEventMutation({ kind: "delete", event: editorState.event! }) : undefined} />}
      {eventActionPrompt && <CalendarActionPrompt prompt={eventActionPrompt} onCancel={() => setEventActionPrompt(null)} onOccurrence={(mutation) => continueEventMutation(mutation, "occurrence")} onSeries={(mutation) => continueEventMutation(mutation, "series")} onGuests={(mutation, scope, sendUpdates) => void executeEventMutation(mutation, scope, sendUpdates)} />}
      {calendarNotice && <div className="calendar-notice" role="status">{calendarNotice}</div>}
    </div>
  );
}

function TimeGrid({ view, days, events, calendars, onSelectEvent, onCreateEvent, onRequestMutation, onSwipeDay, draggedTask, onTaskDrop }: { view: CalendarView; days: Date[]; events: GoogleCalendarEvent[]; calendars: GoogleCalendar[]; onSelectEvent: (event: GoogleCalendarEvent) => void; onCreateEvent: (preset: CalendarEditorPreset) => void; onRequestMutation: (mutation: EventMutation) => void; onSwipeDay: (direction: number) => void; draggedTask: Task | null; onTaskDrop: (taskId: string, start: Date) => void }) {
  const [now, setNow] = useState(() => new Date());
  const [creationPreview, setCreationPreview] = useState<{ start: Date; end: Date } | null>(null);
  const [eventPreview, setEventPreview] = useState<{ key: string; start: Date; end: Date } | null>(null);
  const [daySwipeOffset, setDaySwipeOffset] = useState(0);
  const [daySwipeSettling, setDaySwipeSettling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const taskDrop = useTaskCalendarDrop({ task: draggedTask, days, columnsRef, scrollRef: scrollContainerRef, hourHeight: HOUR_HEIGHT, onDrop: onTaskDrop });
  const headerRef = useRef<HTMLDivElement>(null);
  const creationGestureRef = useRef<{ pointerId: number; startSlot: Date; moved: boolean; startX: number; startY: number } | null>(null);
  const eventGestureRef = useRef<{ pointerId: number; event: GoogleCalendarEvent; mode: "move" | "start" | "end"; startSlot: Date; originalStart: Date; originalEnd: Date; moved: boolean; activated: boolean; isTouch: boolean; longPressTimer: number | null; target: HTMLElement; startX: number; startY: number } | null>(null);
  const allDayGestureRef = useRef<{ pointerId: number; event: GoogleCalendarEvent; mode: "move" | "start" | "end"; startDayIndex: number; moved: boolean; startX: number } | null>(null);
  const daySwipeRef = useRef<{ pointerId: number; startX: number; startY: number; axis: "pending" | "horizontal" | "vertical" } | null>(null);
  const daySwipeTimerRef = useRef<number | null>(null);
  const eventDragPointersRef = useRef(new Set<number>());
  const suppressEventClickRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearInterval(interval);
      const gesture = eventGestureRef.current;
      if (gesture && gesture.longPressTimer !== null) window.clearTimeout(gesture.longPressTimer);
      if (daySwipeTimerRef.current !== null) window.clearTimeout(daySwipeTimerRef.current);
    };
  }, []);

  const today = dateKey(now);
  const currentTimeTop = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
  const daySignature = days.map(dateKey).join("|");
  const hasAllDayEvents = events.some((event) => event.start?.date && days.some((day) => allDayEventOccursOn(event, day)));

  useEffect(() => {
    const current = new Date();
    if (!daySignature.split("|").includes(dateKey(current))) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    if (window.matchMedia("(max-width: 767px)").matches) {
      scrollContainer.scrollTop = 7 * HOUR_HEIGHT;
      return;
    }
    const top = TIME_GRID_TOP_OFFSET + (current.getHours() + current.getMinutes() / 60) * HOUR_HEIGHT;
    scrollContainer.scrollTop = Math.max(0, top - scrollContainer.clientHeight / 2);
  }, [daySignature, hasAllDayEvents]);

  const pointerSlot = (clientX: number, clientY: number) => {
    const columns = columnsRef.current;
    if (!columns) return null;
    const bounds = columns.getBoundingClientRect();
    const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - bounds.left) / Math.max(1, bounds.width)) * days.length)));
    const rawMinutes = ((clientY - bounds.top) / HOUR_HEIGHT) * 60;
    const minutes = Math.max(0, Math.min(24 * 60, Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES));
    const slot = new Date(days[dayIndex]);
    slot.setHours(0, minutes, 0, 0);
    return slot;
  };

  const startGridCreation = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if ((pointerEvent.target as HTMLElement).closest(".google-calendar-event")) return;
    const slot = pointerSlot(pointerEvent.clientX, pointerEvent.clientY);
    if (!slot) return;
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    creationGestureRef.current = { pointerId: pointerEvent.pointerId, startSlot: slot, moved: false, startX: pointerEvent.clientX, startY: pointerEvent.clientY };
    const end = new Date(slot.getTime() + 60 * 60_000);
    setCreationPreview({ start: slot, end });
  };

  const updateGridCreation = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const gesture = creationGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerEvent.pointerId) return;
    const slot = pointerSlot(pointerEvent.clientX, pointerEvent.clientY);
    if (!slot) return;
    if (Math.hypot(pointerEvent.clientX - gesture.startX, pointerEvent.clientY - gesture.startY) > 5) gesture.moved = true;
    if (!gesture.moved) return;
    const start = gesture.startSlot < slot ? gesture.startSlot : slot;
    let end = gesture.startSlot < slot ? slot : gesture.startSlot;
    if (end.getTime() - start.getTime() < SNAP_MINUTES * 60_000) end = new Date(start.getTime() + SNAP_MINUTES * 60_000);
    setCreationPreview({ start: new Date(start), end: new Date(end) });
  };

  const finishGridCreation = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const gesture = creationGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerEvent.pointerId) return;
    creationGestureRef.current = null;
    const preset = creationPreview ?? { start: gesture.startSlot, end: new Date(gesture.startSlot.getTime() + 60 * 60_000) };
    setCreationPreview(null);
    onCreateEvent(preset);
  };

  const beginEventGesture = (pointerEvent: React.PointerEvent<HTMLElement>, event: GoogleCalendarEvent, mode: "move" | "start" | "end") => {
    const calendar = calendars.find((item) => item.id === event.calendarId);
    if (!isEventWritable(event, calendar) || !event.start?.dateTime) return;
    const startSlot = pointerSlot(pointerEvent.clientX, pointerEvent.clientY);
    if (!startSlot) return;
    const isTouch = pointerEvent.pointerType === "touch";
    const target = pointerEvent.currentTarget;
    const gesture = {
      pointerId: pointerEvent.pointerId,
      event,
      mode,
      startSlot,
      originalStart: new Date(event.start.dateTime),
      originalEnd: event.end?.dateTime ? new Date(event.end.dateTime) : new Date(new Date(event.start.dateTime).getTime() + 30 * 60_000),
      moved: false,
      activated: !isTouch,
      isTouch,
      longPressTimer: null as number | null,
      target,
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
    };
    eventGestureRef.current = gesture;

    if (!isTouch) {
      pointerEvent.stopPropagation();
      target.setPointerCapture(pointerEvent.pointerId);
      return;
    }

    gesture.longPressTimer = window.setTimeout(() => {
      const pendingGesture = eventGestureRef.current;
      if (!pendingGesture || pendingGesture.pointerId !== gesture.pointerId) return;
      pendingGesture.longPressTimer = null;
      pendingGesture.activated = true;
      eventDragPointersRef.current.add(pendingGesture.pointerId);
      daySwipeRef.current = null;
      setDaySwipeOffset(0);
      pendingGesture.target.setPointerCapture(pendingGesture.pointerId);
      suppressEventClickRef.current = true;
      setEventPreview({ key: `${event.calendarId}-${event.id}`, start: new Date(pendingGesture.originalStart), end: new Date(pendingGesture.originalEnd) });
      void Haptics.vibrate({ duration: 55 }).catch(() => undefined);
    }, EVENT_LONG_PRESS_MS);
  };

  const updateEventGesture = (pointerEvent: React.PointerEvent<HTMLElement>) => {
    const gesture = eventGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerEvent.pointerId) return;
    const distance = Math.hypot(pointerEvent.clientX - gesture.startX, pointerEvent.clientY - gesture.startY);
    if (!gesture.activated) {
      if (distance >= EVENT_LONG_PRESS_CANCEL_DISTANCE) {
        if (gesture.longPressTimer !== null) window.clearTimeout(gesture.longPressTimer);
        eventGestureRef.current = null;
        setEventPreview(null);
      }
      return;
    }
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const slot = pointerSlot(pointerEvent.clientX, pointerEvent.clientY);
    if (!slot) return;
    if (distance > 4) gesture.moved = true;
    if (!gesture.moved) return;
    let start = new Date(gesture.originalStart);
    let end = new Date(gesture.originalEnd);
    if (gesture.mode === "move") {
      const delta = slot.getTime() - gesture.startSlot.getTime();
      start = new Date(start.getTime() + delta);
      end = new Date(end.getTime() + delta);
    } else if (gesture.mode === "start") {
      start = new Date(Math.min(slot.getTime(), end.getTime() - SNAP_MINUTES * 60_000));
    } else {
      end = new Date(Math.max(slot.getTime(), start.getTime() + SNAP_MINUTES * 60_000));
    }
    setEventPreview({ key: `${gesture.event.calendarId}-${gesture.event.id}`, start, end });
  };

  const finishEventGesture = (pointerEvent: React.PointerEvent<HTMLElement>) => {
    const gesture = eventGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerEvent.pointerId) return;
    if (gesture.longPressTimer !== null) window.clearTimeout(gesture.longPressTimer);
    eventGestureRef.current = null;
    if (!gesture.activated) {
      setEventPreview(null);
      return;
    }
    if (!gesture.moved || !eventPreview) {
      setEventPreview(null);
      window.setTimeout(() => eventDragPointersRef.current.delete(pointerEvent.pointerId), 0);
      window.setTimeout(() => { suppressEventClickRef.current = false; }, 0);
      return;
    }
    suppressEventClickRef.current = true;
    window.setTimeout(() => { suppressEventClickRef.current = false; }, 0);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    onRequestMutation({ kind: "patch", event: gesture.event, patch: { start: { dateTime: eventPreview.start.toISOString(), timeZone }, end: { dateTime: eventPreview.end.toISOString(), timeZone } } });
    setEventPreview(null);
    window.setTimeout(() => eventDragPointersRef.current.delete(pointerEvent.pointerId), 0);
  };

  const cancelEventGesture = () => {
    const gesture = eventGestureRef.current;
    if (gesture && gesture.longPressTimer !== null) window.clearTimeout(gesture.longPressTimer);
    eventGestureRef.current = null;
    if (gesture) eventDragPointersRef.current.delete(gesture.pointerId);
    setEventPreview(null);
    suppressEventClickRef.current = false;
  };

  const settleDaySwipe = (destination = 0, direction?: number) => {
    setDaySwipeSettling(true);
    setDaySwipeOffset(destination);
    if (daySwipeTimerRef.current !== null) window.clearTimeout(daySwipeTimerRef.current);
    daySwipeTimerRef.current = window.setTimeout(() => {
      if (direction) onSwipeDay(direction);
      setDaySwipeOffset(0);
      window.requestAnimationFrame(() => setDaySwipeSettling(false));
      daySwipeTimerRef.current = null;
    }, DAY_SWIPE_SETTLE_MS);
  };

  const beginDaySwipe = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (view !== "day" || pointerEvent.pointerType !== "touch" || daySwipeSettling) return;
    daySwipeRef.current = { pointerId: pointerEvent.pointerId, startX: pointerEvent.clientX, startY: pointerEvent.clientY, axis: "pending" };
  };

  const updateDaySwipe = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const swipe = daySwipeRef.current;
    if (!swipe || swipe.pointerId !== pointerEvent.pointerId) return;
    if (eventDragPointersRef.current.has(pointerEvent.pointerId)) {
      daySwipeRef.current = null;
      setDaySwipeOffset(0);
      return;
    }
    const deltaX = pointerEvent.clientX - swipe.startX;
    const deltaY = pointerEvent.clientY - swipe.startY;
    if (swipe.axis === "pending" && Math.hypot(deltaX, deltaY) >= 10) {
      swipe.axis = Math.abs(deltaX) > Math.abs(deltaY) * DAY_SWIPE_DIRECTION_RATIO ? "horizontal" : "vertical";
    }
    if (swipe.axis === "vertical") {
      daySwipeRef.current = null;
      setDaySwipeOffset(0);
      return;
    }
    if (swipe.axis !== "horizontal") return;
    pointerEvent.preventDefault();
    if (creationGestureRef.current?.pointerId === pointerEvent.pointerId) {
      creationGestureRef.current = null;
      setCreationPreview(null);
    }
    setDaySwipeOffset(Math.max(-DAY_SWIPE_MAX_DRAG, Math.min(DAY_SWIPE_MAX_DRAG, deltaX * 0.72)));
  };

  const finishDaySwipe = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const swipe = daySwipeRef.current;
    if (!swipe || swipe.pointerId !== pointerEvent.pointerId) return;
    daySwipeRef.current = null;
    if (eventDragPointersRef.current.has(pointerEvent.pointerId) || swipe.axis !== "horizontal") {
      settleDaySwipe();
      return;
    }
    const deltaX = pointerEvent.clientX - swipe.startX;
    const deltaY = pointerEvent.clientY - swipe.startY;
    const validSwipe = Math.abs(deltaX) >= DAY_SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * DAY_SWIPE_DIRECTION_RATIO;
    if (!validSwipe) {
      settleDaySwipe();
      return;
    }
    suppressEventClickRef.current = true;
    window.setTimeout(() => { suppressEventClickRef.current = false; }, 0);
    const direction = deltaX < 0 ? 1 : -1;
    const exitDistance = Math.min(220, Math.max(150, pointerEvent.currentTarget.clientWidth * 0.45));
    settleDaySwipe(deltaX < 0 ? -exitDistance : exitDistance, direction);
  };

  const cancelDaySwipe = () => {
    daySwipeRef.current = null;
    settleDaySwipe();
  };

  const headerDayIndex = (clientX: number) => {
    const header = headerRef.current;
    if (!header) return 0;
    const bounds = header.getBoundingClientRect();
    const axisWidth = header.firstElementChild?.getBoundingClientRect().width ?? 74;
    return Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - bounds.left - axisWidth) / Math.max(1, bounds.width - axisWidth)) * days.length)));
  };

  const beginAllDayGesture = (pointerEvent: React.PointerEvent<HTMLElement>, event: GoogleCalendarEvent, mode: "move" | "start" | "end") => {
    const editable = isEventWritable(event, calendars.find((calendar) => calendar.id === event.calendarId));
    if (!editable) return;
    pointerEvent.stopPropagation();
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    allDayGestureRef.current = { pointerId: pointerEvent.pointerId, event, mode, startDayIndex: headerDayIndex(pointerEvent.clientX), moved: false, startX: pointerEvent.clientX };
  };

  const updateAllDayGesture = (pointerEvent: React.PointerEvent<HTMLElement>) => {
    const gesture = allDayGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerEvent.pointerId) return;
    pointerEvent.preventDefault();
    if (Math.abs(pointerEvent.clientX - gesture.startX) > 4) gesture.moved = true;
  };

  const finishAllDayGesture = (pointerEvent: React.PointerEvent<HTMLElement>) => {
    const action = allDayGestureRef.current;
    if (!action || action.pointerId !== pointerEvent.pointerId) return;
    allDayGestureRef.current = null;
    if (!action.moved) return;
    suppressEventClickRef.current = true;
    window.setTimeout(() => { suppressEventClickRef.current = false; }, 0);
    const day = days[headerDayIndex(pointerEvent.clientX)];
    const oldStart = action.event.start?.date;
    if (!oldStart) return;
    const event = action.event;
    const oldEnd = event.end?.date ?? addIsoDateDays(oldStart, 1);
    let nextStart = oldStart;
    let nextEnd = oldEnd;
    if (action.mode === "move") {
      const delta = headerDayIndex(pointerEvent.clientX) - action.startDayIndex;
      nextStart = addIsoDateDays(oldStart, delta);
      nextEnd = addIsoDateDays(oldEnd, delta);
    } else if (action.mode === "start") {
      nextStart = dateKey(day) < oldEnd ? dateKey(day) : addIsoDateDays(oldEnd, -1);
    } else {
      const proposedEnd = addIsoDateDays(dateKey(day), 1);
      nextEnd = proposedEnd > oldStart ? proposedEnd : addIsoDateDays(oldStart, 1);
    }
    onRequestMutation({
      kind: "patch",
      event,
      patch: {
        start: { date: nextStart },
        end: { date: nextEnd },
      },
    });
  };

  const segmentForDay = (event: GoogleCalendarEvent, day: Date) => {
    if (!event.start?.dateTime) return null;
    const key = `${event.calendarId}-${event.id}`;
    const start = eventPreview?.key === key ? eventPreview.start : new Date(event.start.dateTime);
    const end = eventPreview?.key === key ? eventPreview.end : event.end?.dateTime ? new Date(event.end.dateTime) : new Date(start.getTime() + 30 * 60_000);
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    if (end <= dayStart || start >= dayEnd) return null;
    const visibleStart = start < dayStart ? dayStart : start;
    const visibleEnd = end > dayEnd ? dayEnd : end;
    const startMinutes = visibleStart <= dayStart ? 0 : visibleStart.getHours() * 60 + visibleStart.getMinutes();
    const endMinutes = visibleEnd >= dayEnd ? 24 * 60 : visibleEnd.getHours() * 60 + visibleEnd.getMinutes();
    return {
      start,
      end,
      top: startMinutes / 60 * HOUR_HEIGHT,
      height: Math.max(22, (endMinutes - startMinutes) / 60 * HOUR_HEIGHT - EVENT_GAP),
      beginsHere: start >= dayStart && start < dayEnd,
      endsHere: end > dayStart && end <= dayEnd,
    };
  };

  return <div className={`calendar-time-view ${view === "day" ? "day-view" : "week-view"}${daySwipeSettling ? " day-swipe-settling" : ""}`} onPointerDown={beginDaySwipe} onPointerMove={updateDaySwipe} onPointerUp={finishDaySwipe} onPointerCancel={cancelDaySwipe} style={{ transform: view === "day" ? `translateX(${daySwipeOffset}px)` : undefined }}>
    <div className="calendar-time-header" ref={headerRef} style={{ "--day-count": days.length, flexBasis: hasAllDayEvents ? 58 : 36 } as React.CSSProperties}>
      <div />
      {days.map((day) => <div key={dateKey(day)} className={dateKey(day) === today ? "current-day" : ""} onClick={() => onCreateEvent({ start: new Date(`${dateKey(day)}T00:00:00`), end: new Date(`${addIsoDateDays(dateKey(day), 1)}T00:00:00`), allDay: true })} style={hasAllDayEvents ? { flexDirection: "column", gap: 0, padding: "3px 3px 2px", cursor: "pointer" } : { cursor: "pointer" }}>
        <div style={hasAllDayEvents ? { display: "flex", alignItems: "center", gap: 6, height: 25 } : undefined}><span className="calendar-mobile-full-day-label">{fullDayHeader(day)}</span><span className="calendar-day-short-label">{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></div>
        {events.filter((event) => allDayEventOccursOn(event, day)).map((event) => {
          const editable = isEventWritable(event, calendars.find((calendar) => calendar.id === event.calendarId));
          const isFirstDay = event.start?.date === dateKey(day);
          const isLastDay = addIsoDateDays(event.end?.date ?? addIsoDateDays(event.start!.date!, 1), -1) === dateKey(day);
          return <button type="button" className="calendar-all-day-header-event" key={`${event.calendarId}-${event.id}`} onPointerDown={(pointerEvent) => beginAllDayGesture(pointerEvent, event, "move")} onPointerMove={updateAllDayGesture} onPointerUp={finishAllDayGesture} onPointerCancel={() => { allDayGestureRef.current = null; }} onClick={(clickEvent) => { clickEvent.stopPropagation(); if (!suppressEventClickRef.current) onSelectEvent(event); }} style={{ width: "100%", minHeight: 16, overflow: "hidden", marginTop: 1, padding: "1px 8px", border: 0, borderRadius: 4, background: mutedCalendarColor(event.color), color: "#121820", cursor: editable ? "grab" : "pointer", touchAction: editable ? "none" : undefined, fontSize: 9, fontWeight: 750, lineHeight: "14px", textAlign: "left", textOverflow: "ellipsis", whiteSpace: "nowrap", filter: hasAllDayEventPassed(event, now) ? "brightness(.72) saturate(.82)" : undefined, opacity: hasAllDayEventPassed(event, now) ? 0.82 : 1 }} title={event.summary ?? "Untitled event"}>
            {editable && isFirstDay && <span className="calendar-all-day-resize start" onPointerDown={(pointerEvent) => beginAllDayGesture(pointerEvent, event, "start")} />}
            <span className="calendar-all-day-title"><CalendarItemTitle event={event} /></span>
            {editable && isLastDay && <span className="calendar-all-day-resize end" onPointerDown={(pointerEvent) => beginAllDayGesture(pointerEvent, event, "end")} />}
          </button>;
        })}
      </div>)}
    </div>
    <div className="calendar-time-scroll" ref={scrollContainerRef}>
      <div className="calendar-time-grid" style={{ "--day-count": days.length, minHeight: TIME_GRID_TOP_OFFSET + HOURS.length * HOUR_HEIGHT, paddingTop: TIME_GRID_TOP_OFFSET } as React.CSSProperties}>
        <div aria-hidden="true" style={{ position: "absolute", zIndex: 6, inset: 0, pointerEvents: "none" }}>
          <span style={{ position: "absolute", top: TIME_GRID_TOP_OFFSET, left: `calc(var(--calendar-time-axis) - ${GRID_TICK_LENGTH}px)`, width: GRID_TICK_LENGTH, height: 1, background: "var(--calendar-border)" }} />
          {Array.from({ length: days.length }, (_, index) => <span key={index} style={{ position: "absolute", top: TIME_GRID_TOP_OFFSET - GRID_TICK_LENGTH, left: `calc(var(--calendar-time-axis) + (100% - var(--calendar-time-axis)) * ${index / days.length})`, width: 1, height: GRID_TICK_LENGTH, background: "var(--calendar-border)" }} />)}
        </div>
        <div className="calendar-hours" style={{ position: "relative", zIndex: 4, background: "var(--calendar-panel)" }}>{HOURS.map((hour, index) => <span key={hour} style={{ top: index === 0 ? 0 : (hour - HOURS[0]) * HOUR_HEIGHT, paddingLeft: 3, background: "var(--calendar-panel)" }}><span className="calendar-hour-full">{shortTime(hour)}</span><span className="calendar-hour-mobile">{hour % 12 || 12}{hour >= 12 ? "p" : "a"}</span></span>)}</div>
        <div className="calendar-columns" ref={columnsRef} {...taskDrop.handlers} onPointerDown={startGridCreation} onPointerMove={updateGridCreation} onPointerUp={finishGridCreation} onPointerCancel={() => { creationGestureRef.current = null; setCreationPreview(null); }}>
          {days.map((day) => {
            const isToday = dateKey(day) === today;
            return <div className="calendar-day-column" key={dateKey(day)}>
              {HOURS.map((hour) => <div className="calendar-hour-line" key={hour} />)}
              {taskDrop.preview && draggedTask && (() => {
                const placeholder: GoogleCalendarEvent = { id: "task-drop-preview", calendarId: "preview", start: { dateTime: taskDrop.preview.start.toISOString() }, end: { dateTime: taskDrop.preview.end.toISOString() } };
                const segment = segmentForDay(placeholder, day);
                return segment ? <div className="calendar-creation-preview calendar-task-drop-preview" style={{ top: segment.top, height: segment.height }}><strong>{draggedTask.title}</strong><span>{eventTimeRange(placeholder)}</span></div> : null;
              })()}
              {creationPreview && (() => {
                const placeholder: GoogleCalendarEvent = { id: "creation-preview", calendarId: "preview", start: { dateTime: creationPreview.start.toISOString() }, end: { dateTime: creationPreview.end.toISOString() } };
                const segment = segmentForDay(placeholder, day);
                return segment ? <div className="calendar-creation-preview" style={{ top: segment.top, height: segment.height }}><span>{eventTimeRange(placeholder)}</span></div> : null;
              })()}
              {events.filter((event) => event.start?.dateTime).map((event) => {
                const segment = segmentForDay(event, day);
                if (!segment) return null;
                const isPast = hasEventPassed(event, now);
                const editable = isEventWritable(event, calendars.find((calendar) => calendar.id === event.calendarId));
                return <button type="button" className={`google-calendar-event${editable ? " editable" : ""}${eventPreview?.key === `${event.calendarId}-${event.id}` ? " dragging" : ""}`} key={`${event.calendarId}-${event.id}-${dateKey(day)}`} onClick={() => { if (!suppressEventClickRef.current) onSelectEvent(event); }} onPointerDown={(pointerEvent) => beginEventGesture(pointerEvent, event, "move")} onPointerMove={updateEventGesture} onPointerUp={finishEventGesture} onPointerCancel={cancelEventGesture} style={{ top: segment.top, height: segment.height, background: mutedCalendarColor(event.color), filter: isPast ? "brightness(.72) saturate(.82)" : undefined, opacity: isPast ? 0.82 : 1 }} title={event.summary ?? "Untitled event"}>
                  {editable && segment.beginsHere && <span className="calendar-resize-handle top" onPointerDown={(pointerEvent) => beginEventGesture(pointerEvent, event, "start")} />}
                  <strong><CalendarItemTitle event={event} /></strong>
                  {segment.height >= 48 && <span className="calendar-event-time">{eventTimeRange({ ...event, start: { ...event.start, dateTime: segment.start.toISOString() }, end: { ...event.end, dateTime: segment.end.toISOString() } })}</span>}
                  {segment.height >= 68 && event.location && <span className="calendar-event-location">{event.location}</span>}
                  {editable && segment.endsHere && <span className="calendar-resize-handle bottom" onPointerDown={(pointerEvent) => beginEventGesture(pointerEvent, event, "end")} />}
                </button>;
              })}
              {isToday && <div className="calendar-current-time" style={{ top: currentTimeTop }} aria-label="Current time" />}
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}

function CalendarEventModal({ event, calendar, onClose, onEdit }: { event: GoogleCalendarEvent; calendar?: GoogleCalendar; onClose: () => void; onEdit?: () => void }) {
  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const description = plainDescription(event.description);
  const host = event.organizer ?? event.creator;
  const attendees = event.attendees?.filter((attendee) => !attendee.self) ?? [];
  const meetingLink = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entryPoint) => entryPoint.uri)?.uri;
  return <div className="calendar-event-modal-backdrop" onMouseDown={onClose} style={{ position: "fixed", zIndex: 80, inset: 0, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.66)" }}>
    <section className="calendar-event-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()} style={{ width: "min(480px, 100%)", boxSizing: "border-box", padding: 20, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)", boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 19 }}><span className="calendar-event-color" style={{ width: 42, height: 8, borderRadius: 999, background: mutedCalendarColor(event.color) }} /><button type="button" onClick={onClose} aria-label="Close event details" style={{ width: 36, height: 36, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" }}><span className="material-symbols-rounded">close</span></button></header>
      <p className="calendar-event-modal-label" style={{ margin: "0 0 6px", color: "var(--secondary)", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>{calendar?.summary ?? "Google Calendar"}</p>
      <h2 id="calendar-event-title" style={{ margin: "0 0 20px", color: "var(--primary)", fontSize: 23, fontWeight: 850, letterSpacing: "-.025em", lineHeight: 1.15 }}>{event.summary ?? "Untitled event"}</h2>
      <div className="calendar-event-detail" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 0", borderTop: "1px solid var(--border)", color: "var(--primary)" }}><span className="material-symbols-rounded" style={{ marginTop: 1, color: "var(--secondary)", fontSize: 19 }}>schedule</span><p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{eventDateTimeRange(event)}</p></div>
      {event.location && <div className="calendar-event-detail" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 0", borderTop: "1px solid var(--border)", color: "var(--primary)" }}><span className="material-symbols-rounded" style={{ marginTop: 1, color: "var(--secondary)", fontSize: 19 }}>location_on</span><p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{event.location}</p></div>}
      {host && <div className="calendar-event-detail" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 0", borderTop: "1px solid var(--border)", color: "var(--primary)" }}><span className="material-symbols-rounded" style={{ marginTop: 1, color: "var(--secondary)", fontSize: 19 }}>person</span><p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>Organized by {host.displayName ?? host.email ?? "Google Calendar"}</p></div>}
      {attendees.length > 0 && <div className="calendar-event-detail" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 0", borderTop: "1px solid var(--border)", color: "var(--primary)" }}><span className="material-symbols-rounded" style={{ marginTop: 1, color: "var(--secondary)", fontSize: 19 }}>group</span><p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{attendees.map((attendee) => attendee.displayName ?? attendee.email).filter(Boolean).join(", ")}</p></div>}
      {(event.recurrence || event.recurringEventId) && <div className="calendar-event-detail" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 0", borderTop: "1px solid var(--border)", color: "var(--primary)" }}><span className="material-symbols-rounded" style={{ marginTop: 1, color: "var(--secondary)", fontSize: 19 }}>repeat</span><p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>Repeating event</p></div>}
      {description && <div className="calendar-event-description" style={{ margin: "5px 0 0", padding: 13, borderRadius: 13, background: "var(--surface-variant)", color: "var(--secondary)" }}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{description}</p></div>}
      {(meetingLink || event.htmlLink) && <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        {meetingLink && <a href={meetingLink} target="_blank" rel="noreferrer" style={{ flex: 1, padding: "11px 8px", border: "1px solid var(--border)", borderRadius: 11, color: "var(--primary)", fontSize: 13, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>Join meeting</a>}
        {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" style={{ flex: 1, padding: "11px 8px", border: "1px solid var(--border)", borderRadius: 11, color: "var(--primary)", fontSize: 13, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>Open in Google</a>}
      </div>}
      <div style={{ display: "flex", gap: 9, marginTop: 20 }}>{onEdit && <button type="button" onClick={onEdit} style={{ flex: 1, padding: 12, border: 0, borderRadius: 12, background: "var(--primary)", color: "var(--background)", cursor: "pointer", fontSize: 14, fontWeight: 850 }}>Edit event</button>}<button type="button" className="calendar-event-close-button" onClick={onClose} style={{ flex: 1, marginTop: 0, padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", fontSize: 14, fontWeight: 850 }}>Done</button></div>
    </section>
  </div>;
}

function CalendarActionPrompt({ prompt, onCancel, onOccurrence, onSeries, onGuests }: { prompt: EventActionPrompt; onCancel: () => void; onOccurrence: (mutation: EventMutation) => void; onSeries: (mutation: EventMutation) => void; onGuests: (mutation: EventMutation, scope: "occurrence" | "series", sendUpdates: GuestUpdateMode) => void }) {
  const deleting = prompt.mutation.kind === "delete";
  return <div role="presentation" onMouseDown={onCancel} style={{ position: "fixed", zIndex: 94, inset: 0, display: "grid", placeItems: "center", padding: 22, background: "rgba(0,0,0,.72)" }}>
    <section role="dialog" aria-modal="true" aria-label={prompt.kind === "recurrence" ? "Choose repeating event scope" : "Choose guest notifications"} onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()} style={{ width: "min(410px, 100%)", padding: 21, border: "1px solid var(--border)", borderRadius: 19, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0,0,0,.48)" }}>
      <h3 style={{ margin: "0 0 7px", color: "var(--primary)", fontSize: 19 }}>{prompt.kind === "recurrence" ? `${deleting ? "Delete" : "Change"} repeating event` : "Notify guests?"}</h3>
      <p style={{ margin: "0 0 18px", color: "var(--secondary)", fontSize: 13, lineHeight: 1.45 }}>{prompt.kind === "recurrence" ? "Choose how much of this repeating event Google Calendar should update." : "This event has guests. Choose whether Google Calendar should send them an update."}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {prompt.kind === "recurrence" ? <>
          <button type="button" onClick={() => onOccurrence(prompt.mutation)} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", fontWeight: 800 }}>This occurrence</button>
          <button type="button" onClick={() => onSeries(prompt.mutation)} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", fontWeight: 800 }}>Entire series</button>
        </> : <>
          <button type="button" onClick={() => onGuests(prompt.mutation, prompt.scope, "all")} style={{ padding: 12, border: 0, borderRadius: 11, background: "var(--primary)", color: "var(--background)", cursor: "pointer", fontWeight: 850 }}>Notify all guests</button>
          <button type="button" onClick={() => onGuests(prompt.mutation, prompt.scope, "none")} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", fontWeight: 800 }}>Save without notifications</button>
        </>}
        <button type="button" onClick={onCancel} style={{ padding: 10, border: 0, background: "transparent", color: "var(--secondary)", cursor: "pointer", fontWeight: 750 }}>Cancel</button>
      </div>
    </section>
  </div>;
}

function MonthView({ focusDate, events, calendars, onSelectEvent, onCreateEvent, onRequestMutation, draggedTask, onTaskDrop }: { focusDate: Date; events: GoogleCalendarEvent[]; calendars: GoogleCalendar[]; onSelectEvent: (event: GoogleCalendarEvent) => void; onCreateEvent: (preset: CalendarEditorPreset) => void; onRequestMutation: (mutation: EventMutation) => void; draggedTask: Task | null; onTaskDrop: (task: Task, date: Date) => void }) {
  const [draggedEvent, setDraggedEvent] = useState<{ event: GoogleCalendarEvent; sourceDay: Date } | null>(null);
  const [taskHover, setTaskHover] = useState<{ id: string; day: string } | null>(null);
  const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const today = dateKey(new Date());
  return <div className="calendar-month-view">
    <div className="calendar-month-weekdays">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <span key={day} aria-label={day}><span className="calendar-weekday-full">{day}</span><span className="calendar-weekday-short" aria-hidden="true">{day.slice(0, 3)}</span></span>)}</div>
    <div className="calendar-month-grid">
      {days.map((day) => {
        const key = dateKey(day);
        const dropEvent = () => {
          const eventStart = draggedEvent?.event.start;
          if (!draggedEvent || !eventStart) return;
          const event = draggedEvent.event;
          const delta = calendarDayDifference(draggedEvent.sourceDay, day);
          if (eventStart.date) {
            onRequestMutation({ kind: "patch", event, patch: { start: { date: addIsoDateDays(eventStart.date, delta) }, end: { date: addIsoDateDays(event.end?.date ?? addIsoDateDays(eventStart.date, 1), delta) } } });
          } else if (eventStart.dateTime) {
            const oldStart = new Date(eventStart.dateTime);
            const newStart = new Date(oldStart); newStart.setDate(newStart.getDate() + delta);
            const oldEnd = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(oldStart.getTime() + 30 * 60_000);
            const newEnd = new Date(oldEnd); newEnd.setDate(newEnd.getDate() + delta);
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            onRequestMutation({ kind: "patch", event, patch: { start: { dateTime: newStart.toISOString(), timeZone }, end: { dateTime: newEnd.toISOString(), timeZone } } });
          }
          setDraggedEvent(null);
        };
        return <div className={`calendar-month-cell ${day.getMonth() !== focusDate.getMonth() ? "muted" : ""}${draggedTask && taskHover?.id === draggedTask.id && taskHover.day === key ? " task-drop-target" : ""}`} key={key} onClick={() => onCreateEvent({ start: new Date(`${key}T00:00:00`), end: new Date(`${addIsoDateDays(key, 1)}T00:00:00`), allDay: true })} onDragOver={(dragEvent) => { if (draggedTask && dragEvent.dataTransfer.types.includes(TASK_DRAG_TYPE)) { dragEvent.preventDefault(); dragEvent.dataTransfer.dropEffect = "move"; setTaskHover({ id: draggedTask.id, day: key }); } else if (draggedEvent) dragEvent.preventDefault(); }} onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTaskHover(null); }} onDrop={(dragEvent) => { dragEvent.preventDefault(); setTaskHover(null); if (draggedTask && dragEvent.dataTransfer.getData(TASK_DRAG_TYPE) === draggedTask.id) { onTaskDrop(draggedTask, day); } else dropEvent(); }}>
          <span className={key === today ? "today" : ""}>{day.getDate()}</span>
          {draggedTask && taskHover?.id === draggedTask.id && taskHover.day === key && <div className="calendar-month-task-preview"><strong>{draggedTask.title}</strong><span>Drop to choose time</span></div>}
          {events.filter((event) => event.start && (event.start.date ? allDayEventOccursOn(event, day) : dateKey(new Date(event.start.dateTime!)) === key)).slice(0, 3).map((event) => {
            const editable = isEventWritable(event, calendars.find((calendar) => calendar.id === event.calendarId));
return <button type="button" draggable={editable} className="google-calendar-month-event" key={`${event.calendarId}-${event.id}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); onSelectEvent(event); }} onDragStart={(dragEvent) => { dragEvent.stopPropagation(); setDraggedEvent({ event, sourceDay: day }); }} onDragEnd={() => setDraggedEvent(null)} style={{ width: "100%", borderTop: 0, borderRight: 0, borderBottom: 0, borderLeftColor: event.color ?? "#4285f4", background: "transparent", cursor: editable ? "grab" : "pointer", textAlign: "left" }}><CalendarItemTitle event={event} /></button>;
          })}
        </div>;
      })}
    </div>
  </div>;
}
