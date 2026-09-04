"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SyncedGoogleCalendar, SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";
import MaterialIcon from "@/components/material-icon";

export type CalendarEditorPreset = {
  start: Date;
  end: Date;
  allDay?: boolean;
};

export type CalendarEventDraft = {
  summary: string;
  calendarId: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseLocalValue(dateValue: string, timeValue = "12:00") {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function formatScheduleValue(dateValue: string, timeValue: string, allDay: boolean) {
  if (!dateValue) return "Select";
  const date = parseLocalValue(dateValue, timeValue || "12:00");
  if (allDay) return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · All day`;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initialDraft(event: SyncedGoogleCalendarEvent | null, preset: CalendarEditorPreset, calendars: SyncedGoogleCalendar[]): CalendarEventDraft {
  const defaultCalendar = calendars.find((calendar) => calendar.primary) ?? calendars[0];
  if (!event) {
    return {
      summary: "",
      calendarId: defaultCalendar?.id ?? "",
      allDay: Boolean(preset.allDay),
      startDate: localDateValue(preset.start),
      startTime: localTimeValue(preset.start),
      endDate: localDateValue(preset.allDay ? preset.start : preset.end),
      endTime: localTimeValue(preset.end),
      location: "",
      description: "",
    };
  }
  const allDay = Boolean(event.start?.date);
  const start = event.start?.dateTime ? new Date(event.start.dateTime) : new Date(`${event.start?.date ?? localDateValue(preset.start)}T12:00:00`);
  const exclusiveEnd = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(`${event.end?.date ?? event.start?.date ?? localDateValue(preset.end)}T12:00:00`);
  const displayEnd = allDay ? addDays(exclusiveEnd, -1) : exclusiveEnd;
  return {
    summary: event.summary ?? "",
    calendarId: event.calendarId,
    allDay,
    startDate: localDateValue(start),
    startTime: localTimeValue(start),
    endDate: localDateValue(displayEnd),
    endTime: localTimeValue(displayEnd),
    location: event.location ?? "",
    description: event.description ?? "",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: "1px solid var(--border)",
  borderRadius: 11,
  outline: "none",
  background: "var(--background)",
  color: "var(--primary)",
  font: "inherit",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  minWidth: 0,
  gap: 6,
  color: "var(--secondary)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".05em",
  textTransform: "uppercase",
};

type CalendarScheduleDraft = Pick<CalendarEventDraft, "allDay" | "startDate" | "startTime" | "endDate" | "endTime">;

function CalendarSchedulePicker({ value, onClose, onSave }: { value: CalendarScheduleDraft; onClose: () => void; onSave: (value: CalendarScheduleDraft) => void }) {
  const [working, setWorking] = useState(value);
  const [field, setField] = useState<"start" | "end">("start");
  const [month, setMonth] = useState(() => parseLocalValue(value.startDate, value.startTime || "12:00"));
  const initialTime = parseLocalValue(value.startDate, value.startTime || "12:00");
  const [hourText, setHourText] = useState(String(((initialTime.getHours() + 11) % 12) + 1));
  const [minuteText, setMinuteText] = useState(pad(initialTime.getMinutes()));
  const [error, setError] = useState<string | null>(null);

  const activeDateValue = field === "start" ? working.startDate : working.endDate;
  const activeTimeValue = field === "start" ? working.startTime : working.endTime;
  const activeDate = parseLocalValue(activeDateValue, activeTimeValue || "12:00");
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  monthStart.setDate(1 - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(monthStart);
    date.setDate(monthStart.getDate() + index);
    return date;
  });

  const validTime = (hour = hourText, minute = minuteText) => {
    const parsedHour = Number(hour);
    const parsedMinute = Number(minute);
    return hour !== "" && minute !== "" && Number.isInteger(parsedHour) && Number.isInteger(parsedMinute) && parsedHour >= 1 && parsedHour <= 12 && parsedMinute >= 0 && parsedMinute <= 59;
  };

  const syncTimeText = (date: Date) => {
    setHourText(String(((date.getHours() + 11) % 12) + 1));
    setMinuteText(pad(date.getMinutes()));
  };

  const updateActive = (date: Date) => {
    const nextDate = localDateValue(date);
    const nextTime = localTimeValue(date);
    setWorking((current) => field === "start" ? { ...current, startDate: nextDate, startTime: nextTime } : { ...current, endDate: nextDate, endTime: nextTime });
    setError(null);
  };

  const chooseDate = (date: Date) => {
    const next = new Date(date);
    next.setHours(activeDate.getHours(), activeDate.getMinutes(), 0, 0);
    updateActive(next);
    syncTimeText(next);
  };

  const adjustTime = (hours: number, minutes: number) => {
    const next = new Date(activeDate);
    next.setHours(next.getHours() + hours, next.getMinutes() + minutes);
    updateActive(next);
    syncTimeText(next);
  };

  const commitTypedTime = (hour: string, minute: string) => {
    if (!validTime(hour, minute)) return;
    const next = new Date(activeDate);
    const isPm = next.getHours() >= 12;
    next.setHours((Number(hour) % 12) + (isPm ? 12 : 0), Number(minute), 0, 0);
    updateActive(next);
  };

  const switchField = (nextField: "start" | "end") => {
    if (!working.allDay && !validTime()) {
      setError("Enter a valid hour and minute before changing fields.");
      return;
    }
    const date = parseLocalValue(nextField === "start" ? working.startDate : working.endDate, nextField === "start" ? working.startTime : working.endTime);
    setField(nextField);
    setMonth(date);
    syncTimeText(date);
    setError(null);
  };

  const save = () => {
    if (!working.startDate || !working.endDate) return setError("Choose both dates.");
    if (!working.allDay && !validTime()) return setError("Enter a valid hour and minute before saving.");
    const start = working.allDay ? working.startDate : `${working.startDate}T${working.startTime}`;
    const end = working.allDay ? working.endDate : `${working.endDate}T${working.endTime}`;
    if ((working.allDay && end < start) || (!working.allDay && end <= start)) return setError("The event must end after it starts.");
    onSave(working);
  };

  return <div className="calendar-schedule-picker-backdrop" role="presentation" onMouseDown={(mouseEvent) => { mouseEvent.stopPropagation(); if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }} style={{ position: "fixed", zIndex: 210, inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflowX: "hidden", overflowY: "auto", padding: 24, background: "rgba(0,0,0,.7)" }}>
    <section className="calendar-schedule-picker" role="dialog" aria-modal="true" aria-label="Set event schedule" style={{ width: "min(680px, calc(100vw - 32px))", maxWidth: 680, maxHeight: "calc(100dvh - 32px)", boxSizing: "border-box", overflowX: "hidden", overflowY: "auto", padding: 28, border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", boxShadow: "0 20px 60px rgba(0,0,0,.45)" }}>
      <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 20 }}>
        <div><h3 style={{ margin: 0, color: "var(--primary)", fontSize: 18, fontWeight: 700 }}>Set schedule</h3><p style={{ margin: "5px 0 0", color: "var(--secondary)", fontSize: 13 }}>Choose the event&apos;s start and end date and time.</p></div>
        <button type="button" onClick={onClose} aria-label="Close schedule picker" style={{ minHeight: 0, border: "none", background: "var(--surface-variant)", color: "var(--secondary)", borderRadius: 10, cursor: "pointer", padding: 7, display: "flex" }}><MaterialIcon name="close" size={20} /></button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["start", "end"] as const).map((item) => {
          const selected = field === item;
          const dateValue = item === "start" ? working.startDate : working.endDate;
          const timeValue = item === "start" ? working.startTime : working.endTime;
          return <button key={item} type="button" onClick={() => switchField(item)} style={{ minWidth: 0, flex: 1, padding: "11px 10px", borderRadius: 12, border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", background: selected ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface-variant)", color: selected ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item === "start" ? "Start" : "End"} · {formatScheduleValue(dateValue, timeValue, working.allDay)}</button>;
        })}
      </div>

      <div className="calendar-schedule-picker-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
        <section style={{ minWidth: 0, padding: 16, borderRadius: 16, background: "var(--surface-variant)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 15 }}>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month" style={{ width: 34, height: 34, minHeight: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="chevron_left" size={19} /></button>
            <strong style={{ color: "var(--primary)", fontSize: 14 }}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month" style={{ width: 34, height: 34, minHeight: 0, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="chevron_right" size={19} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 5, textAlign: "center" }}>{weekDays.map((day) => <span key={day} style={{ color: "var(--secondary)", fontSize: 10, fontWeight: 700 }}>{day}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>{days.map((date) => {
            const selected = date.toDateString() === activeDate.toDateString();
            const inMonth = date.getMonth() === month.getMonth();
            return <button key={date.toISOString()} type="button" onClick={() => chooseDate(date)} style={{ minHeight: 0, aspectRatio: "1", border: "none", borderRadius: 10, background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--background)" : inMonth ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 500 }}>{date.getDate()}</button>;
          })}</div>
        </section>

        <section style={{ minWidth: 0, padding: 16, borderRadius: 16, background: "var(--surface-variant)", border: "1px solid var(--border)" }}>
          <div style={{ padding: 8, margin: -8, borderRadius: 12, background: working.allDay ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent", opacity: working.allDay ? .45 : 1, pointerEvents: working.allDay ? "none" : "auto", transition: "all .15s" }}>
            <p style={{ margin: "1px 0 15px", color: "var(--primary)", fontSize: 14, fontWeight: 700, textAlign: "center" }}>Time</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, textAlign: "center" }}>
              {(["hour", "minute"] as const).map((part) => <div key={part}>
                <button type="button" onClick={() => part === "hour" ? adjustTime(-1, 0) : adjustTime(0, -5)} aria-label={`Move ${part} earlier`} style={{ width: 36, height: 32, minHeight: 0, border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_up" size={18} /></button>
                <input type="text" inputMode="numeric" aria-label={part} value={part === "hour" ? hourText : minuteText} onChange={(changeEvent) => { const text = changeEvent.target.value.replace(/\D/g, "").slice(0, 2); if (part === "hour") { setHourText(text); commitTypedTime(text, minuteText); } else { setMinuteText(text); commitTypedTime(hourText, text); } }} style={{ display: "block", width: 50, margin: "9px auto 2px", padding: 0, border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 18, fontWeight: 700, textAlign: "center" }} />
                <span style={{ color: "var(--secondary)", fontSize: 10 }}>{part}</span>
                <button type="button" onClick={() => part === "hour" ? adjustTime(1, 0) : adjustTime(0, 5)} aria-label={`Move ${part} later`} style={{ display: "block", width: 36, height: 32, minHeight: 0, margin: "9px auto 0", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_down" size={18} /></button>
              </div>)}
            </div>
            <div style={{ display: "flex", gap: 5, width: "fit-content", margin: "17px auto 0", padding: 3, borderRadius: 10, background: "var(--surface)" }}>{(["AM", "PM"] as const).map((period) => {
              const selected = period === (activeDate.getHours() >= 12 ? "PM" : "AM");
              return <button key={period} type="button" onClick={() => { if (!validTime()) return setError("Enter a valid hour and minute before changing AM or PM."); const next = new Date(activeDate); const hours = next.getHours(); next.setHours(period === "AM" ? hours % 12 : (hours % 12) + 12); updateActive(next); syncTimeText(next); }} style={{ minHeight: 0, padding: "7px 12px", border: "none", borderRadius: 7, background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--background)" : "var(--secondary)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{period}</button>;
            })}</div>
          </div>
          <button type="button" onClick={() => { setWorking((current) => ({ ...current, allDay: !current.allDay })); setError(null); }} className="flex items-center justify-between" style={{ width: "100%", marginTop: 16, padding: "10px 11px", border: working.allDay ? "1px solid var(--primary)" : "1px solid var(--border)", borderRadius: 10, background: working.allDay ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)", color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            All-day event<span style={{ width: 32, height: 18, padding: 2, borderRadius: 999, background: working.allDay ? "var(--primary)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: working.allDay ? "flex-end" : "flex-start" }}><span style={{ width: 14, height: 14, borderRadius: "50%", background: working.allDay ? "var(--background)" : "var(--secondary)" }} /></span>
          </button>
        </section>
      </div>

      {error && <p role="alert" style={{ margin: "16px 0 -4px", color: "var(--error)", fontSize: 12, fontWeight: 600, textAlign: "center" }}>{error}</p>}
      <button type="button" onClick={save} style={{ width: "100%", marginTop: 20, padding: 14, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Save &amp; Close</button>
    </section>
  </div>;
}

export default function CalendarEventEditorModal({
  event,
  preset,
  calendars,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  event: SyncedGoogleCalendarEvent | null;
  preset: CalendarEditorPreset;
  calendars: SyncedGoogleCalendar[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: CalendarEventDraft) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(event, preset, calendars));
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, saving]);

  const update = <K extends keyof CalendarEventDraft>(key: K, value: CalendarEventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  };

  const submit = () => {
    if (!draft.summary.trim()) return setValidationError("Add an event name.");
    if (!draft.calendarId) return setValidationError("Choose a writable calendar.");
    if (!draft.startDate || !draft.endDate) return setValidationError("Choose a start and end date.");
    const start = draft.allDay ? `${draft.startDate}T00:00` : `${draft.startDate}T${draft.startTime}`;
    const end = draft.allDay ? `${draft.endDate}T23:59` : `${draft.endDate}T${draft.endTime}`;
    if (!draft.allDay && (!draft.startTime || !draft.endTime)) return setValidationError("Choose both times.");
    if (end <= start) return setValidationError("The event must end after it starts.");
    onSave({ ...draft, summary: draft.summary.trim(), location: draft.location.trim(), description: draft.description.trim() });
  };

  const changingCalendarUnsupported = Boolean(event?.recurringEventId || event?.recurrence?.length || (event?.eventType && event.eventType !== "default"));

  const modal = <div className="calendar-event-editor-backdrop" role="presentation" onMouseDown={() => !saving && onClose()} style={{ position: "fixed", zIndex: 200, inset: 0, display: "grid", placeItems: "center", overflowX: "hidden", overflowY: "auto", padding: 16, background: "rgba(0,0,0,.68)" }}>
    <section className="calendar-event-editor" role="dialog" aria-modal="true" aria-labelledby="calendar-editor-title" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()} style={{ width: "min(500px, calc(100vw - 32px))", minWidth: 0, maxWidth: 500, boxSizing: "border-box", overflow: "hidden", margin: "auto", padding: 19, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)", boxShadow: "0 24px 65px rgba(0,0,0,.48)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div><p style={{ margin: "0 0 4px", color: "var(--secondary)", fontSize: 10, fontWeight: 850, letterSpacing: ".08em", textTransform: "uppercase" }}>{event ? "Edit Google event" : "New Google event"}</p><h2 id="calendar-editor-title" style={{ margin: 0, color: "var(--primary)", fontSize: 22 }}>{event ? "Event details" : "Create event"}</h2></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close event editor" style={{ width: 36, height: 36, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" }}><span className="material-symbols-rounded">close</span></button>
      </header>

      <div style={{ display: "grid", minWidth: 0, gap: 11 }}>
        <label style={labelStyle}>Event name<input autoFocus value={draft.summary} onChange={(changeEvent) => update("summary", changeEvent.target.value)} style={inputStyle} placeholder="Add title" /></label>
        <label style={labelStyle}>Calendar<select value={draft.calendarId} disabled={changingCalendarUnsupported} onChange={(changeEvent) => update("calendarId", changeEvent.target.value)} style={{ ...inputStyle, opacity: changingCalendarUnsupported ? .65 : 1 }}>
          {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (primary)" : ""}</option>)}
        </select></label>
        {changingCalendarUnsupported && <p style={{ margin: -8, color: "var(--secondary)", fontSize: 11 }}>This Google event must stay on its current calendar.</p>}
        <div>
          <label style={labelStyle}>Timing</label>
          <button type="button" onClick={() => setSchedulePickerOpen(true)} className="flex items-center justify-between" style={{ ...inputStyle, minHeight: 48, cursor: "pointer", textAlign: "left" }}>
            <span className="flex items-center" style={{ minWidth: 0, gap: 12 }}>
              <MaterialIcon name="schedule" size={20} color="var(--primary)" />
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: "block", color: "var(--primary)", fontSize: 14 }}>Set times</strong>
                <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "3px 8px", marginTop: 3, color: "var(--secondary)", fontSize: 12 }}>
                  <span><strong style={{ color: "var(--primary)", fontWeight: 650 }}>Start:</strong> {formatScheduleValue(draft.startDate, draft.startTime, draft.allDay)}</span>
                  <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--secondary)", opacity: .65 }} />
                  <span><strong style={{ color: "var(--primary)", fontWeight: 650 }}>End:</strong> {formatScheduleValue(draft.endDate, draft.endTime, draft.allDay)}</span>
                </span>
              </span>
            </span>
            <span className="material-symbols-rounded" style={{ flexShrink: 0, color: "var(--secondary)", fontSize: 20 }}>chevron_right</span>
          </button>
        </div>
        <label style={labelStyle}>Location<input value={draft.location} onChange={(changeEvent) => update("location", changeEvent.target.value)} style={inputStyle} placeholder="Optional" /></label>
        <label style={labelStyle}>Description<textarea value={draft.description} onChange={(changeEvent) => update("description", changeEvent.target.value)} style={{ ...inputStyle, resize: "none", minHeight: 70, lineHeight: 1.4 }} placeholder="Optional" /></label>
      </div>

      {(validationError || error) && <p role="alert" style={{ margin: "14px 0 0", padding: "10px 11px", border: "1px solid #ef6b6266", borderRadius: 10, background: "#ef6b6212", color: "#ef8b84", fontSize: 12, fontWeight: 700 }}>{validationError ?? error}</p>}

      <div className="calendar-event-editor-actions" style={{ display: "flex", gap: 9, marginTop: 16 }}>
        {event && onDelete && <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={saving} style={{ padding: "11px 14px", border: "1px solid #ef6b6266", borderRadius: 11, background: "#ef6b6212", color: "#ef756d", cursor: "pointer", fontWeight: 800 }}>Delete</button>}
        <button type="button" onClick={onClose} disabled={saving} style={{ marginLeft: "auto", padding: "11px 16px", border: "1px solid var(--border)", borderRadius: 11, background: "transparent", color: "var(--primary)", cursor: "pointer", fontWeight: 800 }}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving || calendars.length === 0} style={{ minWidth: 108, padding: "11px 17px", border: 0, borderRadius: 11, background: "var(--primary)", color: "var(--background)", cursor: "pointer", opacity: saving ? .65 : 1, fontWeight: 850 }}>{saving ? "Saving…" : event ? "Save" : "Create"}</button>
      </div>
    </section>

    {schedulePickerOpen && <CalendarSchedulePicker value={{ allDay: draft.allDay, startDate: draft.startDate, startTime: draft.startTime, endDate: draft.endDate, endTime: draft.endTime }} onClose={() => setSchedulePickerOpen(false)} onSave={(schedule) => { setDraft((current) => ({ ...current, ...schedule })); setValidationError(null); setSchedulePickerOpen(false); }} />}
    {deleteConfirmOpen && <div role="presentation" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()} style={{ position: "fixed", zIndex: 220, inset: 0, display: "grid", placeItems: "center", padding: 22, background: "rgba(0,0,0,.72)" }}><section role="alertdialog" aria-modal="true" aria-label="Delete event" style={{ width: "min(380px, 100%)", padding: 20, border: "1px solid #ef6b6266", borderRadius: 18, background: "var(--surface)" }}><h3 style={{ margin: "0 0 7px", color: "var(--primary)", fontSize: 19 }}>Delete this event?</h3><p style={{ margin: "0 0 18px", color: "var(--secondary)", fontSize: 13, lineHeight: 1.45 }}>This will delete it from Google Calendar.</p><div style={{ display: "flex", gap: 9 }}><button type="button" onClick={() => setDeleteConfirmOpen(false)} style={{ flex: 1, padding: 11, border: "1px solid var(--border)", borderRadius: 11, background: "transparent", color: "var(--primary)", fontWeight: 800 }}>Cancel</button><button type="button" onClick={() => { setDeleteConfirmOpen(false); onDelete?.(); }} style={{ flex: 1, padding: 11, border: 0, borderRadius: 11, background: "#ef6b62", color: "#171717", fontWeight: 850 }}>Delete</button></div></section></div>}
  </div>;

  return createPortal(modal, document.body);
}
