import MaterialIcon from "@/components/material-icon";
import { sessionDay, sessionSeconds, trainingDateLabel, trainingDuration, trainingDays } from "@/lib/training-dashboard";
import type { WorkoutDefinition, StretchRoutineDefinition, WorkoutSession } from "@/lib/types";
import styles from "./training-dashboard.module.css";

export function TrainingRoutineCard({ workout, stretch, last, completed, onPreview, onStart, busy = false }: {
  workout?: WorkoutDefinition; stretch?: StretchRoutineDefinition; last?: WorkoutSession;
  completed?: boolean; onPreview: () => void; onStart?: () => void; busy?: boolean;
}) {
  const routine = workout ?? stretch!;
  const count = workout ? workout.exercises.length : stretch!.stretches.length;
  const days = routine.scheduledDays.slice().sort((a, b) => a - b).map((day) => trainingDays[day].slice(0, 3)).join(" · ");
  return <article className={styles.card}>
    <div className={styles.cardBody}>
      {completed !== undefined && <p className={`${styles.eyebrow} ${completed ? styles.complete : ""}`}>{completed ? <><MaterialIcon name="check_circle" size={14} />Completed today</> : "Scheduled today"}</p>}
      <button type="button" className={styles.cardTitle} onClick={onPreview} aria-label={`Preview ${routine.name}`}>{routine.name}</button>
      <span className={styles.meta}>{count} {workout ? count === 1 ? "exercise" : "exercises" : count === 1 ? "stretch" : "stretches"} · {days || "Unscheduled"}</span>
      <span className={styles.meta}>{last ? `Last performed ${trainingDateLabel(sessionDay(last))}` : "Not performed yet"}</span>
    </div>
    <div className={styles.cardActions}><button type="button" className={styles.secondary} onClick={onPreview} aria-label={`Preview routine ${routine.name}`}>Preview</button>{onStart && <button type="button" disabled={busy} className={completed ? styles.secondary : styles.primary} onClick={onStart} aria-label={`${completed ? "Start again" : "Start"} ${routine.name}`}>{busy ? "Starting…" : completed ? "Start again" : "Start"}</button>}</div>
  </article>;
}

export function TrainingHistoryCard({ session, onOpen }: { session: WorkoutSession; onOpen: () => void }) {
  const isWorkout = session.sessionType === "workout";
  const isStretch = session.sessionType === "stretch";
  const hasPr = isWorkout && session.personalRecords.length > 0;
  const count = isWorkout ? session.exercises.length : (session.stretches ?? []).length;
  return <button type="button" onClick={onOpen} className={`${styles.card} ${styles.historyCard} ${hasPr ? styles.prCard : ""}`}>
    <span className={styles.cardBody}>
      <span className={styles.historyType}>{isWorkout ? "Workout" : isStretch ? "Stretching" : "Activity"}</span>
      <strong className={styles.historyTitle}>{hasPr && <MaterialIcon name="emoji_events" size={18} color="#d69e13" />}{session.workoutNameSnapshot}</strong>
      <span className={styles.meta}>{trainingDateLabel(sessionDay(session))} · {trainingDuration(sessionSeconds(session))}{isWorkout || isStretch ? ` · ${count} ${isWorkout ? count === 1 ? "exercise" : "exercises" : count === 1 ? "stretch" : "stretches"}` : ""}{hasPr ? ` · ${session.personalRecords.length} PR${session.personalRecords.length === 1 ? "" : "s"}` : ""}</span>
    </span><MaterialIcon name="chevron_right" size={20} color={hasPr ? "#d69e13" : "var(--secondary)"} />
  </button>;
}
