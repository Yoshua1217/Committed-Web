"use client";
import { validRepRange } from "@/lib/workout-rep-range";
import { useId, useState } from "react";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import AddWorkoutExercisesModal from "@/components/add-workout-exercises-modal";
import MaterialIcon from "@/components/material-icon";
import catalogue from "@/data/exercise-catalogue.json";
import { normalizeWorkoutTimes, workoutDayNames, workoutScheduleSummary } from "@/lib/workout-schedule";
import type { WorkoutDay, WorkoutDefinition } from "@/lib/types";
import styles from "./workout-editor.module.css";

export default function WorkoutEditor({ initial, creating = false, onClose, onSave }: { initial: WorkoutDefinition; creating?: boolean; onClose: () => void; onSave: (workout: WorkoutDefinition) => Promise<void> }) {
  const [draft, setDraft] = useState(() => ({ ...initial, exercises: initial.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder) }));
  const [schedule, setSchedule] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  function move(index: number, direction: number) {
    setDraft((current) => { const exercises = [...current.exercises]; [exercises[index], exercises[index + direction]] = [exercises[index + direction], exercises[index]]; return { ...current, exercises }; });
  }
  return <>
    <WorkoutFlowDialog mobileSheet title={creating ? "Create workout" : "Edit workout"} description="Build a routine that fits your week." busy={busy} onClose={onClose} footer={<button form={formId} type="submit" className={styles.primary} disabled={busy || !draft.name.trim() || !draft.exercises.length}>{busy ? "Saving…" : creating ? "Create workout" : "Save changes"}</button>}>
      <form id={formId} className={styles.editor} onSubmit={async (event) => {
        event.preventDefault(); if (busy || !draft.name.trim() || !draft.exercises.length) return;
        if (draft.exercises.some((plan) => !validRepRange(plan))) { setError("Enter whole-number reps of at least 1, with maximum reps at least minimum reps."); return; }
        setBusy(true); setError("");
        try { await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim(), scheduledStartTimes: normalizeWorkoutTimes(draft.scheduledDays, draft.scheduledStartTimes), exercises: draft.exercises.map((plan, sortOrder) => ({ ...plan, sortOrder })), updatedAt: Date.now() }); onClose(); }
        catch { setError("Couldn’t save your workout. Your changes are still here. Please try again."); }
        finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className={styles.fields}>
          <label className={styles.label}>Workout name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <details className={styles.description}><summary>{draft.description || "Add description"}</summary><label className={styles.label}>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} /></label></details>
          <button type="button" className={styles.scheduleRow} onClick={() => setSchedule(true)}><MaterialIcon name="schedule" size={19} style={{ fontVariationSettings: "'FILL' 0" }} /><span><small>Schedule</small><strong>{workoutScheduleSummary(draft)}</strong></span><MaterialIcon name="chevron_right" size={19} /></button>
          <div className={styles.sectionTitle}><h3>Exercises</h3><span>{draft.exercises.length} added</span></div>
          <p className={styles.hint}>Set a rep range for each exercise in this workout. Use the same minimum and maximum for a fixed target.</p>
          {draft.exercises.map((plan, index) => { const name = catalogue.find((exercise) => exercise.id === plan.exerciseId)?.name ?? plan.exerciseId; return <article className={styles.exercise} key={plan.exerciseId}>
            <div className={styles.exerciseHeader}><strong>{index + 1}. {name}</strong><div><button type="button" disabled={index === 0} aria-label={`Move ${name} up`} onClick={() => move(index, -1)}><MaterialIcon name="keyboard_arrow_up" size={18} /></button><button type="button" disabled={index === draft.exercises.length - 1} aria-label={`Move ${name} down`} onClick={() => move(index, 1)}><MaterialIcon name="keyboard_arrow_down" size={18} /></button><button type="button" aria-label={`Remove ${name}`} onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((item) => item.exerciseId !== plan.exerciseId) })}><MaterialIcon name="close" size={18} /></button></div></div>
            <div className={styles.numbers}>{(["plannedSets", "plannedReps", "plannedRepsMax"] as const).map((field) => <label className={styles.label} key={field}>{field === "plannedSets" ? "Sets" : field === "plannedReps" ? "Min reps" : "Max reps"}<input aria-label={`${name} ${field === "plannedSets" ? "sets" : field === "plannedReps" ? "minimum reps" : "maximum reps"}`} required type="number" min={field === "plannedRepsMax" ? Math.max(1, plan.plannedReps) : 1} step={1} value={(field === "plannedRepsMax" ? plan.plannedRepsMax ?? plan.plannedReps : plan[field]) || ""} onChange={(event) => setDraft({ ...draft, exercises: draft.exercises.map((item) => item.exerciseId === plan.exerciseId ? { ...item, ...(field === "plannedReps" ? { plannedRepsMax: item.plannedRepsMax ?? item.plannedReps } : {}), [field]: Number(event.target.value) } : item) })} /></label>)}</div>
          </article>; })}
          <button type="button" className={styles.primary} onClick={() => setAdding(true)}>+ Add exercises</button>
        </fieldset>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </WorkoutFlowDialog>
    {schedule && <WorkoutSchedulePicker workout={draft} onClose={() => setSchedule(false)} onApply={(scheduledDays, scheduledStartTimes) => { setDraft({ ...draft, scheduledDays, scheduledStartTimes }); setSchedule(false); }} />}
    {adding && <AddWorkoutExercisesModal context="routine" existingIds={draft.exercises.map((plan) => plan.exerciseId)} onClose={() => setAdding(false)} onAdd={(exercises) => { setDraft({ ...draft, exercises: [...draft.exercises, ...exercises.map((exercise, index) => ({ exerciseId: exercise.id, plannedSets: 3, plannedReps: 10, sortOrder: draft.exercises.length + index }))] }); setAdding(false); }} />}
  </>;
}

function WorkoutSchedulePicker({ workout, onClose, onApply }: { workout: WorkoutDefinition; onClose: () => void; onApply: (days: WorkoutDay[], times: WorkoutDefinition["scheduledStartTimes"]) => void }) {
  const initialTimes = normalizeWorkoutTimes(workout.scheduledDays, workout.scheduledStartTimes);
  const [days, setDays] = useState(workout.scheduledDays);
  const [times, setTimes] = useState(initialTimes);
  const [shared, setShared] = useState(initialTimes[workout.scheduledDays[0]] ?? "");
  const [individual, setIndividual] = useState(workout.scheduledDays.some((day) => initialTimes[day] !== initialTimes[workout.scheduledDays[0]]));
  return <WorkoutFlowDialog mobileSheet title="Workout schedule" description="Choose your training days. Start times are optional and use your local time." onClose={onClose} footer={<div className={styles.actions}><button type="button" className={styles.secondary} onClick={onClose}>Cancel</button><button type="button" className={styles.primary} onClick={() => onApply(days, normalizeWorkoutTimes(days, individual ? times : Object.fromEntries(days.map((day) => [day, shared]))))}>Apply</button></div>}>
    <div className={styles.days}>{workoutDayNames.map((name, index) => { const day = index as WorkoutDay; return <button type="button" key={name} aria-label={name} aria-pressed={days.includes(day)} onClick={() => { setDays(days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort((a, b) => a - b)); if (days.includes(day)) setTimes({ ...times, [day]: "" }); }}>{name.slice(0, 1)}</button>; })}</div>
    <label className={styles.mode}><input type="checkbox" checked={individual} onChange={(event) => { if (event.target.checked) setTimes(Object.fromEntries(days.map((day) => [day, shared]))); setIndividual(event.target.checked); }} />Different times by day</label>
    {!individual ? <><label className={styles.label}>Same time for selected days<input type="time" value={shared} onChange={(event) => setShared(event.target.value)} /></label><p className={styles.hint}>Leave blank for Any time. Applying a shared time replaces individual day times.</p></> : <div className={styles.timeRows}>{days.map((day) => <label className={styles.label} key={day}>{workoutDayNames[day]}<input type="time" value={times[day] ?? ""} onChange={(event) => setTimes({ ...times, [day]: event.target.value })} /><small>{times[day] ? "Local time" : "Any time"}</small></label>)}</div>}
    <button type="button" className={styles.secondary} onClick={() => { setDays([]); setTimes({}); setShared(""); }}>Clear schedule</button>
  </WorkoutFlowDialog>;
}
