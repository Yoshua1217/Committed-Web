"use client";

import { useMemo, useState } from "react";
import DailyWeightCard from "@/components/daily-weight-card";
import TrainingWeekCard from "@/components/training-week-card";
import { formatWorkoutTime, workoutTimeOn } from "@/lib/workout-schedule";
import MaterialIcon from "@/components/material-icon";
import { latestTrainingRecords, nextScheduledWorkout, sessionDay, trainingDateLabel } from "@/lib/training-dashboard";
import type { TrainingDashboardProps } from "@/components/training-dashboard";
import styles from "./training-dashboard.module.css";

export default function TrainingSidebar(props: Pick<TrainingDashboardProps, "userId" | "workouts" | "sessions" | "today" | "loading" | "loadErrors" | "onPreviewWorkout" | "onHistory" | "onSection">) {
  const { workouts, sessions, today, loading } = props;
  const [weightSaved, setWeightSaved] = useState(false);
  const next = useMemo(() => nextScheduledWorkout(workouts, sessions, today), [workouts, sessions, today]);
  const records = useMemo(() => latestTrainingRecords(sessions), [sessions]);
  return <aside className={styles.sidebar} aria-label="Training summary">
    {props.userId && <div className={`${styles.weightLogger} ${weightSaved ? styles.weightLoggerSaved : ""}`}>
      <DailyWeightCard key={`${props.userId}-${today}`} userId={props.userId} today={today} onSavedChange={setWeightSaved} />
    </div>}
    <TrainingWeekCard sessions={sessions} today={today} loading={loading.history} error={props.loadErrors.history} />
    <section className={styles.panel} aria-label="Next scheduled workout">
      <div className={styles.sectionHeader}><h2>Up next</h2></div>
      {props.loadErrors.workouts || props.loadErrors.history ? <p className={styles.sideNote}>Your schedule is unavailable until training data loads.</p> : loading.workouts || loading.history ? <p role="status" className={styles.sideNote}>Loading your schedule…</p> : next ? <>
        <p className={styles.eyebrow}>{next.label} · {formatWorkoutTime(workoutTimeOn(next.workout, next.day))}</p>
        <button type="button" className={styles.cardTitle} onClick={() => props.onPreviewWorkout(next.workout)}>{next.workout.name}</button>
        <p className={styles.meta}>{next.workout.exercises.length} exercise{next.workout.exercises.length === 1 ? "" : "s"}</p>
        <button type="button" className={styles.quiet} onClick={() => props.onPreviewWorkout(next.workout)}>Preview workout<MaterialIcon name="chevron_right" size={16} /></button>
      </> : <><p className={styles.sideNote}>No workouts scheduled.</p><button type="button" className={styles.quiet} onClick={() => props.onSection("routines")}>View routines<MaterialIcon name="chevron_right" size={16} /></button></>}
    </section>
    <section className={`${styles.panel} ${records.length && !loading.history && !props.loadErrors.history ? styles.prCard : ""}`} aria-label="Latest personal records">
      <div className={styles.sectionHeader}><h2>{records.length > 0 && !loading.history && !props.loadErrors.history && <MaterialIcon name="emoji_events" size={17} color="#d69e13" />}Latest PRs</h2></div>
      {props.loadErrors.history ? <p className={styles.sideNote}>Records are unavailable until history loads.</p> : loading.history ? <p role="status" className={styles.sideNote}>Loading your records…</p> : records.length ? <div className={styles.recordList}>{records.map(({ record, session }) => <button type="button" key={record.exerciseId} className={styles.recordLink} onClick={() => props.onHistory(session)} aria-label={`View ${record.exerciseNameSnapshot} PR workout`}>
        <span className={styles.recordName}>{record.exerciseNameSnapshot}</span>
        <span className={styles.gold}>{record.weightLbs} lbs{record.reps !== null ? ` × ${record.reps} reps` : ""}</span>
        <span className={styles.meta}>{trainingDateLabel(sessionDay(session))}</span>
      </button>)}</div> : <p className={styles.sideNote}>Your next personal record will appear here.</p>}
    </section>
  </aside>;
}
