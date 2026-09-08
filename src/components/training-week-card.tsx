"use client";

import { useMemo } from "react";
import MaterialIcon from "@/components/material-icon";
import { trainingDuration, weeklyTraining } from "@/lib/training-dashboard";
import type { WorkoutSession } from "@/lib/types";
import styles from "./training-dashboard.module.css";

export default function TrainingWeekCard({ sessions, today, loading = false, error = false, showHeading = true }: {
  sessions: WorkoutSession[];
  today: string;
  loading?: boolean;
  error?: boolean;
  showHeading?: boolean;
}) {
  const week = useMemo(() => weeklyTraining(sessions, today), [sessions, today]);

  return <section className={`${styles.section} ${styles.weekSummary} ${showHeading ? "" : styles.standaloneWeekSummary}`} aria-label="Training this week">
    {showHeading && <div className={styles.sectionHeader}><h2>This week</h2><small>Strength training</small></div>}
    {error ? <p className={styles.loading}>Weekly totals are unavailable until history loads.</p> : loading ? <p role="status" className={styles.loading}>Loading your training totals…</p> : <div className={styles.panel}>
      <div className={styles.stats}><div className={styles.stat}><strong>{week.workouts.count}</strong><span>Workouts</span></div><div className={styles.stat}><strong>{trainingDuration(week.workouts.seconds)}</strong><span>Lifting time</span></div><div className={styles.stat}><strong className={week.prs ? styles.gold : undefined}>{week.prs}</strong><span>PRs set</span></div></div>
      <div className={styles.week} aria-label="Strength training this week">{week.days.map((day) => <div className={styles.day} key={day.day} aria-label={`${day.name}${day.today ? ", today" : ""}: ${day.count} strength workout${day.count === 1 ? "" : "s"}`}><span>{day.name.slice(0, 1)}</span><span className={`${styles.dayDot} ${day.count ? styles.trained : ""} ${day.today ? styles.today : ""}`}>{day.count ? <MaterialIcon name="check" size={16} /> : new Date(`${day.day}T12:00:00`).getDate()}</span></div>)}</div>
      <div className={styles.otherTotals}><span><MaterialIcon name="directions_run" size={16} />{week.activities.count} {week.activities.count === 1 ? "activity" : "activities"} · {trainingDuration(week.activities.seconds)}</span><span><MaterialIcon name="self_improvement" size={16} />{week.stretching.count} stretching session{week.stretching.count === 1 ? "" : "s"} · {trainingDuration(week.stretching.seconds)}</span></div>
    </div>}
  </section>;
}
