"use client";

import { useRef, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import StartWorkoutModal from "@/components/start-workout-modal";
import activityCatalogue from "@/data/activity-catalogue.json";
import type { ActivityDefinition, StretchRoutineDefinition, WorkoutDefinition } from "@/lib/types";
import styles from "./workout-flow.module.css";

export default function StartTrainingModal({ workouts, routines, loading, previous = false, initialStep = "type", onClose, onWorkout, onActivity, onStretch }: {
  workouts: WorkoutDefinition[]; routines: StretchRoutineDefinition[]; loading: boolean; previous?: boolean; initialStep?: "type" | "workout";
  onClose: () => void; onWorkout: (workout?: WorkoutDefinition) => Promise<void>;
  onActivity: (activity: ActivityDefinition) => Promise<void>; onStretch: (routine?: StretchRoutineDefinition) => Promise<void>;
}) {
  const [step, setStep] = useState<"type" | "workout" | "activity" | "stretch" | "saved-stretch">(initialStep);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function start(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); }
    catch { setError("Couldn’t open your session. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  function choose(next: typeof step) { setStep(next); setQuery(""); setError(""); }
  if (step === "workout") return <StartWorkoutModal workouts={workouts} loading={loading} previous={previous} onClose={onClose} onBack={() => choose("type")} onStart={onWorkout} />;
  const title = step === "type" ? previous ? "Log previous exercise" : "Start exercise" : step === "activity" ? "Choose an activity" : step === "saved-stretch" ? "Choose a saved routine" : "Stretching routine";
  const search = query.trim().toLowerCase();
  const activities = activityCatalogue.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(search));
  const matches = routines.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search));
  return <WorkoutFlowDialog title={title} description={previous ? "Record a session you’ve already completed, with its date and total time." : "Choose your session and make it your own."} onClose={onClose} busy={busy}>
    {step !== "type" && <button type="button" className={styles.back} disabled={busy} onClick={() => choose(step === "saved-stretch" ? "stretch" : "type")}><MaterialIcon name="chevron_left" size={18} />Back</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {busy && <p role="status" className={styles.hint}>Opening your session…</p>}
    {step === "type" && <div className={styles.list}>{([
      ["workout", "fitness_center", "Workout", "Use a saved workout or add exercises to a blank session."],
      ["activity", "directions_run", "Activity", "Log a walk, run, sport, or another activity."],
      ["stretch", "self_improvement", "Stretching routine", "Follow a saved routine or add stretches one at a time."],
    ] as const).map(([next, icon, label, description]) => <button key={next} type="button" className={styles.option} onClick={() => choose(next)}><MaterialIcon name={icon} size={25} /><span><strong>{label}</strong><small>{description}</small></span><MaterialIcon name="chevron_right" size={20} /></button>)}</div>}
    {step === "stretch" && <div className={styles.list}>
      <button type="button" className={styles.option} disabled={busy} onClick={() => choose("saved-stretch")}><MaterialIcon name="self_improvement" size={25} /><span><strong>Use a saved routine</strong><small>Choose a stretching routine you’ve created.</small></span><MaterialIcon name="chevron_right" size={20} /></button>
      <button type="button" className={styles.option} disabled={busy} onClick={() => void start(() => onStretch())}><MaterialIcon name="add" size={25} /><span><strong>Start blank</strong><small>Add stretches one at a time and choose their hold times.</small></span><MaterialIcon name="chevron_right" size={20} /></button>
    </div>}
    {(step === "activity" || step === "saved-stretch") && <>
      <label className={styles.search}><MaterialIcon name="search" size={20} /><input aria-label={step === "activity" ? "Search activities" : "Search saved routines"} placeholder={step === "activity" ? "Search activities" : "Search your routines"} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.list}>{step === "activity" ? activities.map((activity) => <button key={activity.id} type="button" className={styles.option} disabled={busy} onClick={() => void start(() => onActivity(activity))}><MaterialIcon name={activity.icon} size={24} /><span><strong>{activity.name}</strong><small>{activity.category}</small></span><MaterialIcon name="chevron_right" size={20} /></button>) : matches.map((routine) => <button key={routine.id} type="button" className={styles.option} disabled={busy} onClick={() => void start(() => onStretch(routine))}><span><strong>{routine.name}</strong><small>{routine.stretches.length} stretches</small></span><MaterialIcon name="chevron_right" size={20} /></button>)}</div>
      {!(step === "activity" ? activities.length : matches.length) && <p className={styles.empty}>{step === "saved-stretch" && !routines.length ? "No saved routines yet. Go back and start blank." : "No matches found."}</p>}
    </>}
  </WorkoutFlowDialog>;
}
