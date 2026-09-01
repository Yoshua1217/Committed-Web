"use client";

import { type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import MaterialIcon from "@/components/material-icon";
import { ExerciseLoadType, WorkoutExerciseLog, WorkoutSession } from "@/lib/types";
import { getMostRecentCompletedWorkoutSession } from "@/lib/workouts-service";
import { clearRestCountdownNotification, clearRestNotifications, prepareRestNotifications, scheduleRestNotifications } from "@/lib/rest-notifications";

interface ActiveWorkoutScreenProps {
  session: WorkoutSession;
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

export default function ActiveWorkoutScreen({ session: initialSession, onChange, onFinish, onAbandon }: ActiveWorkoutScreenProps) {
  const [session, setSession] = useState(initialSession);
  const [now, setNow] = useState(Date.now());
  const [selectedSet, setSelectedSet] = useState<{ exerciseId: string; setId: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [previousSession, setPreviousSession] = useState<WorkoutSession | null>(null);
  const [timerView, setTimerView] = useState<"workout" | "rest">("workout");
  const [restTimer, setRestTimer] = useState<{ endAt: number; exerciseName: string; exerciseId: string; setId: string } | null>(null);
  const timerTouchStart = useRef<number | null>(null);
  const restHaptics = useRef({ endAt: 0, tenSecondCueSent: false, completeCueSent: false });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Ask early, while the workout screen is open, instead of making the first
  // completed set wait for Android's notification permission flow.
  useEffect(() => {
    void prepareRestNotifications();
  }, []);

  useEffect(() => {
    let active = true;
    void getMostRecentCompletedWorkoutSession(initialSession.userId, initialSession.workoutId)
      .then((previous) => { if (active) setPreviousSession(previous); })
      .catch((error) => console.error("Could not load previous workout:", error));
    return () => { active = false; };
  }, [initialSession.userId, initialSession.workoutId]);

  const elapsed = useMemo(() => formatElapsed(now - session.startedAt), [now, session.startedAt]);
  const restRemaining = restTimer ? Math.max(0, restTimer.endAt - now) : 0;
  const isResting = Boolean(restTimer && restRemaining > 0);

  useEffect(() => {
    if (restTimer && restRemaining <= 0 && restHaptics.current.endAt === restTimer.endAt) {
      if (!restHaptics.current.completeCueSent) {
        restHaptics.current.completeCueSent = true;
        void vibrateRestComplete();
      }
      void clearRestCountdownNotification();
      setRestTimer(null);
      setTimerView("workout");
    }
  }, [restRemaining, restTimer]);

  useEffect(() => {
    if (!restTimer || restHaptics.current.endAt !== restTimer.endAt || restRemaining <= 0 || restRemaining > 10_000 || restHaptics.current.tenSecondCueSent) return;
    restHaptics.current.tenSecondCueSent = true;
    void vibrateOnce();
  }, [restRemaining, restTimer]);

  function commit(next: WorkoutSession) {
    setSession(next);
    void onChange(next);
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

  function addSet(exerciseId: string) {
    updateExercise(exerciseId, (exercise) => ({ ...exercise, sets: [...exercise.sets, newSet()] }));
  }

  function applyPreviousSet(exerciseId: string, setIndex: number) {
    const previousSet = previousSession?.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.sets[setIndex];
    if (!previousSet || (previousSet.weightLbs === null && previousSet.reps === null)) return;
    updateExercise(exerciseId, (exercise) => ({ ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, weightLbs: previousSet.weightLbs, reps: previousSet.reps } : set) }));
  }

  async function finishWorkout() {
    if (finishing) return;
    setFinishing(true);
    setFinishError("");
    try {
      await onFinish(session);
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
    <div role="dialog" aria-modal="true" aria-label="Active workout" className="active-workout-screen" style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, background: "var(--background)" }}>
      <header className="active-workout-header">
        <div className="flex items-center justify-between" style={{ gap: 14 }}>
          <div style={{ minWidth: 0 }}><p style={{ color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", margin: "0 0 5px", textTransform: "uppercase" }}>Active workout</p><h1 style={{ color: "var(--primary)", fontSize: 19, fontWeight: 850, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.workoutNameSnapshot}</h1></div>
          <div className={`active-header-timer ${timerView === "rest" && isResting ? "active-header-rest-timer" : ""}`}>
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
          </div>
        </div>
      </header>

      <main className="active-workout-content">
        {session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((exercise, exerciseIndex) => (
          <section key={exercise.exerciseId} className="active-exercise-section">
            <div className="active-exercise-header">
              <div className="flex items-center" style={{ gap: 11, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, flexShrink: 0, background: "var(--background)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{exerciseIndex + 1}</span>
                <div style={{ minWidth: 0 }}><h2 style={{ color: "var(--primary)", fontSize: 18, fontWeight: 850, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.exerciseNameSnapshot}</h2><p style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 700, margin: 0 }}>{exercise.plannedSets} planned sets × {exercise.plannedReps} reps</p></div>
              </div>
            </div>
            <div className="active-set-grid active-set-heading"><span>Set</span><span>Prev</span><span>{weightLabel(exercise.loadType)}</span><span>Reps</span><span /></div>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {exercise.sets.map((set, index) => {
                const previousSet = previousSession?.exercises.find((item) => item.exerciseId === exercise.exerciseId)?.sets[index];
                const isBodyweight = exercise.loadType === "bodyweight";
                const previousText = previousSet && (previousSet.weightLbs !== null || previousSet.reps !== null) ? isBodyweight ? `BW × ${previousSet.reps ?? "—"}` : `${previousSet.weightLbs ?? "—"} × ${previousSet.reps ?? "—"}` : "—";
                return (
                <div key={set.id} className={`active-set-row ${set.completed ? "active-set-row-completed" : ""}`}>
                  <div className="active-set-grid">
                  <button type="button" onClick={() => setSelectedSet({ exerciseId: exercise.exerciseId, setId: set.id })} aria-label={`Set ${index + 1} options`} className="active-set-number">{index + 1}</button>
                  <button type="button" onClick={() => applyPreviousSet(exercise.exerciseId, index)} disabled={set.completed || !previousSet || previousText === "—"} aria-label={`Use previous set ${index + 1}: ${previousText}`} className="active-previous-set" style={{ cursor: set.completed || !previousSet || previousText === "—" ? "default" : "pointer", opacity: set.completed || !previousSet || previousText === "—" ? 0.5 : 1 }}>{previousText}</button>
                  {isBodyweight ? <span className="active-bodyweight-cell">BW</span> : <input className="active-workout-input" disabled={set.completed} type="number" inputMode="decimal" min="0" step="0.5" value={set.weightLbs ?? ""} onChange={(event) => setField(exercise.exerciseId, set.id, "weightLbs", event.target.value)} placeholder="—" aria-label={`${weightLabel(exercise.loadType)} in pounds for set ${index + 1}`} />}
                  <input className="active-workout-input" disabled={set.completed} type="number" inputMode="numeric" min="0" value={set.reps ?? ""} onChange={(event) => setField(exercise.exerciseId, set.id, "reps", event.target.value)} placeholder="—" aria-label={`Reps for set ${index + 1}`} />
                  {(() => { const canComplete = set.reps !== null && (exercise.loadType === "bodyweight" || set.weightLbs !== null); const disabled = !set.completed && !canComplete; const requirement = exercise.loadType === "bodyweight" ? "Log reps before completing this bodyweight set" : "Log weight and reps before completing this set"; return <button type="button" onClick={() => toggleSet(exercise.exerciseId, set.id)} disabled={disabled} title={disabled ? requirement : undefined} aria-label={`${set.completed ? "Mark incomplete" : "Complete"} set ${index + 1}${disabled ? `. ${requirement}` : ""}`} className="active-set-check" style={{ background: set.completed ? "#41e987" : "var(--surface-variant)", color: set.completed ? "#0A0A0A" : "var(--secondary)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.42 : 1 }}><MaterialIcon name="check" size={19} /></button>; })()}
                  </div>
                </div>
              );})}
            </div>
            <button type="button" onClick={() => addSet(exercise.exerciseId)} className="active-add-set"><MaterialIcon name="add" size={18} /> Add set</button>
          </section>
        ))}
        <div aria-hidden="true" style={{ height: 112 }} />
      </main>

      <footer className="active-workout-actions">{finishError && <p role="alert" style={{ margin: "0 0 9px", color: "#d9534f", fontSize: 12, fontWeight: 700, textAlign: "center" }}>{finishError}</p>}<div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setQuitConfirmOpen(true)} aria-label="Quit workout without saving" disabled={finishing} style={{ width: 52, minHeight: 50, display: "grid", placeItems: "center", flexShrink: 0, padding: 0, border: "1px solid #d9534f66", borderRadius: 14, background: "#d9534f18", color: "#d9534f", cursor: finishing ? "not-allowed" : "pointer", opacity: finishing ? 0.6 : 1 }}><MaterialIcon name="close" size={22} /></button><button type="button" onClick={() => void finishWorkout()} disabled={finishing} style={{ flex: 1, border: "none", borderRadius: 14, padding: 15, minHeight: 50, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: finishing ? "not-allowed" : "pointer", opacity: finishing ? 0.6 : 1 }}>{finishing ? "Finishing workout…" : "Finish workout"}</button></div></footer>

      {selectedSet && <div onMouseDown={() => setSelectedSet(null)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 81, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.55)" }}><div role="dialog" aria-modal="true" aria-label="Set options" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(340px, 100%)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 18, boxShadow: "0 18px 52px rgba(0, 0, 0, 0.35)" }}><h2 style={{ color: "var(--primary)", fontSize: 17, fontWeight: 850, margin: "0 0 7px" }}>Set options</h2><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 17px" }}>Remove this set from the workout, or keep logging.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setSelectedSet(null)} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 750, cursor: "pointer" }}>Close</button><button type="button" onClick={removeSet} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 800, cursor: "pointer" }}>Remove set</button></div></div></div>}
      {quitConfirmOpen && <div onMouseDown={() => setQuitConfirmOpen(false)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 82, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.6)" }}><div role="alertdialog" aria-modal="true" aria-label="Quit workout" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(370px, 100%)", border: "1px solid #d9534f88", borderRadius: 20, padding: 21, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><div style={{ width: 40, height: 40, display: "grid", placeItems: "center", marginBottom: 13, borderRadius: 12, background: "#d9534f1c", color: "#d9534f" }}><MaterialIcon name="close" size={23} /></div><h2 style={{ color: "#d9534f", fontSize: 20, fontWeight: 850, margin: "0 0 8px" }}>Quit this workout?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>Your timer, sets, and entries will be discarded permanently. This workout will not be saved.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setQuitConfirmOpen(false)} disabled={quitting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Keep workout</button><button type="button" onClick={() => void abandonWorkout()} disabled={quitting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: quitting ? "not-allowed" : "pointer", opacity: quitting ? 0.65 : 1 }}>{quitting ? "Quitting…" : "Quit workout"}</button></div></div></div>}
    </div>
  );
}
