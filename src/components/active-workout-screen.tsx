"use client";
import { formatRepRange } from "@/lib/workout-rep-range";

import { type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { ExerciseEffortFeedback, ExerciseTrainingHeader } from "@/components/exercise-coaching";
import { attachWorkoutCoaching } from "@/lib/workout-coaching";
import MaterialIcon from "@/components/material-icon";
import AddWorkoutExercisesModal from "@/components/add-workout-exercises-modal";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { mergePreviousExerciseLogs } from "@/lib/workout-session";
import PreviousWorkoutDetailsModal from "@/components/previous-workout-details-modal";
import { addExercisesToSession, getPreviousSetSuggestion, hasValidPreviousWorkoutTiming, hasWorkoutData, removeExerciseFromSession } from "@/lib/workout-session";
import { ExerciseLoadType, WorkoutExerciseLog, WorkoutSession } from "@/lib/types";
import { getWorkoutCoachingHistory } from "@/lib/workouts-service";
import { clearRestCountdownNotification, clearRestNotifications, prepareRestNotifications, scheduleRestNotifications } from "@/lib/rest-notifications";

interface ActiveWorkoutScreenProps {
  session: WorkoutSession;
  history?: WorkoutSession[];
  onChange: (session: WorkoutSession) => Promise<void>;
  onFinish: (session: WorkoutSession) => Promise<void>;
  onAbandon: (session: WorkoutSession) => Promise<void>;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function vibrateOnce() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() === "android") return;
  try {
    await Haptics.vibrate({ duration: 90 });
  } catch (error) {
    console.warn("Could not trigger rest haptic:", error);
  }
}

async function vibrateRestComplete() {
  await vibrateOnce();
  window.setTimeout(() => { void vibrateOnce(); }, 210);
}

function newSet() {
  return { id: crypto.randomUUID(), weightLbs: null, reps: null, completed: false };
}

function weightLabel(loadType: ExerciseLoadType | undefined): string {
  if (loadType === "assistance") return "Assist";
  if (loadType === "added_weight") return "+ Lbs";
  if (loadType === "bodyweight") return "Load";
  return "Weight";
}

export default function ActiveWorkoutScreen({ session: initialSession, history, onChange, onFinish, onAbandon }: ActiveWorkoutScreenProps) {
  const [session, setSession] = useState(initialSession);
  const latestSession = useRef(initialSession);
  const [coachingHistory, setCoachingHistory] = useState<WorkoutSession[]>(history ?? []);
  const historyLoaded = useRef(history !== undefined);
  const [coachingError, setCoachingError] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const isPreviousWorkout = session.entryMode === "previous";
  const [workoutDetailsOpen, setWorkoutDetailsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selectedSet, setSelectedSet] = useState<{ exerciseId: string; setId: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [saveError, setSaveError] = useState("");
  const saveVersion = useRef(0);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [exerciseOptionsId, setExerciseOptionsId] = useState<string | null>(null);
  const [removingExercise, setRemovingExercise] = useState(false);
  const [removeExerciseError, setRemoveExerciseError] = useState("");
  const [quitting, setQuitting] = useState(false);
  const [previousExercises, setPreviousExercises] = useState<Record<string, WorkoutExerciseLog> | null>(() => initialSession.repeatPreviousExercises ? mergePreviousExerciseLogs({}, initialSession.repeatPreviousExercises) : null);
  const [timerView, setTimerView] = useState<"workout" | "rest">("workout");
  const [restTimer, setRestTimer] = useState<{ endAt: number; exerciseName: string; exerciseId: string; setId: string } | null>(null);
  const timerTouchStart = useRef<number | null>(null);
  const restHaptics = useRef({ endAt: 0, tenSecondCueSent: false, completeCueSent: false });

  useEffect(() => {
    if (isPreviousWorkout) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isPreviousWorkout]);

  // Ask early, while the workout screen is open, instead of making the first
  // completed set wait for Android's notification permission flow.
  useEffect(() => {
    if (isPreviousWorkout) return;
    void prepareRestNotifications();
  }, [isPreviousWorkout]);

  useEffect(() => {
    let active = true;
    const source = history ? Promise.resolve(history) : getWorkoutCoachingHistory(initialSession.userId);
    void source.then((logs) => {
      if (!active) return;
      const earlier = logs.filter((item) => item.userId === initialSession.userId && item.completedAt !== null && item.completedAt < initialSession.startedAt).slice().sort((a, b) => b.completedAt! - a.completedAt!);
      const previous: Record<string, WorkoutExerciseLog> = {};
      for (const log of earlier) for (const exercise of log.exercises) previous[exercise.exerciseId] ??= exercise;
      setPreviousExercises(mergePreviousExerciseLogs(previous, initialSession.repeatPreviousExercises));
      setCoachingHistory(earlier);
      historyLoaded.current = true;
      setCoachingError(false);
      if (latestSession.current.entryMode !== "previous" && latestSession.current.exercises.some((exercise) => !exercise.coaching)) {
        const next = attachWorkoutCoaching(latestSession.current, earlier);
        latestSession.current = next;
        setSession(next);
        void onChange(next).catch(() => { if (active) setSaveError("Your targets couldn’t be saved. Your entries are still here."); });
      }
    }).catch((error) => { if (active) { console.error("Could not load coaching history:", error); setCoachingError(true); } });
    return () => { active = false; };
  }, [initialSession.userId, initialSession.startedAt, initialSession.repeatPreviousExercises, history, historyRetry, onChange]);

  const elapsed = useMemo(() => formatElapsed(now - session.startedAt), [now, session.startedAt]);
  const restRemaining = restTimer ? Math.max(0, restTimer.endAt - now) : 0;
  const isResting = Boolean(restTimer && restRemaining > 0);
  const optionsExercise = session.exercises.find((exercise) => exercise.exerciseId === exerciseOptionsId);
  const timingReady = !isPreviousWorkout || hasValidPreviousWorkoutTiming(session);
  const canFinish = hasWorkoutData(session) && timingReady;

  useEffect(() => {
    if (isPreviousWorkout) return;
    if (restTimer && restRemaining <= 0 && restHaptics.current.endAt === restTimer.endAt) {
      if (!restHaptics.current.completeCueSent) {
        restHaptics.current.completeCueSent = true;
        void vibrateRestComplete();
      }
      void clearRestCountdownNotification();
      setRestTimer(null);
      setTimerView("workout");
    }
  }, [isPreviousWorkout, restRemaining, restTimer]);

  useEffect(() => {
    if (isPreviousWorkout) return;
    if (!restTimer || restHaptics.current.endAt !== restTimer.endAt || restRemaining <= 0 || restRemaining > 10_000 || restHaptics.current.tenSecondCueSent) return;
    restHaptics.current.tenSecondCueSent = true;
    void vibrateOnce();
  }, [isPreviousWorkout, restRemaining, restTimer]);

  function commit(next: WorkoutSession) {
    latestSession.current = next;
    setSession(next);
    void persistSession(next);
  }

  async function persistSession(next: WorkoutSession) {
    const version = ++saveVersion.current;
    try {
      await onChange(next);
      if (version === saveVersion.current) setSaveError("");
    } catch (error) {
      console.error("Could not save workout progress:", error);
      if (version === saveVersion.current) setSaveError("Your latest changes couldn’t be saved. Your entries are still here.");
    }
  }

  function updateExercise(exerciseId: string, change: (exercise: WorkoutExerciseLog) => WorkoutExerciseLog) {
    commit({ ...session, updatedAt: Date.now(), exercises: session.exercises.map((exercise) => exercise.exerciseId === exerciseId ? change(exercise) : exercise) });
  }

  function setField(exerciseId: string, setId: string, field: "weightLbs" | "reps", value: string) {
    const parsed = value === "" ? null : Math.max(0, Number(value));
    updateExercise(exerciseId, (exercise) => ({ ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, [field]: Number.isFinite(parsed) ? parsed : null } : set) }));
  }

  function toggleSet(exerciseId: string, setId: string) {
    const exercise = session.exercises.find((item) => item.exerciseId === exerciseId);
    const targetSet = exercise?.sets.find((set) => set.id === setId);
    if (!exercise || !targetSet) return;
    const canComplete = targetSet.reps !== null && (exercise.loadType === "bodyweight" || targetSet.weightLbs !== null);
    if (!targetSet.completed && !canComplete) return;
    const willComplete = !targetSet.completed;
    updateExercise(exerciseId, (current) => ({ ...current, sets: current.sets.map((set) => set.id === setId ? { ...set, completed: willComplete } : set) }));
    if (isPreviousWorkout) return;
    if (willComplete) {
      const endAt = Date.now() + exercise.restSeconds * 1000;
      restHaptics.current = { endAt, tenSecondCueSent: false, completeCueSent: false };
      setRestTimer({ endAt, exerciseName: exercise.exerciseNameSnapshot, exerciseId, setId });
      void scheduleRestNotifications(exercise.exerciseNameSnapshot, endAt);
      setTimerView("rest");
    } else if (restTimer?.exerciseId === exerciseId && restTimer.setId === setId) {
      setRestTimer(null);
      void clearRestNotifications();
      setTimerView("workout");
    }
  }

  function swapTimerView() {
    if (!isResting) return;
    setTimerView((current) => current === "workout" ? "rest" : "workout");
  }

  function stopRestTimer() {
    setRestTimer(null);
    void clearRestNotifications();
    setTimerView("workout");
  }

  function handleTimerTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    const startY = timerTouchStart.current;
    timerTouchStart.current = null;
    if (startY !== null && Math.abs(event.changedTouches[0].clientY - startY) > 24) swapTimerView();
  }

  function removeSet() {
    if (!selectedSet) return;
    updateExercise(selectedSet.exerciseId, (exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.id !== selectedSet.setId) }));
    setSelectedSet(null);
  }

  function clearSet() {
    if (!selectedSet) return;
    updateExercise(selectedSet.exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => set.id === selectedSet.setId
        ? { ...set, weightLbs: null, reps: null, completed: false }
        : set),
    }));
    if (restTimer?.exerciseId === selectedSet.exerciseId && restTimer.setId === selectedSet.setId) stopRestTimer();
    setSelectedSet(null);
  }

  function addSet(exerciseId: string) {
    updateExercise(exerciseId, (exercise) => ({ ...exercise, sets: [...exercise.sets, newSet()] }));
  }

  async function removeExercise() {
    if (!exerciseOptionsId || removingExercise) return;
    const next = removeExerciseFromSession(session, exerciseOptionsId);
    if (next === session) return;
    setRemovingExercise(true);
    setRemoveExerciseError("");
    try {
      await onChange(next);
      latestSession.current = next;
      setSession(next);
      if (restTimer?.exerciseId === exerciseOptionsId) stopRestTimer();
      if (selectedSet?.exerciseId === exerciseOptionsId) setSelectedSet(null);
      setExerciseOptionsId(null);
    } catch (error) {
      console.error("Could not remove exercise:", error);
      setRemoveExerciseError("Couldn’t remove this exercise. Please try again.");
    } finally {
      setRemovingExercise(false);
    }
  }

  function applyPreviousSet(exerciseId: string, setIndex: number) {
    updateExercise(exerciseId, (exercise) => {
      const previousExercise = previousExercises === null ? undefined : previousExercises[exerciseId] ?? null;
      const previousSet = getPreviousSetSuggestion(exercise, previousExercise, setIndex);
      if (!previousSet) return exercise;
      return { ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, weightLbs: previousSet.weightLbs, reps: previousSet.reps } : set) };
    });
  }

  async function finishWorkout() {
    if (finishing) return;
    if (!canFinish) {
      setFinishError(!timingReady ? "Set the workout date and duration before saving." : "Log weight or reps for at least one set before finishing.");
      return;
    }
    setFinishing(true);
    setFinishError("");
    try {
      await onFinish(session);
      if (!isPreviousWorkout) void clearRestNotifications();
    } catch (error) {
      console.error("Could not finish workout:", error);
      setFinishError("Couldn’t finish your workout. Your logged sets are still here—please try again.");
    } finally {
      setFinishing(false);
    }
  }

  async function abandonWorkout() {
    if (quitting) return;
    setQuitting(true);
    try {
      await onAbandon(session);
    } finally {
      setQuitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={isPreviousWorkout ? "Log previous workout" : "Active workout"} className="active-workout-screen" style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: "var(--background)" }}>
      <header className="active-workout-header">
        <div className="flex items-center justify-between" style={{ gap: 14 }}>
          <div style={{ minWidth: 0 }}><p style={{ color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", margin: "0 0 5px", textTransform: "uppercase" }}>{isPreviousWorkout ? "Log previous workout" : "Active workout"}</p><h1 style={{ color: "var(--primary)", fontSize: 19, fontWeight: 850, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.workoutNameSnapshot}</h1></div>
          {isPreviousWorkout ? <button type="button" aria-label="Edit workout date and duration" disabled={finishing || quitting} onClick={() => setWorkoutDetailsOpen(true)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", background: "var(--surface)", color: "var(--primary)", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{session.durationSeconds ? formatElapsed(session.durationSeconds * 1000) : "Set time"}<MaterialIcon name="edit" size={16} /></button> : <div className={`active-header-timer ${timerView === "rest" && isResting ? "active-header-rest-timer" : ""}`}>
            <button
              type="button"
              onClick={swapTimerView}
              onTouchStart={(event) => { timerTouchStart.current = event.touches[0].clientY; }}
              onTouchEnd={handleTimerTouchEnd}
              aria-label={isResting ? `Show ${timerView === "rest" ? "workout" : "rest"} timer` : "Elapsed workout time"}
              className="active-header-timer-toggle"
              style={{ cursor: isResting ? "pointer" : "default" }}
            >
              {timerView === "rest" && isResting ? (
                <span key="rest" className="active-header-timer-content">
                  <span className="active-rest-timer-icon"><MaterialIcon name="timer" size={17} /></span>
                  <span><span className="active-rest-timer-label">Rest</span><strong>{formatCountdown(restRemaining)}</strong></span>
                </span>
              ) : (
                <span key="workout" className="active-header-timer-content active-workout-timer-content">
                  <span aria-label="Elapsed workout time">{elapsed}</span>
                  {isResting && <MaterialIcon name="timer" size={14} />}
                </span>
              )}
            </button>
            {timerView === "rest" && isResting && <button type="button" onClick={stopRestTimer} className="active-rest-stop" aria-label="Stop rest timer" title="Stop rest timer"><MaterialIcon name="stop" size={11} /></button>}
          </div>}
        </div>
      </header>

      <main className="active-workout-content" inert={finishing || quitting}>
        {isPreviousWorkout && <button type="button" onClick={() => setWorkoutDetailsOpen(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 0 18px", border: "none", background: "transparent", color: "var(--secondary)", fontSize: 13, cursor: "pointer" }}><MaterialIcon name="calendar_month" size={18} />{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.performedAt ?? session.startedAt))}<MaterialIcon name="edit" size={14} /></button>}
        {session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((exercise) => (
          <section key={exercise.exerciseId} className="active-exercise-section">
            {isPreviousWorkout ? (
              <div className="active-exercise-header">
              <div className="flex items-center" style={{ gap: 11, minWidth: 0 }}>
                <button type="button" aria-label={`Options for ${exercise.exerciseNameSnapshot}`} aria-haspopup="dialog" disabled={finishing || quitting} onClick={() => { setExerciseOptionsId(exercise.exerciseId); setRemoveExerciseError(""); }} style={{ width: 32, minHeight: 40, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: 9, flexShrink: 0, background: "transparent", color: "var(--secondary)", cursor: "pointer" }}><MaterialIcon name="more_vert" size={22} /></button>
                <div style={{ minWidth: 0 }}><h2 style={{ color: "var(--primary)", fontSize: 18, fontWeight: 850, margin: "0 0 3px", overflowWrap: "anywhere" }}>{exercise.exerciseNameSnapshot}</h2>{isPreviousWorkout && <p style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 700, margin: 0 }}>{exercise.plannedSets} planned sets × {formatRepRange(exercise)} reps</p>}</div>
              </div>
            </div>
            ) : <ExerciseTrainingHeader exercise={exercise} options={<button type="button" aria-label={`Options for ${exercise.exerciseNameSnapshot}`} aria-haspopup="dialog" disabled={finishing || quitting} onClick={() => { setExerciseOptionsId(exercise.exerciseId); setRemoveExerciseError(""); }} style={{ width: 32, minHeight: 40, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: 9, flexShrink: 0, background: "transparent", color: "var(--secondary)", cursor: "pointer" }}><MaterialIcon name="more_vert" size={22} /></button>} error={Boolean(coachingError)} onRetry={() => setHistoryRetry((value) => value + 1)} onIncrementChange={(value) => updateExercise(exercise.exerciseId, (current) => ({ ...current, weightIncrementLbs: value }))} />}
            <div className="active-set-grid active-set-heading"><span>Set</span><span>Prev</span><span>{weightLabel(exercise.loadType)}</span><span>Reps</span><span /></div>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {exercise.sets.map((set, index) => {
                const previousExercise = previousExercises === null ? undefined : previousExercises[exercise.exerciseId] ?? null;
                const previousSet = getPreviousSetSuggestion(exercise, previousExercise, index);
                const isBodyweight = exercise.loadType === "bodyweight";
                const previousText = previousSet && (previousSet.weightLbs !== null || previousSet.reps !== null) ? isBodyweight ? `BW × ${previousSet.reps ?? "—"}` : `${previousSet.weightLbs ?? "—"} × ${previousSet.reps ?? "—"}` : "—";
                return (
                <div key={set.id} className={`active-set-row ${set.completed ? "active-set-row-completed" : ""}`}>
                  <div className="active-set-grid">
                  <button type="button" onClick={() => setSelectedSet({ exerciseId: exercise.exerciseId, setId: set.id })} aria-label={`Set ${index + 1} options`} className="active-set-number">{set.kind === "warmup" ? "W" : index + 1}</button>
                  <button type="button" onClick={() => applyPreviousSet(exercise.exerciseId, index)} disabled={set.completed || !previousSet || previousText === "—"} aria-label={`Use previous set ${index + 1}: ${previousText}`} className="active-previous-set" style={{ cursor: set.completed || !previousSet || previousText === "—" ? "default" : "pointer", opacity: set.completed || !previousSet || previousText === "—" ? 0.5 : 1 }}>{previousText}</button>
                  {isBodyweight ? <span className="active-bodyweight-cell">BW</span> : <input className="active-workout-input" disabled={set.completed} type="number" inputMode="decimal" min="0" step="0.5" value={set.weightLbs ?? ""} onChange={(event) => setField(exercise.exerciseId, set.id, "weightLbs", event.target.value)} placeholder="—" aria-label={`${weightLabel(exercise.loadType)} in pounds for set ${index + 1}`} />}
                  <input className="active-workout-input" disabled={set.completed} type="number" inputMode="numeric" min="0" value={set.reps ?? ""} onChange={(event) => setField(exercise.exerciseId, set.id, "reps", event.target.value)} placeholder="—" aria-label={`Reps for set ${index + 1}`} />
                  {(() => { const canComplete = set.reps !== null && (exercise.loadType === "bodyweight" || set.weightLbs !== null); const disabled = !set.completed && !canComplete; const requirement = exercise.loadType === "bodyweight" ? "Log reps before completing this bodyweight set" : "Log weight and reps before completing this set"; return <button type="button" onClick={() => toggleSet(exercise.exerciseId, set.id)} disabled={disabled} title={disabled ? requirement : undefined} aria-label={`${set.completed ? "Mark incomplete" : "Complete"} set ${index + 1}${disabled ? `. ${requirement}` : ""}`} className="active-set-check" style={{ background: set.completed ? "#41e987" : "var(--surface-variant)", color: set.completed ? "#0A0A0A" : "var(--secondary)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.42 : 1 }}><MaterialIcon name="check" size={19} /></button>; })()}
                  </div>
                </div>
              );})}
            </div>
            <ExerciseEffortFeedback exercise={exercise} onChange={(value) => updateExercise(exercise.exerciseId, (current) => ({ ...current, effort: value }))} />
            <button type="button" onClick={() => addSet(exercise.exerciseId)} className="active-add-set"><MaterialIcon name="add" size={18} /> Add set</button>
          </section>
        ))}
        <button type="button" disabled={finishing || quitting} onClick={() => setExercisePickerOpen(true)} className="active-add-set" style={{ width: "min(220px, 100%)", minHeight: 40, margin: "16px auto 0", padding: "9px 24px", border: "1px solid var(--border)", borderRadius: 999, background: "#ffffff", color: "#0a0a0a", fontSize: 13 }}><MaterialIcon name="add" size={18} />Add exercise</button>
        {!session.exercises.length && <p style={{ color: "var(--secondary)", fontSize: 14, textAlign: "center", lineHeight: 1.5 }}>{isPreviousWorkout ? "Add the exercises you did, then enter your sets." : "Your timer is running. Add your first exercises to get started."}</p>}
        <div aria-hidden="true" style={{ height: saveError || finishError || !canFinish ? 180 : 112 }} />
      </main>

      {exercisePickerOpen && <AddWorkoutExercisesModal existingIds={session.exercises.map((exercise) => exercise.exerciseId)} onClose={() => setExercisePickerOpen(false)} onAdd={(exercises) => { const next = addExercisesToSession(session, exercises); commit(historyLoaded.current ? attachWorkoutCoaching(next, coachingHistory) : next); setExercisePickerOpen(false); }} />}
      {isPreviousWorkout && workoutDetailsOpen && <PreviousWorkoutDetailsModal session={session} onClose={() => setWorkoutDetailsOpen(false)} onSave={(next) => { commit(next); setWorkoutDetailsOpen(false); }} />}

      {optionsExercise && <WorkoutFlowDialog title="Exercise options" description={`${optionsExercise.exerciseNameSnapshot} — remove this exercise and its logged sets from the current workout.`} onClose={() => setExerciseOptionsId(null)} busy={removingExercise}>
        {removeExerciseError && <p role="alert" style={{ color: "#d9534f", fontSize: 13, margin: "0 0 12px" }}>{removeExerciseError}</p>}
        <button type="button" onClick={() => void removeExercise()} disabled={removingExercise} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, border: "1px solid #d9534f66", borderRadius: 12, background: "#d9534f18", color: "#d9534f", fontSize: 14, fontWeight: 800, cursor: removingExercise ? "not-allowed" : "pointer" }}><MaterialIcon name="delete" size={19} />{removingExercise ? "Removing…" : "Remove exercise"}</button>
      </WorkoutFlowDialog>}

      <footer className="active-workout-actions">
        {saveError && <p role="alert" style={{ margin: "0 0 9px", color: "#d9534f", fontSize: 12, textAlign: "center" }}>{saveError} <button type="button" disabled={finishing} onClick={() => void persistSession(session)} style={{ border: "none", padding: 4, background: "transparent", color: "inherit", textDecoration: "underline", fontWeight: 800, cursor: "pointer" }}>Retry save</button></p>}
        {finishError && <p role="alert" style={{ margin: "0 0 9px", color: "#d9534f", fontSize: 12, fontWeight: 700, textAlign: "center" }}>{finishError}</p>}
        {!canFinish && <p id="workout-finish-hint" style={{ margin: "0 0 9px", color: "var(--secondary)", fontSize: 12, textAlign: "center" }}>{!timingReady ? "Set the workout date and duration, then log at least one set." : "Log weight or reps in at least one set to finish."}</p>}
        <div className="flex" style={{ gap: 10 }}>
          <button type="button" onClick={() => setQuitConfirmOpen(true)} aria-label="Quit workout without saving" disabled={finishing} style={{ width: 52, minHeight: 50, display: "grid", placeItems: "center", flexShrink: 0, padding: 0, border: "1px solid #d9534f66", borderRadius: 14, background: "#d9534f18", color: "#d9534f", cursor: finishing ? "not-allowed" : "pointer", opacity: finishing ? 0.6 : 1 }}><MaterialIcon name="close" size={22} /></button>
          <button type="button" onClick={() => void finishWorkout()} disabled={finishing || !canFinish} aria-describedby={!canFinish ? "workout-finish-hint" : undefined} style={{ flex: 1, border: "none", borderRadius: 14, padding: 15, minHeight: 50, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: finishing || !canFinish ? "not-allowed" : "pointer", opacity: finishing || !canFinish ? 0.6 : 1 }}>{isPreviousWorkout ? finishing ? "Saving workout…" : "Save workout" : finishing ? "Finishing workout…" : "Finish workout"}</button>
        </div>
      </footer>

      {selectedSet && <div onMouseDown={() => setSelectedSet(null)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 81, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.55)" }}><div role="dialog" aria-modal="true" aria-label="Set options" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(340px, 100%)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 18, boxShadow: "0 18px 52px rgba(0, 0, 0, 0.35)" }}><h2 style={{ color: "var(--primary)", fontSize: 17, fontWeight: 850, margin: "0 0 7px" }}>Set options</h2><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 17px" }}>Clear its entries, remove the set, or keep logging.</p><div className="flex flex-col" style={{ gap: 10 }}><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setSelectedSet(null)} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 750, cursor: "pointer" }}>Close</button><button type="button" onClick={clearSet} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface-variant)", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Clear set</button></div><button type="button" onClick={() => { updateExercise(selectedSet.exerciseId, (exercise) => ({ ...exercise, sets: exercise.sets.map((set) => set.id === selectedSet.setId ? { ...set, kind: set.kind === "warmup" ? "working" : "warmup" } : set) })); setSelectedSet(null); }} style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", cursor: "pointer" }}>{session.exercises.find((exercise) => exercise.exerciseId === selectedSet.exerciseId)?.sets.find((set) => set.id === selectedSet.setId)?.kind === "warmup" ? "Mark as working set" : "Mark as warm-up"}</button><button type="button" onClick={removeSet} style={{ width: "100%", border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 800, cursor: "pointer" }}>Remove set</button></div></div></div>}
      {quitConfirmOpen && <div onMouseDown={() => setQuitConfirmOpen(false)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 82, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.6)" }}><div role="alertdialog" aria-modal="true" aria-label="Quit workout" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(370px, 100%)", border: "1px solid #d9534f88", borderRadius: 20, padding: 21, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><div style={{ width: 40, height: 40, display: "grid", placeItems: "center", marginBottom: 13, borderRadius: 12, background: "#d9534f1c", color: "#d9534f" }}><MaterialIcon name="close" size={23} /></div><h2 style={{ color: "#d9534f", fontSize: 20, fontWeight: 850, margin: "0 0 8px" }}>Quit this workout?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>{isPreviousWorkout ? "This entry and its logged sets will be discarded. It will not be added to your history." : "Your timer, sets, and entries will be discarded permanently. This workout will not be saved."}</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setQuitConfirmOpen(false)} disabled={quitting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Keep workout</button><button type="button" onClick={() => void abandonWorkout()} disabled={quitting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: quitting ? "not-allowed" : "pointer", opacity: quitting ? 0.65 : 1 }}>{quitting ? "Quitting…" : "Quit workout"}</button></div></div></div>}
    </div>
  );
}
