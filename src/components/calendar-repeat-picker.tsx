"use client";

import type { CSSProperties } from "react";
import { defaultRepeat, REPEAT_DAYS, repeatDate, selectRepeatPreset, type RepeatPreset, type RepeatRule } from "@/lib/calendar-recurrence";

const field: CSSProperties = { width: "100%", minWidth: 0, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--background)", color: "var(--primary)", font: "inherit", fontSize: 13 };
const label: CSSProperties = { display: "grid", minWidth: 0, gap: 6, color: "var(--secondary)", fontSize: 12, fontWeight: 700 };
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function CalendarRepeatPicker({ value, startDate, timeZone, allDay, onChange }: { value: RepeatRule | null; startDate: string; timeZone: string; allDay: boolean; onChange: (rule: RepeatRule) => void }) {
  const start = repeatDate(startDate);
  const dayName = dayNames[start.getUTCDay()];
  const ordinal = ["first", "second", "third", "fourth", "fifth"][Math.ceil(start.getUTCDate() / 7) - 1];
  const update = (patch: Partial<RepeatRule>) => onChange({ ...(value ?? defaultRepeat(startDate)), ...patch });
  const repeating = value && value.preset !== "none";
  return <div style={{ display: "grid", gap: 10 }}>
    <label style={label}>Repeat
      <select aria-label="Repeat" value={value?.preset ?? "imported"} onChange={(event) => onChange(selectRepeatPreset(value ?? defaultRepeat(startDate), event.target.value as RepeatPreset, startDate))} style={field}>
        {!value && <option value="imported">Existing custom schedule (keep unchanged)</option>}
        <option value="none">Does not repeat</option>
        <option value="daily">Every day</option>
        <option value="weekdays">Every weekday (Monday–Friday)</option>
        <option value="weekly">Weekly on {dayName}</option>
        <option value="biweekly">Every 2 weeks on {dayName}</option>
        <option value="monthly">Monthly on day {start.getUTCDate()}</option>
        <option value="yearly">Yearly on {start.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" })}</option>
        <option value="custom">Custom…</option>
      </select>
    </label>
    {!value && <p style={{ margin: 0, fontSize: 12, color: "var(--secondary)", lineHeight: 1.5 }}>This series has an advanced Google Calendar schedule. It will be preserved unless you choose a new repeat option.</p>}
    {repeating && <div style={{ display: "grid", gap: 12, padding: 12, background: "var(--surface-variant)", border: "1px solid var(--border)", borderRadius: 12 }}>
      {value.preset === "custom" && <>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(70px, 1fr) minmax(100px, 2fr)", gap: 10 }}>
          <label style={label}>Repeat every<input aria-label="Repeat interval" type="number" min={1} max={999} step={1} value={value.interval || ""} onChange={(event) => update({ interval: Number(event.target.value) })} style={field} /></label>
          <label style={label}>Unit<select aria-label="Repeat unit" value={value.frequency} onChange={(event) => update({ frequency: event.target.value as RepeatRule["frequency"] })} style={field}><option value="DAILY">day(s)</option><option value="WEEKLY">week(s)</option><option value="MONTHLY">month(s)</option><option value="YEARLY">year(s)</option></select></label>
        </div>
        {value.frequency === "WEEKLY" && <div role="group" aria-label="Repeat on weekdays"><p style={{ ...label, margin: "0 0 7px" }}>Repeat on</p><div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>{[1, 2, 3, 4, 5, 6, 0].map((index) => {
          const day = REPEAT_DAYS[index];
          const selected = value.days.includes(day);
          return <button key={day} type="button" aria-label={dayNames[index]} aria-pressed={selected} onClick={() => update({ days: selected ? value.days.filter((item) => item !== day) : [...value.days, day] })} style={{ minWidth: 0, minHeight: 36, padding: "7px 0", border: "1px solid var(--border)", borderRadius: 9, background: selected ? "var(--primary)" : "var(--background)", color: selected ? "var(--background)" : "var(--secondary)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{dayNames[index].slice(0, 2)}</button>;
        })}</div></div>}
      </>}
      {value.frequency === "MONTHLY" && <label style={label}>Repeat by<select aria-label="Monthly repeat pattern" value={value.monthlyMode} onChange={(event) => update({ monthlyMode: event.target.value as RepeatRule["monthlyMode"], preset: "custom" })} style={field}>
        <option value="date">Day {start.getUTCDate()} of the month</option>
        <option value="weekday">The {ordinal} {dayName}</option>
        {new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7)).getUTCMonth() !== start.getUTCMonth() && <option value="last">The last {dayName}</option>}
      </select></label>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <label style={label}>Ends<select aria-label="Repeat ends" value={value.ends} onChange={(event) => update({ ends: event.target.value as RepeatRule["ends"] })} style={field}><option value="never">Never</option><option value="on">On date</option><option value="after">After occurrences</option></select></label>
        {value.ends === "on" && <label style={label}>Last date (inclusive)<input aria-label="Repeat end date" type="date" min={startDate} value={value.until} onChange={(event) => update({ until: event.target.value })} style={field} /></label>}
        {value.ends === "after" && <label style={label}>Occurrences<input aria-label="Number of occurrences" type="number" min={1} max={9999} step={1} value={value.count || ""} onChange={(event) => update({ count: Number(event.target.value) })} style={field} /></label>}
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--secondary)" }}>
        {value.ends === "after" ? "Includes the first event. " : ""}
        {value.frequency === "MONTHLY" && (start.getUTCDate() > 28 && value.monthlyMode === "date" || ordinal === "fifth" && value.monthlyMode === "weekday") ? "Months without this date or weekday are skipped. " : ""}
        {value.frequency === "YEARLY" && start.getUTCMonth() === 1 && start.getUTCDate() === 29 ? "Repeats in leap years only. " : ""}
        {!allDay ? `Repeats at the same local time in ${timeZone.replaceAll("_", " ")}, including daylight saving changes.` : "Repeats as an all-day event."}
      </p>
    </div>}
  </div>;
}
