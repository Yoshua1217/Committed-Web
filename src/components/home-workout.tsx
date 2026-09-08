"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createWorkoutSession, createActivitySession, createStretchRoutineSession, saveWorkoutSession, subscribeToActiveWorkoutSession, subscribeToCompletedWorkoutSessions, subscribeToStretchRoutines, subscribeToWorkouts } from "@/lib/workouts-service";
import { attachWorkoutCoaching, estimateWorkoutMinutes } from "@/lib/workout-coaching";
import { todayTraining } from "@/lib/training-dashboard";
import { formatWorkoutTime, workoutTimeOn } from "@/lib/workout-schedule";
import type { StretchRoutineDefinition, WorkoutDefinition, WorkoutSession } from "@/lib/types";
import MaterialIcon from "@/components/material-icon";
import StartTrainingModal from "@/components/start-training-modal";
import flowStyles from "@/components/workout-flow.module.css";
import styles from "@/app/dashboard/home.module.css";

export default function HomeWorkout({ userId, today, onScheduleChange }: { userId: string; today: string; onScheduleChange: (schedule: { today: string; empty: boolean }) => void }) {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutDefinition[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [routines, setRoutines] = useState<StretchRoutineDefinition[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [ready, setReady] = useState({ workouts: false, history: false, active: false, routines: false });
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const fail = () => { setFailed(true); onScheduleChange({ today, empty: false }); };
    const unsubs = [
      subscribeToWorkouts(userId, (items) => { setWorkouts(items); setReady((state) => ({ ...state, workouts: true })); onScheduleChange({ today, empty: todayTraining(items, [], today).todayWorkouts.length === 0 }); }, fail),
      subscribeToStretchRoutines(userId, (items) => { setRoutines(items); setReady((state) => ({ ...state, routines: true })); }, fail),
      subscribeToCompletedWorkoutSessions(userId, (items) => { setSessions(items); setReady((state) => ({ ...state, history: true })); }, fail),
      subscribeToActiveWorkoutSession(userId, (session) => { if (!starting.current) setActive(session); setReady((state) => ({ ...state, active: true })); }, fail),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [userId, today, retry, onScheduleChange]);
  const loading = !ready.workouts || !ready.history || !ready.active || !ready.routines;
  const { todayWorkouts } = todayTraining(workouts, sessions, today);
  async function startSession(create: () => WorkoutSession) {
    if (starting.current) return;
    if (loading || failed) throw new Error("Training is still loading. Please try again.");
    if (active) { router.push("/dashboard/workouts"); return; }
    starting.current = true; setBusy(true); setError("");
    try {
      await saveWorkoutSession(create());
      setPickerOpen(false);
      router.push("/dashboard/workouts");
    } catch (error) { setError("Couldn’t start your session. Please try again."); starting.current = false; setBusy(false); throw error; }
  }
  const start = (workout?: WorkoutDefinition) => startSession(() => attachWorkoutCoaching(createWorkoutSession(userId, workout), sessions));
  return <section className={styles.section} aria-labelledby="home-workout-title">
    <div className={styles.sectionHeader}><h2 id="home-workout-title">{!loading && !failed && !todayWorkouts.length ? "Exercise" : "Today’s workout"}</h2><Link className={styles.link} href="/dashboard/workouts">All training <MaterialIcon name="chevron_right" size={16} /></Link></div>
    {failed ? <div className={styles.panel}><p className={styles.error} role="alert">Training couldn’t load. <button className={styles.link} onClick={() => { setFailed(false); setReady({ workouts: false, history: false, active: false, routines: false }); setRetry((value) => value + 1); }}>Try again</button></p></div>
      : loading ? <div className={styles.hero}><p className={styles.meta} role="status">Loading today’s training…</p></div>
      : <>
        {active && <article className={styles.hero}><p className={styles.eyebrow}>Session in progress</p><h3>{active.workoutNameSnapshot}</h3><p className={styles.meta}>Pick up where you left off.</p><div className={styles.actions}><Link href="/dashboard/workouts" className={styles.primary}><MaterialIcon name="play_arrow" size={18} />Resume session</Link></div></article>}
        {todayWorkouts.map(({ workout, completed }) => <article className={styles.hero} key={workout.id}>
          <div className={styles.heroTop}><div><p className={styles.eyebrow}><MaterialIcon name={completed ? "check_circle" : "schedule"} size={15} />{completed ? "Completed today" : formatWorkoutTime(workoutTimeOn(workout, today))}</p><h3>{workout.name}</h3><p className={styles.meta}>{workout.exercises.length} exercises · About {estimateWorkoutMinutes(workout, sessions)} min</p></div><span className={styles.heroIcon}><MaterialIcon name="fitness_center" size={26} /></span></div>
          <div className={styles.actions}>{!active && !completed && <button className={styles.primary} disabled={busy} onClick={() => void start(workout).catch(() => {})}><MaterialIcon name="play_arrow" size={18} />{busy ? "Starting…" : "Start workout"}</button>}<Link href={`/dashboard/workouts?workout=${encodeURIComponent(workout.id)}`} className={styles.secondary}>View routine<MaterialIcon name="arrow_forward" size={16} /></Link></div>
        </article>)}
        {!todayWorkouts.length && !active && <button type="button" className={`${flowStyles.option} ${styles.startExercise}`} disabled={busy} onClick={() => setPickerOpen(true)}><MaterialIcon name="fitness_center" size={26} /><span><strong>Start exercise</strong><small>Start a blank workout, log an activity, or stretch.</small></span><MaterialIcon name="chevron_right" size={20} /></button>}
      </>}
    {error && !pickerOpen && <p className={styles.error} role="alert">{error}</p>}
    {pickerOpen && <StartTrainingModal workouts={workouts} routines={routines} loading={loading} onClose={() => setPickerOpen(false)} onWorkout={start} onActivity={(activity) => startSession(() => createActivitySession(userId, activity))} onStretch={(routine) => startSession(() => createStretchRoutineSession(userId, routine))} />}
  </section>;
}
