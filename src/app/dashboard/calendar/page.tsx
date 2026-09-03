"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

type CalendarView = "week" | "day" | "month";

type GoogleCalendar = { id: string; summary: string; backgroundColor?: string; primary?: boolean };
type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  organizer?: { displayName?: string; email?: string };
  creator?: { displayName?: string; email?: string };
  attendees?: { displayName?: string; email?: string; responseStatus?: string; self?: boolean }[];
  hangoutLink?: string;
  htmlLink?: string;
  recurrence?: string[];
  conferenceData?: { entryPoints?: { uri?: string; label?: string; entryPointType?: string }[] };
  attachments?: { title?: string; fileUrl?: string }[];
  calendarId: string;
  color?: string;
};

type GoogleCalendarCache = {
  calendars: GoogleCalendar[];
  events: GoogleCalendarEvent[];
  savedAt: number;
};

const HOUR_HEIGHT = 45;
const TIME_GRID_TOP_OFFSET = 16;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const EVENT_GAP = 6;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function calendarCheckboxColor(calendar: GoogleCalendar) {
  // The native checkbox uses a white check on Google Calendar's darker red.
  // A slightly lighter Google-red keeps Math consistent with the other layers.
  return calendar.summary.toLowerCase().includes("math") ? "#f28b82" : (calendar.backgroundColor ?? "#41e987");
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
  const [view, setView] = useState<CalendarView>("week");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<string[]>([]);
  const [draggedCalendarId, setDraggedCalendarId] = useState<string | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasSavedCalendarSync, setHasSavedCalendarSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEvent | null>(null);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(focusDate), index));
  const tokenStorageKey = user ? `committed-google-calendar-token:${user.uid}` : null;
  const calendarOrderStorageKey = user ? `committed-google-calendar-order:${user.uid}` : null;
  const calendarCacheStorageKey = user ? `committed-google-calendar-cache:${user.uid}` : null;

  const loadGoogleCalendar = useCallback(async (token: string) => {
    const headers = { Authorization: `Bearer ${token}` };
    const calendarResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers });
    if (!calendarResponse.ok) throw new Error("Google Calendar could not be loaded.");
    const calendarData = await calendarResponse.json() as { items?: GoogleCalendar[] };
    const receivedCalendars = calendarData.items ?? [];
    let savedOrder: string[] = [];
    try {
      savedOrder = calendarOrderStorageKey ? JSON.parse(localStorage.getItem(calendarOrderStorageKey) ?? "[]") : [];
    } catch {
      savedOrder = [];
    }
    const nextCalendars = [...receivedCalendars].sort((first, second) => {
      const firstIndex = savedOrder.indexOf(first.id);
      const secondIndex = savedOrder.indexOf(second.id);
      return (firstIndex < 0 ? Number.MAX_SAFE_INTEGER : firstIndex) - (secondIndex < 0 ? Number.MAX_SAFE_INTEGER : secondIndex);
    });
    setCalendars(nextCalendars);
    setVisibleCalendarIds((currentIds) => {
      const nextIds = nextCalendars.map((calendar) => calendar.id);
      return currentIds.length === 0 ? nextIds : [...currentIds.filter((id) => nextIds.includes(id)), ...nextIds.filter((id) => !currentIds.includes(id))];
    });

    const start = new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, 1).toISOString();
    const end = new Date(focusDate.getFullYear(), focusDate.getMonth() + 2, 1).toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    if (calendarCacheStorageKey) {
      localStorage.setItem(calendarCacheStorageKey, JSON.stringify({ calendars: nextCalendars, events: nextEvents, savedAt: Date.now() } satisfies GoogleCalendarCache));
      setHasSavedCalendarSync(true);
    }
  }, [calendarCacheStorageKey, calendarOrderStorageKey, focusDate]);

  const syncGoogleCalendar = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const token = accessToken ?? await connectGoogleCalendar();
      setAccessToken(token);
      if (tokenStorageKey) sessionStorage.setItem(tokenStorageKey, token);
      await loadGoogleCalendar(token);
    } catch (error) {
      setAccessToken(null);
      if (tokenStorageKey) sessionStorage.removeItem(tokenStorageKey);
      setSyncError(error instanceof Error ? error.message : "Could not connect Google Calendar.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!tokenStorageKey || !calendarCacheStorageKey) {
      setAccessToken(null);
      setHasSavedCalendarSync(false);
      setCalendars([]);
      setEvents([]);
      return;
    }
    setAccessToken(sessionStorage.getItem(tokenStorageKey));
    try {
      const cache = JSON.parse(localStorage.getItem(calendarCacheStorageKey) ?? "null") as GoogleCalendarCache | null;
      if (!cache || !Array.isArray(cache.calendars) || !Array.isArray(cache.events)) return;
      setCalendars(cache.calendars);
      setVisibleCalendarIds(cache.calendars.map((calendar) => calendar.id));
      setEvents(cache.events);
      setHasSavedCalendarSync(true);
    } catch {
      localStorage.removeItem(calendarCacheStorageKey);
    }
  }, [calendarCacheStorageKey, tokenStorageKey]);

  useEffect(() => {
    if (!accessToken) return;
    void loadGoogleCalendar(accessToken).catch(() => {
      setAccessToken(null);
      if (tokenStorageKey) sessionStorage.removeItem(tokenStorageKey);
    });
  }, [accessToken, loadGoogleCalendar, tokenStorageKey]);

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
      return reordered;
    });
  };

  const visibleEvents = events.filter((event) => visibleCalendarIds.includes(event.calendarId));

  return (
    <div className="committed-calendar-page">
      <header className="calendar-toolbar">
        <div className="calendar-title-lockup"><h1>Committed</h1></div>
        <div className="calendar-controls">
          <button className="calendar-outline-button" onClick={() => setFocusDate(new Date())}>Today</button>
          <button className="calendar-icon-button" aria-label="Previous" onClick={() => move(-1)}><span className="material-symbols-rounded">chevron_left</span></button>
          <button className="calendar-icon-button" aria-label="Next" onClick={() => move(1)}><span className="material-symbols-rounded">chevron_right</span></button>
          <h2>{heading}</h2>
        </div>
        <div className="calendar-toolbar-actions">
          <button className="calendar-top-placeholder" aria-label="Search"><span className="material-symbols-rounded">search</span></button>
          <button className="calendar-outline-button" onClick={syncGoogleCalendar} disabled={syncing}>{syncing ? "Syncing…" : accessToken || hasSavedCalendarSync ? "Refresh Sync" : "Connect Google"}</button>
          <div className="calendar-view-select" role="group" aria-label="Calendar view">
            {(["day", "week", "month"] as CalendarView[]).map((option) => <button key={option} className={view === option ? "active" : ""} onClick={() => setView(option)}>{option}</button>)}
          </div>
        </div>
      </header>

      <div className="calendar-workspace">
        <aside className="calendar-sidebar">
          <button className="calendar-create-button"><span className="material-symbols-rounded">add</span>Create</button>
          <MiniCalendar selectedDate={focusDate} onSelect={setFocusDate} />
          <section className="calendar-layers">
            <p>My calendars</p>
            {calendars.length === 0
              ? <span className="calendar-empty-layers">{syncError ?? "Connect Google Calendar to see your schedule."}</span>
              : calendars.map((calendar) => <label className="calendar-layer" key={calendar.id} draggable onDragStart={() => setDraggedCalendarId(calendar.id)} onDragEnd={() => setDraggedCalendarId(null)} onDragOver={(dragEvent) => dragEvent.preventDefault()} onDrop={() => { if (draggedCalendarId) moveCalendar(draggedCalendarId, calendar.id); setDraggedCalendarId(null); }} style={{ opacity: draggedCalendarId === calendar.id ? 0.55 : 1 }}>
                <span className="material-symbols-rounded" aria-hidden="true" style={{ color: "var(--secondary)", fontSize: 16, cursor: "grab" }}>drag_indicator</span>
                <input type="checkbox" checked={visibleCalendarIds.includes(calendar.id)} onChange={() => setVisibleCalendarIds((ids) => ids.includes(calendar.id) ? ids.filter((id) => id !== calendar.id) : [...ids, calendar.id])} aria-label={`Show ${calendar.summary}`} style={{ accentColor: calendarCheckboxColor(calendar) }} />
                {calendar.summary}{calendar.primary ? " (primary)" : ""}
              </label>)}
          </section>
        </aside>
        <main className="calendar-main">
          {view === "month" ? <MonthView focusDate={focusDate} onSelect={setFocusDate} events={visibleEvents} /> : <TimeGrid view={view} days={view === "day" ? [focusDate] : weekDays} events={visibleEvents} onSelectEvent={setSelectedEvent} />}
        </main>
      </div>
      {selectedEvent && <CalendarEventModal event={selectedEvent} calendar={calendars.find((calendar) => calendar.id === selectedEvent.calendarId)} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

function TimeGrid({ view, days, events, onSelectEvent }: { view: CalendarView; days: Date[]; events: GoogleCalendarEvent[]; onSelectEvent: (event: GoogleCalendarEvent) => void }) {
  const [now, setNow] = useState(() => new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const today = dateKey(now);
  const currentTimeTop = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
  const daySignature = days.map(dateKey).join("|");

  useEffect(() => {
    const current = new Date();
    if (!daySignature.split("|").includes(dateKey(current))) return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    const top = TIME_GRID_TOP_OFFSET + (current.getHours() + current.getMinutes() / 60) * HOUR_HEIGHT;
    scrollContainer.scrollTop = Math.max(0, top - scrollContainer.clientHeight / 2);
  }, [daySignature]);
  return <div className={`calendar-time-view ${view === "day" ? "day-view" : "week-view"}`}>
    <div className="calendar-time-header" style={{ "--day-count": days.length } as React.CSSProperties}>
      <div />
      {days.map((day) => <div key={dateKey(day)} className={dateKey(day) === today ? "current-day" : ""}><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></div>)}
    </div>
    <div className="calendar-time-scroll" ref={scrollContainerRef}>
      <div className="calendar-time-grid" style={{ "--day-count": days.length, minHeight: TIME_GRID_TOP_OFFSET + HOURS.length * HOUR_HEIGHT } as React.CSSProperties}>
        <div className="calendar-hours">{HOURS.map((hour, index) => <span key={hour} style={{ top: index === 0 ? 0 : (hour - HOURS[0]) * HOUR_HEIGHT }}>{shortTime(hour)}</span>)}</div>
        <div className="calendar-columns">
          {days.map((day) => {
            const isToday = dateKey(day) === today;
            return <div className="calendar-day-column" key={dateKey(day)}>
              {HOURS.map((hour) => <div className="calendar-hour-line" key={hour} />)}
              {events.filter((event) => event.start?.dateTime && dateKey(new Date(event.start.dateTime)) === dateKey(day)).map((event) => {
                const start = new Date(event.start!.dateTime!);
                const end = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(start.getTime() + 30 * 60_000);
                const top = (start.getHours() + start.getMinutes() / 60) * HOUR_HEIGHT;
                const height = Math.max(22, ((end.getTime() - start.getTime()) / 3_600_000) * HOUR_HEIGHT - EVENT_GAP);
                const isPast = hasEventPassed(event, now);
                return <button type="button" className="google-calendar-event" key={`${event.calendarId}-${event.id}`} onClick={() => onSelectEvent(event)} style={{ top, height, background: mutedCalendarColor(event.color), filter: isPast ? "brightness(.72) saturate(.82)" : undefined, opacity: isPast ? 0.82 : 1 }} title={event.summary ?? "Untitled event"}>
                  <strong>{event.summary ?? "Untitled event"}</strong>
                  {height >= 48 && <span>{eventTimeRange(event)}</span>}
                  {height >= 68 && event.location && <span>{event.location}</span>}
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

function CalendarEventModal({ event, calendar, onClose }: { event: GoogleCalendarEvent; calendar?: GoogleCalendar; onClose: () => void }) {
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
      {event.recurrence && <div className="calendar-event-detail" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 0", borderTop: "1px solid var(--border)", color: "var(--primary)" }}><span className="material-symbols-rounded" style={{ marginTop: 1, color: "var(--secondary)", fontSize: 19 }}>repeat</span><p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>Repeating event</p></div>}
      {description && <div className="calendar-event-description" style={{ margin: "5px 0 0", padding: 13, borderRadius: 13, background: "var(--surface-variant)", color: "var(--secondary)" }}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{description}</p></div>}
      {(meetingLink || event.htmlLink) && <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        {meetingLink && <a href={meetingLink} target="_blank" rel="noreferrer" style={{ flex: 1, padding: "11px 8px", border: "1px solid var(--border)", borderRadius: 11, color: "var(--primary)", fontSize: 13, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>Join meeting</a>}
        {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" style={{ flex: 1, padding: "11px 8px", border: "1px solid var(--border)", borderRadius: 11, color: "var(--primary)", fontSize: 13, fontWeight: 800, textAlign: "center", textDecoration: "none" }}>Open in Google</a>}
      </div>}
      <button type="button" className="calendar-event-close-button" onClick={onClose} style={{ width: "100%", marginTop: 20, padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", fontSize: 14, fontWeight: 850 }}>Done</button>
    </section>
  </div>;
}

function MonthView({ focusDate, onSelect, events }: { focusDate: Date; onSelect: (date: Date) => void; events: GoogleCalendarEvent[] }) {
  const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const today = dateKey(new Date());
  return <div className="calendar-month-view">
    <div className="calendar-month-weekdays">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-month-grid">
      {days.map((day) => {
        const key = dateKey(day);
        return <button className={`calendar-month-cell ${day.getMonth() !== focusDate.getMonth() ? "muted" : ""}`} key={key} onClick={() => onSelect(day)}>
          <span className={key === today ? "today" : ""}>{day.getDate()}</span>
          {events.filter((event) => event.start && dateKey(new Date(event.start.dateTime ?? `${event.start.date}T12:00:00`)) === key).slice(0, 3).map((event) => <small className="google-calendar-month-event" key={`${event.calendarId}-${event.id}`} style={{ borderColor: event.color ?? "#4285f4" }}>{event.summary ?? "Untitled event"}</small>)}
        </button>;
      })}
    </div>
  </div>;
}
