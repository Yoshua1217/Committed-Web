"use client";

import { useState } from "react";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { setPreviousWorkoutTiming } from "@/lib/workout-session";
import type { WorkoutSession } from "@/lib/types";
import styles from "./workout-flow.module.css";

function localDateTime(time: number): string {
  const date = new Date(time);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function PreviousWorkoutDetailsModal({ session, onClose, onSave }: {
  session: WorkoutSession; onClose: () => void; onSave: (session: WorkoutSession) => void | Promise<void>;
}) {
  const duration = session.durationSeconds ?? 0;
  const [latestTime] = useState(() => Date.now());
  const [endedAt, setEndedAt] = useState(localDateTime(session.performedAt ?? latestTime));
  const [hours, setHours] = useState(String(Math.floor(duration / 3600)));
  const [minutes, setMinutes] = useState(String(Math.floor(duration % 3600 / 60)));
  const [seconds, setSeconds] = useState(String(duration % 60));
  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);
  const kind = session.sessionType === "activity" ? "Activity" : session.sessionType === "stretch" ? "Stretching" : "Workout";

  async function save() {
    if (saving) return;
    const parts = [hours, minutes, seconds].map((part) => part.trim() === "" ? 0 : Number(part));
    if (parts.some((part) => !Number.isSafeInteger(part) || part < 0) || parts[1] > 59 || parts[2] > 59) {
      setError("Use whole numbers, with minutes and seconds between 0 and 59.");
      return;
    }
    let next: WorkoutSession;
    try {
      next = setPreviousWorkoutTiming(session, new Date(endedAt).getTime(), parts[0] * 3600 + parts[1] * 60 + parts[2]);
    } catch {
      setError("Choose a past session time and a duration greater than zero.");
      return;
    }
    setSaving(true); setError("");
    try { await onSave(next); }
    catch { setError("Couldn’t save these details. Please try again."); }
    finally { setSaving(false); }
  }

  const inputStyle = { width: "100%", minWidth: 0, marginTop: 8, padding: 12, border: "1px solid var(--border)", borderRadius: 12, color: "var(--primary)", background: "var(--background)", fontSize: 16 };
  return <WorkoutFlowDialog title={`${kind} date & duration`} description="Enter when the session ended and its total duration." onClose={onClose} busy={saving}
    footer={<button type="button" className={styles.primary} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save details"}</button>}>
    <label style={{ display: "block", color: "var(--secondary)", fontSize: 13, fontWeight: 700 }}>{kind} ended<input type="datetime-local" value={endedAt} max={localDateTime(latestTime)} onChange={(event) => setEndedAt(event.target.value)} style={inputStyle} /></label>
    <fieldset style={{ border: "none", margin: "22px 0 0", padding: 0 }}><legend style={{ color: "var(--primary)", fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Total time</legend>
      <div style={{ display: "flex", gap: 10 }}>{([{ label: "Hours", value: hours, set: setHours }, { label: "Minutes", value: minutes, set: setMinutes }, { label: "Seconds", value: seconds, set: setSeconds }]).map((part) => <label key={part.label} style={{ flex: 1, minWidth: 0, color: "var(--secondary)", fontSize: 12 }}>{part.label}<input type="number" inputMode="numeric" min={0} max={part.label === "Hours" ? undefined : 59} step={1} value={part.value} onChange={(event) => part.set(event.target.value)} style={inputStyle} /></label>)}</div>
    </fieldset>
    {error && <p role="alert" className={styles.error} style={{ marginTop: 16 }}>{error}</p>}
  </WorkoutFlowDialog>;
}
