"use client";

import MaterialIcon from "@/components/material-icon";
import { sessionDay, sessionSeconds, trainingDateLabel, trainingDuration } from "@/lib/training-dashboard";
import type { WorkoutSession } from "@/lib/types";
import styles from "./training-dashboard.module.css";

export default function WorkoutRecap({ session, today, onOpen }: { session: WorkoutSession; today: string; onOpen: () => void }) {
  const exercises = session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const sets = exercises.flatMap((exercise) => exercise.sets.filter((set) => set.completed));
  return <section className={styles.recap} aria-label="Workout recap">
    <div className={styles.sectionHeader}><div><p className={styles.eyebrow}><MaterialIcon name="check_circle" size={16} />{sessionDay(session) === today ? "Completed today" : `Last completed · ${trainingDateLabel(sessionDay(session))}`}</p><h2>{session.workoutNameSnapshot} recap</h2></div><button type="button" className={styles.secondary} onClick={onOpen}>View workout</button></div>
    <div className={styles.stats}><div className={styles.stat}><strong>{trainingDuration(sessionSeconds(session))}</strong><span>Workout time</span></div><div className={styles.stat}><strong>{sets.length}</strong><span>Completed sets</span></div><div className={styles.stat}><strong className={session.personalRecords.length ? styles.gold : undefined}>{session.personalRecords.length}</strong><span>PRs set</span></div></div>
    <div className={styles.recapExercises}>{exercises.map((exercise) => <div key={exercise.exerciseId}><strong>{exercise.exerciseNameSnapshot}</strong><p>{exercise.sets.filter((set) => set.completed).map((set) => `${set.kind === "warmup" ? "Warm-up: " : ""}${exercise.loadType === "bodyweight" ? "BW" : `${set.weightLbs ?? "—"} lbs${exercise.loadType === "assistance" ? " assistance" : ""}`} × ${set.reps ?? "—"}`).join(" · ") || "No completed sets"}</p></div>)}</div>
  </section>;
}
