"use client";
import { formatRepRange } from "@/lib/workout-rep-range";

import { useMemo, useRef, useState } from "react";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";
import WorkoutEditor from "@/components/workout-editor";
import { workoutScheduleSummary } from "@/lib/workout-schedule";
import MaterialIcon from "@/components/material-icon";
import { ExerciseDefinition, WorkoutDefinition, WorkoutExercisePlan } from "@/lib/types";

const catalogue = exerciseCatalogueJson as ExerciseDefinition[];
interface WorkoutPreviewModalProps {
  workout: WorkoutDefinition;
  startLabel?: string;
  occurrenceLabel?: string;
  onExit: () => void;
  onStart: (workout: WorkoutDefinition) => void;
  onSave: (workout: WorkoutDefinition) => Promise<void>;
  onDelete: (workout: WorkoutDefinition) => Promise<void>;
}

export default function WorkoutPreviewModal({ workout, onExit, onStart, onSave, onDelete, startLabel = "Start workout", occurrenceLabel }: WorkoutPreviewModalProps) {
  const touchStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exercises = useMemo(() => workout.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, exercise: catalogue.find((item) => item.id === plan.exerciseId) })).filter((entry): entry is { plan: WorkoutExercisePlan; exercise: ExerciseDefinition } => Boolean(entry.exercise)), [workout.exercises]);
  const muscleGroups = useMemo(() => [...new Set(exercises.flatMap(({ exercise }) => [...exercise.primaryMuscleGroups, ...exercise.secondaryMuscleGroups]))], [exercises]);
  function dismiss() {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(onExit, 210);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 1 && event.currentTarget.scrollTop === 0) touchStartY.current = event.touches[0].clientY;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartY.current !== null) setDragOffset(Math.max(0, event.touches[0].clientY - touchStartY.current));
  }

  function handleTouchEnd() {
    if (dragOffset > 108) dismiss(); else setDragOffset(0);
    touchStartY.current = null;
  }

  async function deleteWorkout() {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(workout); } finally { setDeleting(false); }
  }

  return <div role="dialog" aria-modal="true" aria-label={`${workout.name} workout preview`} className="workout-preview-overlay" style={{ position: "fixed", inset: 0, zIndex: 70, overflow: "hidden", background: "var(--background)" }}>
    <div className="workout-preview-sheet" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ transform: isExiting ? "translateY(100%)" : `translateY(${dragOffset}px)`, transition: dragOffset === 0 || isExiting ? "transform 210ms cubic-bezier(0.22, 1, 0.36, 1)" : "none" }}>
      <header className="workout-preview-header"><div className="workout-preview-drag-handle" aria-hidden="true" /><div className="flex items-center justify-between" style={{ gap: 12 }}><button type="button" onClick={dismiss} aria-label="Exit workout preview" className="workout-preview-icon-button"><MaterialIcon name="keyboard_arrow_down" size={25} /></button><span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Workout preview</span><span style={{ width: 42 }} /></div></header>
      <main className="workout-preview-content">
        <div className="flex items-center" style={{ gap: 9, marginBottom: 9 }}><p style={{ color: "#2e9a5b", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}</p><button type="button" onClick={() => setEditorOpen(true)} aria-label="Edit workout" className="workout-preview-settings-button"><MaterialIcon name="settings" size={17} /></button></div>
        <h1 style={{ color: "var(--primary)", fontSize: 31, lineHeight: 1.1, letterSpacing: "-0.035em", margin: "0 0 13px" }}>{workout.name}</h1>
        <p className="workout-preview-description">{workout.description || "A focused workout, ready when you are."}</p>
        <p className="workout-preview-description">{occurrenceLabel}</p><p className="workout-preview-description">{workoutScheduleSummary(workout)}</p><button type="button" onClick={() => setDeleteConfirmOpen(true)} className="workout-preview-settings-button" aria-label="Delete workout"><MaterialIcon name="delete" size={18} /></button>
        <section className="workout-preview-muscle-card"><div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}><span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: "#41e98718", color: "#2e9a5b" }}><MaterialIcon name="fitness_center" size={17} /></span><h2 className="workout-preview-section-title" style={{ margin: 0 }}>Muscles being trained</h2></div><div className="flex flex-wrap" style={{ gap: 7 }}>{muscleGroups.map((muscle) => <span key={muscle} style={{ borderRadius: 999, padding: "7px 11px", background: "var(--surface-variant)", border: "1px solid var(--border)", color: "var(--primary)", fontSize: 13, fontWeight: 700 }}>{muscle}</span>)}</div></section>
        <section><h2 className="workout-preview-section-title">Exercises</h2><div className="flex flex-col" style={{ gap: 12 }}>{exercises.map(({ plan, exercise }, index) => <article key={exercise.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: "17px 17px 16px" }}><div className="flex items-start justify-between" style={{ gap: 14, marginBottom: 11 }}><div className="flex items-center" style={{ gap: 10, minWidth: 0 }}><span aria-hidden="true" style={{ width: 28, height: 28, display: "grid", flexShrink: 0, placeItems: "center", borderRadius: "50%", background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 800 }}>{index + 1}</span><h3 style={{ color: "var(--primary)", fontSize: 17, lineHeight: 1.25, margin: 0 }}>{exercise.name}</h3></div><span style={{ flexShrink: 0, borderRadius: 9, padding: "6px 8px", background: "#41e98718", color: "#2e9a5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{plan.plannedSets} sets × {formatRepRange(plan)} reps</span></div><p className="workout-preview-exercise-summary">{exercise.summary}</p><p style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 650, margin: 0 }}>{exercise.primaryMuscleGroups.join(" · ")}</p></article>)}{exercises.length === 0 && <p style={{ color: "var(--secondary)", fontSize: 14, margin: 0 }}>This workout does not have any exercises yet.</p>}</div></section><div aria-hidden="true" style={{ height: 132 }} /></main>
    </div>
    <footer className="workout-preview-actions"><button type="button" onClick={dismiss} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 14, padding: 14, minHeight: 48, background: "var(--surface)", color: "var(--primary)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Exit</button><button type="button" onClick={() => onStart(workout)} style={{ flex: 1.2, border: "none", borderRadius: 14, padding: 14, minHeight: 48, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: "pointer" }}>{startLabel}</button></footer>
    {editorOpen && <WorkoutEditor initial={workout} onClose={() => setEditorOpen(false)} onSave={onSave} />}
    {deleteConfirmOpen && <div onMouseDown={() => !deleting && setDeleteConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 75, display: "grid", placeItems: "center", padding: 22, background: "rgba(0, 0, 0, 0.67)" }}><div role="alertdialog" aria-modal="true" aria-label="Delete workout" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(380px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.4)" }}><h2 style={{ color: "#d9534f", fontSize: 20, margin: "0 0 8px" }}>Delete workout?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>This removes the workout template. Your completed workout history stays saved.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => void deleteWorkout()} disabled={deleting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.65 : 1 }}>{deleting ? "Deleting…" : "Delete workout"}</button></div></div></div>}
  </div>;
}
