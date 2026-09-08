"use client";
import { useMemo, useState } from "react";
import ChangeWorkoutTime from "@/components/change-workout-time";
import { nextScheduledWorkout } from "@/lib/training-dashboard";
import { useToday } from "@/lib/use-today";
import { formatWorkoutTime, workoutTimeOn, workoutScheduleSummary } from "@/lib/workout-schedule";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { ExerciseTrainingHeader } from "@/components/exercise-coaching";
import { createWorkoutSession } from "@/lib/workout-session";
import { attachWorkoutCoaching, estimateWorkoutMinutes, exerciseTarget } from "@/lib/workout-coaching";
import type { WorkoutDefinition, WorkoutSession } from "@/lib/types";
import styles from "./workout-coaching.module.css";

export default function TodayWorkoutCard({ workout, sessions, completed, historyReady, enabled, active, onStart, onPreview, contextLabel }: {
  workout: WorkoutDefinition; sessions: WorkoutSession[]; completed: boolean; historyReady: boolean; enabled: boolean; active: boolean;
  onStart: (workout: WorkoutDefinition, increments?: Record<string, number>) => Promise<void>; onPreview: () => void; contextLabel?: string;
}) {
  const today = useToday();
  const upcoming = nextScheduledWorkout([workout], sessions, today);
  const [changingDate, setChangingDate] = useState<string | null>(null);
  const [increments, setIncrements] = useState<Record<string, number>>({});
  const [adjusting, setAdjusting] = useState<"shorten" | "adjust" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = useMemo(() => {
    const session = attachWorkoutCoaching(createWorkoutSession(workout.userId, workout), sessions);
    return { ...session, exercises: session.exercises.map((exercise) => increments[exercise.exerciseId] ? { ...exercise, weightIncrementLbs: increments[exercise.exerciseId] } : exercise) };
  }, [workout, sessions, increments]);
  const building = draft.exercises.filter((exercise) => ["reps", "weight"].includes(exerciseTarget(exercise).action)).length;
  async function start(next: WorkoutDefinition) {
    if (busy) return;
    setBusy(true); setError("");
    try { await onStart(next, increments); setAdjusting(null); }
    catch { setError("Couldn’t start your workout. Your routine is unchanged. Please try again."); }
    finally { setBusy(false); }
  }
  return <article className={styles.today}>
    <div className={styles.intro}><p className={`${styles.eyebrow} ${completed ? styles.positive : ""}`}><MaterialIcon name={completed ? "check_circle" : "fitness_center"} size={16} />{completed ? "Completed today" : contextLabel ?? "Today’s workout"}</p><h3>{workout.name}</h3><p className={styles.muted}>{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"} · About {estimateWorkoutMinutes(workout, sessions)} min · Your saved routine</p>
      <p className={styles.muted}>{upcoming ? `${upcoming.label} · ${formatWorkoutTime(workoutTimeOn(workout, upcoming.day))}` : workoutScheduleSummary(workout)}</p>
      <p className={styles.focus}>{!historyReady ? "Your exercise targets will appear when history loads." : building ? `A small step forward on ${building} exercise${building === 1 ? "" : "s"}. Keep the rest consistent.` : "Make each working set count. Follow the targets below at your own pace."}</p>
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={!enabled || busy} onClick={() => void start(workout)}>{busy ? "Starting…" : active ? "Resume" : completed ? "Start again" : "Start workout"}</button><button type="button" className={styles.secondary} onClick={onPreview}>Preview</button>{upcoming && <button type="button" className={styles.secondary} disabled={!enabled || busy || !historyReady} onClick={() => setChangingDate(upcoming.day)}>Change time</button>}<button type="button" className={styles.quiet} disabled={!enabled || busy} onClick={() => setAdjusting("adjust")}>Adjust today</button><button type="button" className={styles.quiet} disabled={!enabled || busy} onClick={() => setAdjusting("shorten")}>Shorten session</button></div>
      {error && !adjusting && <p role="alert" className={styles.error}>{error}</p>}
    </div>
    <div className={styles.targets}><h4 className={styles.sectionTitle}>Your next targets</h4>{!historyReady ? <p className={styles.muted}>History is needed for progress-based guidance. You can still start and log normally.</p> : draft.exercises.length ? draft.exercises.map((exercise) => <ExerciseTrainingHeader key={exercise.exerciseId} exercise={exercise} heading="h5" collapsible={false} showPrevious onIncrementChange={(value) => setIncrements((current) => ({ ...current, [exercise.exerciseId]: value }))} />) : <p className={styles.muted}>Add exercises to this routine to see their targets.</p>}</div>
    {changingDate && <ChangeWorkoutTime workout={workout} date={changingDate} onClose={() => setChangingDate(null)} />}
    {adjusting && <AdjustTodayDialog workout={workout} mode={adjusting} busy={busy} error={error} onClose={() => { setAdjusting(null); setError(""); }} onStart={start} />}
  </article>;
}

function AdjustTodayDialog({ workout, mode, busy, error, onClose, onStart }: { workout: WorkoutDefinition; mode: "shorten" | "adjust"; busy: boolean; error: string; onClose: () => void; onStart: (workout: WorkoutDefinition) => Promise<void> }) {
  const [plans, setPlans] = useState(() => workout.exercises.map((plan) => ({ ...plan, included: true })));
  const names = useMemo(() => createWorkoutSession(workout.userId, workout).exercises, [workout]);
  return <WorkoutFlowDialog title={mode === "shorten" ? "A shorter session" : "Adjust today’s session"} description={mode === "shorten" ? "Choose the exercises and sets you have room for. Your saved routine stays the same." : "Adjust exercises, sets, or reps for this session only."} busy={busy} onClose={onClose}>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (!plans.some((plan) => plan.included)) return; void onStart({ ...workout, exercises: plans.filter((plan) => plan.included).map(({ exerciseId, sortOrder, plannedSets, plannedReps, plannedRepsMax }) => ({ exerciseId, sortOrder, plannedSets, plannedReps, ...(plannedRepsMax !== undefined ? { plannedRepsMax } : {}) })) }); }}>
      {plans.map((plan, index) => <div key={plan.exerciseId} className={styles.adjustRow}><label><input type="checkbox" checked={plan.included} disabled={busy} onChange={(event) => setPlans((current) => current.map((item, i) => i === index ? { ...item, included: event.target.checked } : item))} />{names.find((item) => item.exerciseId === plan.exerciseId)?.exerciseNameSnapshot ?? plan.exerciseId}</label>{plan.included && <div className={styles.adjustFields}>{(["plannedSets", "plannedReps", "plannedRepsMax"] as const).map((field) => <label key={field}>{field === "plannedSets" ? "Sets" : field === "plannedReps" ? "Min reps" : "Max reps"}<input required disabled={busy} type="number" min={field === "plannedRepsMax" ? Math.max(1, plan.plannedReps) : 1} max={field === "plannedSets" ? 20 : undefined} step="1" value={(field === "plannedRepsMax" ? plan.plannedRepsMax ?? plan.plannedReps : plan[field]) || ""} onChange={(event) => setPlans((current) => current.map((item, i) => i === index ? { ...item, ...(field === "plannedReps" ? { plannedRepsMax: item.plannedRepsMax ?? item.plannedReps } : {}), [field]: Number(event.target.value) } : item))} /></label>)}</div>}</div>)}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button type="submit" className={styles.primary} disabled={busy || !plans.some((plan) => plan.included)}>{busy ? "Starting…" : "Start this session"}</button>
    </form>
  </WorkoutFlowDialog>;
}
