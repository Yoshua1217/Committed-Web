"use client";

import { useMemo } from "react";
import MaterialIcon from "@/components/material-icon";
import { latestTrainingRecords, nextScheduledWorkout, sessionDay, trainingDateLabel, trainingDuration, weeklyTraining } from "@/lib/training-dashboard";
import type { TrainingDashboardProps } from "@/components/training-dashboard";
import styles from "./training-dashboard.module.css";

export default function TrainingSidebar(props: Pick<TrainingDashboardProps, "workouts" | "sessions" | "today" | "loading" | "loadErrors" | "onPreviewWorkout" | "onHistory" | "onSection">) {
  const { workouts, sessions, today, loading } = props;
  const week = useMemo(() => weeklyTraining(sessions, today), [sessions, today]);
  const next = useMemo(() => nextScheduledWorkout(workouts, sessions, today), [workouts, sessions, today]);
  const records = useMemo(() => latestTrainingRecords(sessions), [sessions]);
  return <aside className={styles.sidebar} aria-label="Training summary">
      <section className={styles.section}>
        <div className={styles.sectionHeader}><h2>This week</h2><small>Strength training</small></div>
        {props.loadErrors.history ? <p className={styles.loading}>Weekly totals are unavailable until history loads.</p> : loading.history ? <p role="status" className={styles.loading}>Loading your training totals…</p> : <div className={styles.panel}>
          <div className={styles.stats}><div className={styles.stat}><strong>{week.workouts.count}</strong><span>Workouts</span></div><div className={styles.stat}><strong>{trainingDuration(week.workouts.seconds)}</strong><span>Lifting time</span></div><div className={styles.stat}><strong className={week.prs ? styles.gold : undefined}>{week.prs}</strong><span>PRs set</span></div></div>
          <div className={styles.week} aria-label="Strength training this week">{week.days.map((day) => <div className={styles.day} key={day.day} aria-label={`${day.name}${day.today ? ", today" : ""}: ${day.count} strength workout${day.count === 1 ? "" : "s"}`}><span>{day.name.slice(0, 1)}</span><span className={`${styles.dayDot} ${day.count ? styles.trained : ""} ${day.today ? styles.today : ""}`}>{day.count ? <MaterialIcon name="check" size={16} /> : new Date(`${day.day}T12:00:00`).getDate()}</span></div>)}</div>
          <div className={styles.otherTotals}><span><MaterialIcon name="directions_run" size={16} />{week.activities.count} {week.activities.count === 1 ? "activity" : "activities"} · {trainingDuration(week.activities.seconds)}</span><span><MaterialIcon name="self_improvement" size={16} />{week.stretching.count} stretching session{week.stretching.count === 1 ? "" : "s"} · {trainingDuration(week.stretching.seconds)}</span></div>
        </div>}
      </section>
    <section className={styles.panel} aria-label="Next scheduled workout">
      <div className={styles.sectionHeader}><h2>Up next</h2></div>
      {props.loadErrors.workouts || props.loadErrors.history ? <p className={styles.sideNote}>Your schedule is unavailable until training data loads.</p> : loading.workouts || loading.history ? <p role="status" className={styles.sideNote}>Loading your schedule…</p> : next ? <>
        <p className={styles.eyebrow}>{next.label}</p>
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
