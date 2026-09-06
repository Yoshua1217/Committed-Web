"use client";

import { useEffect, useRef, useState } from "react";
import MaterialIcon from "@/components/material-icon";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateTimeValue(date: Date, time = "09:00"): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

function parseDateTime(value: string): Date {
  const [datePart, timePart = "09:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

export function formatScheduleValue(value: string, emptyLabel: string): string {
  if (!value) return emptyLabel;
  const date = parseDateTime(value);
  if (!value.split("T")[1]) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDateOnly(value: string): string {
  return parseDateTime(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function hasCompleteDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}


export type ScheduleField = "start" | "due" | "reminder";
export interface TaskScheduleValues {
  start: string;
  due: string;
  reminder: string;
  startAllDay: boolean;
  dueAllDay: boolean;
}

interface TaskSchedulePickerProps {
  values: TaskScheduleValues;
  initialField?: ScheduleField;
  fields?: readonly ScheduleField[];
  allowAllDay?: boolean;
  requireDateTime?: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onSave: (values: TaskScheduleValues) => void;
}

/** Mount when opened so cancelling discards the draft in either task flow. */
export default function TaskSchedulePicker({
  values, initialField = "due", fields = ["due", "start", "reminder"],
  allowAllDay = true, requireDateTime = false, title = "Set schedule",
  description = "Choose the start, due, and reminder date and time.",
  onClose, onSave,
}: TaskSchedulePickerProps) {
  const initialValue = values[initialField];
  const initialDate = initialValue ? parseDateTime(initialValue) : new Date();
  const [scheduleField, setScheduleField] = useState<ScheduleField>(initialField);
  const [draftStartDateTime, setDraftStartDateTime] = useState(values.start);
  const [draftDueDateTime, setDraftDueDateTime] = useState(values.due);
  const [draftReminderDateTime, setDraftReminderDateTime] = useState(values.reminder);
  const [draftStartAllDay, setDraftStartAllDay] = useState(allowAllDay && values.startAllDay);
  const [draftDueAllDay, setDraftDueAllDay] = useState(allowAllDay && values.dueAllDay);
  const [scheduleMonth, setScheduleMonth] = useState(initialDate);
  const [timeHourText, setTimeHourText] = useState(initialValue ? String(((initialDate.getHours() + 11) % 12) + 1) : "");
  const [timeMinuteText, setTimeMinuteText] = useState(initialValue ? pad(initialDate.getMinutes()) : "");
  const [scheduleValidationError, setScheduleValidationError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initialFocus = dialogRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? dialogRef.current?.querySelector<HTMLButtonElement>("button");
    initialFocus?.focus();
    return () => { document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, []);

  const activeDraftValue = scheduleField === "start" ? draftStartDateTime : scheduleField === "due" ? draftDueDateTime : draftReminderDateTime;
  const activeDraftAllDay = scheduleField === "start" ? draftStartAllDay : scheduleField === "due" ? draftDueAllDay : false;
  const activeDraftDate = activeDraftValue
    ? parseDateTime(activeDraftValue)
    : (() => {
        const date = new Date();
        if (scheduleField === "due") date.setHours(0, 0, 0, 0);
        return date;
      })();
  const calendarStart = new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth(), 1);
  calendarStart.setDate(1 - calendarStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });

  const updateActiveDraft = (date: Date) => {
    const isPm = activeDraftDate.getHours() >= 12;
    const time = hasValidTimeText()
      ? `${pad((Number(timeHourText) % 12) + (isPm ? 12 : 0))}:${pad(Number(timeMinuteText))}`
      : scheduleField === "due" ? "00:00" : "12:00";
    const value = dateTimeValue(date, time);
    setActiveDraftValue(value);
    const selected = parseDateTime(value);
    syncTimeText(selected);
  };

  const setActiveDraftValue = (value: string) => {
    if (scheduleField === "start") setDraftStartDateTime(value);
    else if (scheduleField === "due") setDraftDueDateTime(value);
    else setDraftReminderDateTime(value);
  };

  const hasValidTimeText = (hour = timeHourText, minute = timeMinuteText) => {
    const parsedHour = Number(hour);
    const parsedMinute = Number(minute);
    return hour !== "" && minute !== "" && Number.isInteger(parsedHour) && Number.isInteger(parsedMinute) && parsedHour >= 1 && parsedHour <= 12 && parsedMinute >= 0 && parsedMinute <= 59;
  };

  const commitTypedTime = (hour: string, minute: string) => {
    if (!hasValidTimeText(hour, minute)) return;
    if (!activeDraftValue.split("T")[0]) return;
    const next = new Date(activeDraftDate);
    const isPm = next.getHours() >= 12;
    next.setHours((Number(hour) % 12) + (isPm ? 12 : 0), Number(minute));
    setActiveDraftValue(dateTimeValue(next, `${pad(next.getHours())}:${pad(next.getMinutes())}`));
    setScheduleValidationError(null);
  };

  const syncTimeText = (date: Date) => {
    setTimeHourText(String(((date.getHours() + 11) % 12) + 1));
    setTimeMinuteText(pad(date.getMinutes()));
  };

  const adjustActiveTime = (hours: number, minutes: number) => {
    const next = new Date(activeDraftDate);
    next.setHours(next.getHours() + hours, next.getMinutes() + minutes);
    setActiveDraftValue(dateTimeValue(next, `${pad(next.getHours())}:${pad(next.getMinutes())}`));
    syncTimeText(next);
  };


  const saveDraft = () => {
    const hasDate = Boolean(activeDraftValue.split("T")[0]);
    if ((requireDateTime && !hasDate) || (hasDate && !activeDraftAllDay && !hasValidTimeText())) {
      setScheduleValidationError("Choose a date and enter a valid hour and minute before saving.");
      return;
    }
    onSave({
      start: draftStartAllDay && draftStartDateTime ? `${draftStartDateTime.split("T")[0]}T00:00` : draftStartDateTime,
      due: draftDueAllDay && draftDueDateTime ? `${draftDueDateTime.split("T")[0]}T23:59` : draftDueDateTime,
      reminder: draftReminderDateTime,
      startAllDay: draftStartAllDay,
      dueAllDay: draftDueAllDay,
    });
  };

  return (
            <div
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") { event.preventDefault(); onClose(); }
                if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); saveDraft(); }
                if (event.key === "Tab") {
                  const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
                  const first = items?.[0], last = items?.[items.length - 1];
                  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                }
              }}
              onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
              style={{ position: "fixed", inset: 0, zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(5px)" }}
            >
              <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} style={{ width: "100%", maxWidth: 680, maxHeight: "calc(100dvh - 32px)", overflowY: "auto", padding: "clamp(16px, 4vw, 28px)", borderRadius: 22, backgroundColor: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "var(--primary)", fontSize: 18, fontWeight: 700 }}>{title}</h3>
                    <p style={{ margin: "5px 0 0", color: "var(--secondary)", fontSize: 13 }}>{description}</p>
                  </div>
                  <button type="button" onClick={onClose} aria-label="Close schedule picker" style={{ border: "none", background: "var(--surface-variant)", color: "var(--secondary)", borderRadius: 10, cursor: "pointer", padding: 7, display: "flex" }}><MaterialIcon name="close" size={20} /></button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {fields.map((field) => {
                    const selected = scheduleField === field;
                    const value = field === "start" ? draftStartDateTime : field === "due" ? draftDueDateTime : draftReminderDateTime;
                    const label = field === "start" ? "Start" : field === "due" ? "Due" : "Reminder";
                    return <button key={field} type="button" onClick={() => { const hasActiveDate = Boolean(activeDraftValue.split("T")[0]); if (!activeDraftAllDay && (hasActiveDate || timeHourText || timeMinuteText) && !hasValidTimeText()) { setScheduleValidationError("Enter a valid hour and minute before changing fields."); return; } const next = value ? parseDateTime(value) : new Date(); setScheduleField(field); setScheduleMonth(next); if (value.split("T")[1]) syncTimeText(next); else { setTimeHourText(""); setTimeMinuteText(""); } setScheduleValidationError(null); }} style={{ flex: 1, padding: "11px 10px", borderRadius: 12, border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", background: selected ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface-variant)", color: selected ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 600 }}>{label} · {formatScheduleValue(value, "Select")}</button>;
                  })}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 24 }}>
                  <section style={{ padding: 16, borderRadius: 16, background: "var(--surface-variant)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 15 }}>
                      <button type="button" onClick={() => setScheduleMonth(new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() - 1, 1))} aria-label="Previous month" style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="chevron_left" size={19} /></button>
                      <strong style={{ color: "var(--primary)", fontSize: 14 }}>{scheduleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
                      <button type="button" onClick={() => setScheduleMonth(new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() + 1, 1))} aria-label="Next month" style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="chevron_right" size={19} /></button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 5 }}>{weekDays.map((day) => <span key={day} style={{ color: "var(--secondary)", fontSize: 10, fontWeight: 700 }}>{day}</span>)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                      {calendarDays.map((date) => {
                        const selected = !!activeDraftValue && date.toDateString() === activeDraftDate.toDateString();
                        const inMonth = date.getMonth() === scheduleMonth.getMonth();
                        return <button key={date.toISOString()} type="button" aria-label={date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} aria-pressed={selected} onClick={() => updateActiveDraft(date)} style={{ aspectRatio: "1", border: "none", borderRadius: 10, background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--background)" : inMonth ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 500 }}>{date.getDate()}</button>;
                      })}
                    </div>
                  </section>

                  <section style={{ padding: 16, borderRadius: 16, background: "var(--surface-variant)", border: "1px solid var(--border)" }}>
                    <div style={{ padding: 8, margin: -8, borderRadius: 12, background: activeDraftAllDay ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent", opacity: activeDraftAllDay ? 0.45 : 1, pointerEvents: activeDraftAllDay ? "none" : "auto", transition: "all 0.15s" }}>
                      <p style={{ textAlign: "center", color: "var(--primary)", fontSize: 14, fontWeight: 700, margin: "1px 0 15px" }}>Time</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, textAlign: "center" }}>
                      {([["hour", activeDraftDate.getHours(), () => adjustActiveTime(-1, 0), () => adjustActiveTime(1, 0)], ["minute", activeDraftDate.getMinutes(), () => adjustActiveTime(0, -5), () => adjustActiveTime(0, 5)]] as const).map(([label, , earlier, later]) => <div key={label}>
                        <button type="button" onClick={earlier} aria-label={`Move ${label} earlier`} style={{ width: 36, height: 32, border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_up" size={18} /></button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={label}
                          value={label === "hour" ? timeHourText : timeMinuteText}
                          onChange={(event) => {
                            const nextText = event.target.value.replace(/\D/g, "").slice(0, 2);
                            if (label === "hour") {
                              setTimeHourText(nextText);
                              commitTypedTime(nextText, timeMinuteText);
                            } else {
                              setTimeMinuteText(nextText);
                              commitTypedTime(timeHourText, nextText);
                            }
                          }}
                          style={{ display: "block", width: 50, margin: "9px auto 2px", padding: 0, border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 18, fontWeight: 700, textAlign: "center" }}
                        />
                        <span style={{ color: "var(--secondary)", fontSize: 10 }}>{label}</span>
                        <button type="button" onClick={later} aria-label={`Move ${label} later`} style={{ display: "block", width: 36, height: 32, margin: "9px auto 0", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_down" size={18} /></button>
                      </div>)}
                      </div>
                      <div style={{ display: "flex", gap: 5, margin: "17px auto 0", width: "fit-content", padding: 3, borderRadius: 10, background: "var(--surface)" }}>
                        {["AM", "PM"].map((period) => { const selected = period === (activeDraftDate.getHours() >= 12 ? "PM" : "AM"); return <button key={period} type="button" onClick={() => { if (!hasValidTimeText()) { setScheduleValidationError("Enter a valid hour and minute before changing AM or PM."); return; } const next = new Date(activeDraftDate); const hours = next.getHours(); next.setHours(period === "AM" ? hours % 12 : (hours % 12) + 12); setActiveDraftValue(dateTimeValue(next, `${pad(next.getHours())}:${pad(next.getMinutes())}`)); syncTimeText(next); }} style={{ padding: "7px 12px", border: "none", borderRadius: 7, background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--background)" : "var(--secondary)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{period}</button>; })}
                      </div>
                    </div>
                    {allowAllDay && scheduleField !== "reminder" && <button type="button" onClick={() => { if (scheduleField === "start") setDraftStartAllDay((current) => !current); else setDraftDueAllDay((current) => !current); }} className="flex items-center justify-between" style={{ width: "100%", marginTop: 16, padding: "10px 11px", border: activeDraftAllDay ? "1px solid var(--primary)" : "1px solid var(--border)", borderRadius: 10, background: activeDraftAllDay ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)", color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      {scheduleField === "start" ? "Start all day" : "Due all day"}
                      <span style={{ width: 32, height: 18, padding: 2, borderRadius: 999, background: activeDraftAllDay ? "var(--primary)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: activeDraftAllDay ? "flex-end" : "flex-start" }}><span style={{ width: 14, height: 14, borderRadius: "50%", background: activeDraftAllDay ? "var(--background)" : "var(--secondary)" }} /></span>
                    </button>}
                  </section>
                </div>

                {scheduleValidationError && <p style={{ margin: "16px 0 -4px", color: "var(--error)", fontSize: 12, fontWeight: 600, textAlign: "center" }}>{scheduleValidationError}</p>}
                <button type="button" onClick={saveDraft} style={{ width: "100%", marginTop: 20, padding: 14, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Save & Close</button>
              </div>
            </div>

  );
}
