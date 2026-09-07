"use client";

import { useRef, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import type { WorkoutDefinition } from "@/lib/types";
import styles from "./workout-flow.module.css";

export default function StartWorkoutModal({ workouts, loading, onClose, onStart, onBack, previous = false }: {
  workouts: WorkoutDefinition[]; loading: boolean; onClose: () => void; onStart: (workout?: WorkoutDefinition) => Promise<void>; onBack?: () => void; previous?: boolean;
}) {
  const [choosingSaved, setChoosingSaved] = useState(false);
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const startingRef = useRef(false);
  const search = query.trim().toLowerCase();
  const matches = workouts.filter((workout) => `${workout.name} ${workout.description}`.toLowerCase().includes(search));

  async function start(workout?: WorkoutDefinition) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    try { await onStart(workout); }
    catch (cause) { console.error("Could not start workout:", cause); setError("Couldn’t start your workout. Please try again."); }
    finally { startingRef.current = false; setStarting(false); }
  }

  return <WorkoutFlowDialog title={choosingSaved ? "Choose a saved workout" : previous ? "Log previous workout" : "Start your workout"}
    description={previous ? "Use a saved workout or start blank to record a session you’ve already done." : choosingSaved ? "Find a workout you’ve created and make it today’s session." : "Follow a familiar plan or build your session as you go."}
    onClose={onClose} busy={starting}>
    {!choosingSaved && onBack && <button type="button" className={styles.back} onClick={onBack} disabled={starting}><MaterialIcon name="chevron_left" size={18} />Back</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {starting && <p role="status" className={styles.hint}>{previous ? "Opening your workout…" : "Starting your workout…"}</p>}
    {choosingSaved ? <>
      <button type="button" className={styles.back} disabled={starting} onClick={() => { setChoosingSaved(false); setError(""); }}><MaterialIcon name="chevron_left" size={18} />Back</button>
      <label className={styles.search}><MaterialIcon name="search" size={20} /><input aria-label="Search saved workouts" placeholder="Search your workouts" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {loading ? <p role="status" className={styles.empty}>Loading your workouts…</p> : !workouts.length ? <p className={styles.empty}>No saved workouts yet. Start blank to build a session as you train, or use Create to save a routine.</p> : !matches.length ? <p className={styles.empty}>No workouts match that search.</p> :
        <div className={styles.list}>{matches.map((workout) => <button type="button" key={workout.id} className={styles.option} disabled={starting} onClick={() => void start(workout)} aria-label={`${previous ? "Log" : "Start"} ${workout.name}`}>
          <span><strong>{workout.name}</strong><small>{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}{workout.description ? ` · ${workout.description}` : ""}</small></span><MaterialIcon name="play_arrow" size={22} />
        </button>)}</div>}
    </> : <div className={styles.list}>
      <button type="button" className={styles.option} disabled={starting} onClick={() => setChoosingSaved(true)}><MaterialIcon name="fitness_center" size={26} /><span><strong>Use a saved workout</strong><small>Choose from the workouts you’ve already created.</small></span><MaterialIcon name="chevron_right" size={21} /></button>
      <button type="button" className={styles.option} disabled={starting} onClick={() => void start()}><MaterialIcon name="add" size={26} /><span><strong>Start blank</strong><small>{previous ? "Add the exercises and sets you completed." : "Start your timer and add exercises as you go."}</small></span><MaterialIcon name="chevron_right" size={21} /></button>
    </div>}
  </WorkoutFlowDialog>;
}
