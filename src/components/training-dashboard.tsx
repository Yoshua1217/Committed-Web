"use client";

import { useId, useMemo, useState } from "react";
import TodayWorkoutCard from "@/components/today-workout-card";
import WorkoutRoutineSelect from "@/components/workout-routine-select";
import TrainingSidebar from "@/components/training-sidebar";
import MaterialIcon from "@/components/material-icon";
import { TrainingHistoryCard, TrainingRoutineCard } from "@/components/training-cards";
import { filterTrainingHistory, groupTrainingHistory, todayTraining, trainingPreview, type HistoryFilter, type TrainingSection } from "@/lib/training-dashboard";
import type { StretchRoutineDefinition, WorkoutDefinition, WorkoutSession } from "@/lib/types";
import styles from "./training-dashboard.module.css";

export interface TrainingDashboardProps {
  workouts: WorkoutDefinition[]; routines: StretchRoutineDefinition[]; sessions: WorkoutSession[]; today: string;
  section: TrainingSection; onSection: (section: TrainingSection) => void;
  loading: { workouts: boolean; routines: boolean; history: boolean }; loadErrors: { workouts: boolean; routines: boolean; history: boolean; active?: boolean }; onRetry: () => void;
  enabled: boolean; activeSession: WorkoutSession | null;
  onStart: () => void; onStartWorkout: () => void; onCreate: () => void; onLogPrevious: () => void;
  onPreviewWorkout: (workout: WorkoutDefinition) => void; onPreviewStretch: (routine: StretchRoutineDefinition) => void;
  onStartSaved: (workout: WorkoutDefinition, increments?: Record<string, number>) => Promise<void>; onHistory: (session: WorkoutSession) => void;
}

export default function TrainingDashboard(props: TrainingDashboardProps) {
  const { workouts, routines, sessions, today, section, onSection, loading } = props;
  const [routineQuery, setRoutineQuery] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [prsOnly, setPrsOnly] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const tabs = ["train", "routines", "history"] as const;
  const overview = useMemo(() => todayTraining(workouts, sessions, today), [workouts, sessions, today]);
  const preview = useMemo(() => trainingPreview(workouts, sessions, today, previewId), [workouts, sessions, today, previewId]);
  const history = useMemo(() => filterTrainingHistory(sessions, historyQuery, filter, prsOnly), [sessions, historyQuery, filter, prsOnly]);
  const groups = useMemo(() => groupTrainingHistory(history), [history]);
  const search = routineQuery.trim().toLowerCase();
  const matchingWorkouts = workouts.filter((workout) => `${workout.name} ${workout.description}`.toLowerCase().includes(search));
  const matchingStretches = routines.filter((routine) => `${routine.name} ${routine.description}`.toLowerCase().includes(search));
  async function start(workout: WorkoutDefinition) {
    if (starting) return;
    setStarting(true); setError("");
    try { await props.onStartSaved(workout); }
    catch { setError("Couldn’t start this workout. Please try again."); }
    finally { setStarting(false); }
  }
  function routineCard(workout: WorkoutDefinition, completed?: boolean) {
    return <TrainingRoutineCard key={workout.id} workout={workout} completed={completed} last={overview.last[`workout:${workout.id}`]} onPreview={() => props.onPreviewWorkout(workout)} onStart={() => void start(workout)} busy={starting || !props.enabled} />;
  }
  return <div className={styles.hub}>
    <header className={styles.header}><div><h1 className={styles.title}>Workouts</h1><p className={styles.subtitle}>Train with intention.</p></div><div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={!props.enabled} onClick={props.onStart}>{props.activeSession ? "Resume" : "Start"}</button>
      <button type="button" className={styles.secondary} disabled={!props.enabled} onClick={props.onCreate}>+ Create</button>
    </div></header>
    <div className={styles.layout}>
    <div className={styles.mainColumn}>
    <div className={styles.tabs} role="tablist" aria-label="Workout sections">{tabs.map((tab, index) => <button key={tab} id={`${id}-${tab}`} type="button" role="tab" aria-selected={section === tab} aria-controls={`${id}-${tab}-panel`} tabIndex={section === tab ? 0 : -1} className={styles.tab} onClick={() => onSection(tab)} onKeyDown={(event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next !== null) { event.preventDefault(); onSection(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus(); }
    }}>{tab === "train" ? "Train" : tab === "routines" ? "Routines" : "History"}</button>)}</div>
    {Object.values(props.loadErrors).some(Boolean) && <div role="alert" className={styles.error}>Some training data couldn’t load. <button type="button" className={styles.quiet} onClick={props.onRetry}>Try again</button></div>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <div role="tabpanel" id={`${id}-train-panel`} aria-labelledby={`${id}-train`} hidden={section !== "train"}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}><h2>Today’s training</h2><small>{new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</small></div>
        {props.loadErrors.workouts ? <p className={styles.loading}>Workouts are unavailable. Try loading again.</p> : loading.workouts ? <p role="status" className={styles.loading}>Loading your workouts…</p> : overview.todayWorkouts.length ? <div className={styles.stack}>{overview.todayWorkouts.map(({ workout, completed }) => <TodayWorkoutCard key={workout.id} workout={workout} sessions={sessions} completed={completed} historyReady={!loading.history && !props.loadErrors.history} enabled={props.enabled} active={!!props.activeSession} onStart={props.onStartSaved} onPreview={() => props.onPreviewWorkout(workout)} />)}</div> : <>
          {preview ? <>
            <p className={styles.restNote}>No workout scheduled today. Get ready for your next session, or choose a routine below.</p>
            <WorkoutRoutineSelect workouts={workouts.slice().sort((a, b) => a.sortOrder - b.sortOrder)} value={preview.workout.id} onChange={setPreviewId} />
            <TodayWorkoutCard key={preview.workout.id} workout={preview.workout} sessions={sessions} completed={false} contextLabel={preview.label} historyReady={!loading.history && !props.loadErrors.history} enabled={props.enabled} active={!!props.activeSession} onStart={props.onStartSaved} onPreview={() => props.onPreviewWorkout(preview.workout)} />
          </> : <div className={styles.empty}><h3>Build your next session.</h3><p>Save a routine to see exercise targets and guidance here, or start a freestyle workout.</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={!props.enabled} onClick={props.onCreate}>Create routine</button><button type="button" className={styles.secondary} disabled={!props.enabled} onClick={props.onStartWorkout}>{props.activeSession ? "Resume session" : "Start freestyle"}</button></div></div>}
        </>}
      </section>

    </div>
    <div role="tabpanel" id={`${id}-routines-panel`} aria-labelledby={`${id}-routines`} hidden={section !== "routines"}>
      <label className={styles.search}><MaterialIcon name="search" size={20} /><input aria-label="Search routines" placeholder="Search your routines" value={routineQuery} onChange={(event) => setRoutineQuery(event.target.value)} /></label>
      <section className={styles.section}><div className={styles.sectionHeader}><h2>Your workouts</h2><small>{matchingWorkouts.length} routine{matchingWorkouts.length === 1 ? "" : "s"}</small></div>
        {props.loadErrors.workouts ? <p className={styles.loading}>Workouts are unavailable. Try loading again.</p> : loading.workouts ? <p role="status" className={styles.loading}>Loading your workouts…</p> : matchingWorkouts.length ? <div className={styles.stack}>{matchingWorkouts.map((workout) => routineCard(workout))}</div> : <div className={styles.empty}><h3>{workouts.length ? "No matching workouts" : "Build your first workout"}</h3><p>{workouts.length ? "Try another name or description." : "Saved workouts live here, whether scheduled or not."}</p>{!workouts.length && <button type="button" className={styles.secondary} onClick={props.onCreate} disabled={!props.enabled}>Create routine</button>}</div>}
      </section>
      <section className={styles.section}><div className={styles.sectionHeader}><h2>Stretching routines</h2><small>{matchingStretches.length} routine{matchingStretches.length === 1 ? "" : "s"}</small></div>
        {props.loadErrors.routines ? <p className={styles.loading}>Stretching routines are unavailable. Try loading again.</p> : loading.routines ? <p role="status" className={styles.loading}>Loading stretching routines…</p> : matchingStretches.length ? <div className={styles.stack}>{matchingStretches.map((routine) => <TrainingRoutineCard key={routine.id} stretch={routine} last={overview.last[`stretch:${routine.id}`]} onPreview={() => props.onPreviewStretch(routine)} />)}</div> : <p className={styles.loading}>{routines.length ? "No stretching routines match that search." : "Create a stretching routine, or start a blank session from Start."}</p>}
      </section>
    </div>
    <div role="tabpanel" id={`${id}-history-panel`} aria-labelledby={`${id}-history`} hidden={section !== "history"}>
      <div className={styles.sectionHeader}><h2>Training history</h2><button type="button" className={styles.secondary} onClick={props.onLogPrevious} disabled={!props.enabled}><MaterialIcon name="history" size={17} />Log previous exercise</button></div>
      <label className={styles.search}><MaterialIcon name="search" size={20} /><input aria-label="Search training history" placeholder="Search sessions, exercises, or stretches" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /></label>
      <div className={styles.filters}><select aria-label="Training type" value={filter} onChange={(event) => setFilter(event.target.value as HistoryFilter)}><option value="all">All training</option><option value="workout">Workouts</option><option value="activity">Activities</option><option value="stretch">Stretching</option></select><label className={styles.prFilter}><input type="checkbox" checked={prsOnly} onChange={(event) => setPrsOnly(event.target.checked)} /><MaterialIcon name="emoji_events" size={16} color={prsOnly ? "#d69e13" : "var(--secondary)"} />PRs only</label></div>
      {props.loadErrors.history ? <p className={styles.loading}>History is unavailable. Try loading again.</p> : loading.history ? <p role="status" className={styles.loading}>Loading history…</p> : <><p aria-live="polite" className={styles.meta}>{history.length} session{history.length === 1 ? "" : "s"}</p>{groups.map((group) => <section key={group.month}><h3 className={styles.month}>{group.label}</h3><div className={styles.stack}>{group.sessions.map((session) => <TrainingHistoryCard key={session.id} session={session} onOpen={() => props.onHistory(session)} />)}</div></section>)}{!history.length && <div className={styles.empty}><h3>{sessions.length ? "No matching sessions" : "Your training starts here"}</h3><p>{sessions.length ? "Try another search or clear your filters." : "Finish a session or log previous exercise to build your history."}</p>{sessions.length > 0 && <button type="button" className={styles.secondary} onClick={() => { setHistoryQuery(""); setFilter("all"); setPrsOnly(false); }}>Clear filters</button>}</div>}</>}
    </div>
    </div>
    <TrainingSidebar {...props} />
    </div>
  </div>;
}
