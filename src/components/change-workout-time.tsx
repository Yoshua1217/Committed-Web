"use client";
import { useId, useState } from "react";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { workoutTimeOn } from "@/lib/workout-schedule";
import { saveWorkoutOccurrenceTime } from "@/lib/workout-schedule-service";
import type { WorkoutDefinition } from "@/lib/types";
import styles from "./workout-editor.module.css";

export default function ChangeWorkoutTime({ workout, date, onClose }: { workout: WorkoutDefinition; date: string; onClose: () => void }) {
  const [time, setTime] = useState(workoutTimeOn(workout, date) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  async function save(value: string | null) {
    if (busy) return;
    setBusy(true); setError("");
    try { await saveWorkoutOccurrenceTime(workout, date, value); onClose(); }
    catch { setError("Couldn’t change this time. Your entry is still here—please try again."); }
    finally { setBusy(false); }
  }
  return <WorkoutFlowDialog mobileSheet title="Change next workout time" description={`${workout.name} · ${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}. Only this occurrence will change; your weekly schedule stays the same.`} busy={busy} onClose={onClose} footer={<div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" form={formId} className={styles.primary} disabled={busy || !time}>{busy ? "Saving…" : "Save time"}</button></div>}>
    <form id={formId} onSubmit={(event) => { event.preventDefault(); void save(time); }}><label className={styles.label}>Start time<input type="time" required value={time} disabled={busy} onChange={(event) => setTime(event.target.value)} /></label></form>
    {workout.scheduledTimeOverrides?.[date] && <button type="button" className={styles.secondary} disabled={busy} style={{ marginTop: 16 }} onClick={() => void save(null)}>Use regular schedule</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </WorkoutFlowDialog>;
}
