"use client";

import { useMemo, useRef, useState } from "react";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";
import MaterialIcon from "@/components/material-icon";
import { ExerciseDefinition, WorkoutDay, WorkoutDefinition, WorkoutExercisePlan } from "@/lib/types";

const catalogue = exerciseCatalogueJson as ExerciseDefinition[];
const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface WorkoutPreviewModalProps {
  workout: WorkoutDefinition;
  onExit: () => void;
  onStart: (workout: WorkoutDefinition) => void;
  onSave: (workout: WorkoutDefinition) => Promise<void>;
  onDelete: (workout: WorkoutDefinition) => Promise<void>;
}

function reindexPlans(plans: WorkoutExercisePlan[]): WorkoutExercisePlan[] {
  return plans.map((plan, sortOrder) => ({ ...plan, sortOrder }));
}

function NumberStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const safeValue = Math.max(1, value || 1);
  const buttonStyle: React.CSSProperties = { width: 28, height: 18, minHeight: 0, display: "grid", placeItems: "center", padding: 0, border: "none", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" };
  return <label style={{ flex: 1, color: "var(--secondary)", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em" }}>{label}<span className="flex" style={{ marginTop: 5, overflow: "hidden", border: "1px solid var(--border)", borderRadius: 10, background: "var(--background)" }}><input className="workout-stepper-input" type="number" min="1" value={safeValue} onChange={(event) => onChange(Math.max(1, Number.parseInt(event.target.value, 10) || 1))} style={{ width: "100%", minWidth: 0, padding: "8px 9px", border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 14, fontWeight: 750 }} /><span style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)" }}><button type="button" onClick={() => onChange(safeValue + 1)} aria-label={`Increase ${label.toLowerCase()}`} style={{ ...buttonStyle, borderBottom: "1px solid var(--border)" }}><MaterialIcon name="keyboard_arrow_up" size={15} /></button><button type="button" onClick={() => onChange(safeValue - 1)} disabled={safeValue <= 1} aria-label={`Decrease ${label.toLowerCase()}`} style={{ ...buttonStyle, cursor: safeValue <= 1 ? "not-allowed" : "pointer", opacity: safeValue <= 1 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_down" size={15} /></button></span></span></label>;
}

export default function WorkoutPreviewModal({ workout, onExit, onStart, onSave, onDelete }: WorkoutPreviewModalProps) {
  const touchStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<WorkoutDefinition>(workout);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exercises = useMemo(() => workout.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, exercise: catalogue.find((item) => item.id === plan.exerciseId) })).filter((entry): entry is { plan: WorkoutExercisePlan; exercise: ExerciseDefinition } => Boolean(entry.exercise)), [workout.exercises]);
  const muscleGroups = useMemo(() => [...new Set(exercises.flatMap(({ exercise }) => [...exercise.primaryMuscleGroups, ...exercise.secondaryMuscleGroups]))], [exercises]);
  const draftExercises = useMemo(() => draft.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, exercise: catalogue.find((item) => item.id === plan.exerciseId) })).filter((entry): entry is { plan: WorkoutExercisePlan; exercise: ExerciseDefinition } => Boolean(entry.exercise)), [draft.exercises]);
  const addableExercises = useMemo(() => {
    const search = exerciseSearch.trim().toLowerCase();
    const selectedIds = new Set(draft.exercises.map((plan) => plan.exerciseId));
    return catalogue.filter((exercise) => !selectedIds.has(exercise.id) && (!search || [exercise.name, exercise.summary, exercise.instructions, ...exercise.primaryMuscleGroups, ...exercise.secondaryMuscleGroups].join(" ").toLowerCase().includes(search))).slice(0, 8);
  }, [draft.exercises, exerciseSearch]);

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

  function openEditor() {
    setDraft({ ...workout, scheduledDays: [...workout.scheduledDays], exercises: workout.exercises.map((plan) => ({ ...plan })) });
    setExerciseSearch("");
    setEditorOpen(true);
  }

  function toggleDay(day: WorkoutDay) {
    setDraft((current) => ({ ...current, scheduledDays: current.scheduledDays.includes(day) ? current.scheduledDays.filter((value) => value !== day) : [...current.scheduledDays, day].sort((a, b) => a - b) }));
  }

  function updatePlan(exerciseId: string, field: "plannedSets" | "plannedReps", value: number) {
    setDraft((current) => ({ ...current, exercises: current.exercises.map((plan) => plan.exerciseId === exerciseId ? { ...plan, [field]: Math.max(1, value) } : plan) }));
  }

  function movePlan(exerciseId: string, direction: -1 | 1) {
    setDraft((current) => {
      const plans = current.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      const index = plans.findIndex((plan) => plan.exerciseId === exerciseId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= plans.length) return current;
      [plans[index], plans[target]] = [plans[target], plans[index]];
      return { ...current, exercises: reindexPlans(plans) };
    });
  }

  function removePlan(exerciseId: string) {
    setDraft((current) => ({ ...current, exercises: reindexPlans(current.exercises.filter((plan) => plan.exerciseId !== exerciseId).sort((a, b) => a.sortOrder - b.sortOrder)) }));
  }

  function addExercise(exercise: ExerciseDefinition) {
    setDraft((current) => ({ ...current, exercises: [...current.exercises, { exerciseId: exercise.id, plannedSets: 3, plannedReps: 10, sortOrder: current.exercises.length }] }));
    setExerciseSearch("");
  }

  async function saveEditor() {
    if (!draft.name.trim() || !draft.exercises.length || saving) return;
    setSaving(true);
    try {
      await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim(), exercises: reindexPlans(draft.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder)), updatedAt: Date.now() });
      setEditorOpen(false);
    } finally {
      setSaving(false);
    }
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
        <div className="flex items-center" style={{ gap: 9, marginBottom: 9 }}><p style={{ color: "#2e9a5b", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}</p><button type="button" onClick={openEditor} aria-label="Edit workout" className="workout-preview-settings-button"><MaterialIcon name="settings" size={17} /></button></div>
        <h1 style={{ color: "var(--primary)", fontSize: 31, lineHeight: 1.1, letterSpacing: "-0.035em", margin: "0 0 13px" }}>{workout.name}</h1>
        <p className="workout-preview-description">{workout.description || "A focused workout, ready when you are."}</p>
        <section className="workout-preview-muscle-card"><div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}><span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: "#41e98718", color: "#2e9a5b" }}><MaterialIcon name="fitness_center" size={17} /></span><h2 className="workout-preview-section-title" style={{ margin: 0 }}>Muscles being trained</h2></div><div className="flex flex-wrap" style={{ gap: 7 }}>{muscleGroups.map((muscle) => <span key={muscle} style={{ borderRadius: 999, padding: "7px 11px", background: "var(--surface-variant)", border: "1px solid var(--border)", color: "var(--primary)", fontSize: 13, fontWeight: 700 }}>{muscle}</span>)}</div></section>
        <section><h2 className="workout-preview-section-title">Exercises</h2><div className="flex flex-col" style={{ gap: 12 }}>{exercises.map(({ plan, exercise }, index) => <article key={exercise.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: "17px 17px 16px" }}><div className="flex items-start justify-between" style={{ gap: 14, marginBottom: 11 }}><div className="flex items-center" style={{ gap: 10, minWidth: 0 }}><span aria-hidden="true" style={{ width: 28, height: 28, display: "grid", flexShrink: 0, placeItems: "center", borderRadius: "50%", background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 800 }}>{index + 1}</span><h3 style={{ color: "var(--primary)", fontSize: 17, lineHeight: 1.25, margin: 0 }}>{exercise.name}</h3></div><span style={{ flexShrink: 0, borderRadius: 9, padding: "6px 8px", background: "#41e98718", color: "#2e9a5b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{plan.plannedSets} sets × {plan.plannedReps} reps</span></div><p className="workout-preview-exercise-summary">{exercise.summary}</p><p style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 650, margin: 0 }}>{exercise.primaryMuscleGroups.join(" · ")}</p></article>)}{exercises.length === 0 && <p style={{ color: "var(--secondary)", fontSize: 14, margin: 0 }}>This workout does not have any exercises yet.</p>}</div></section><div aria-hidden="true" style={{ height: 132 }} /></main>
    </div>
    <footer className="workout-preview-actions"><button type="button" onClick={dismiss} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 14, padding: 14, minHeight: 48, background: "var(--surface)", color: "var(--primary)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Exit</button><button type="button" onClick={() => onStart(workout)} style={{ flex: 1.2, border: "none", borderRadius: 14, padding: 14, minHeight: 48, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: "pointer" }}>Start workout</button></footer>
    {editorOpen && <div onMouseDown={() => !saving && setEditorOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 74, display: "grid", placeItems: "center", padding: 18, background: "rgba(0, 0, 0, 0.6)" }}><div role="dialog" aria-modal="true" aria-label="Edit workout" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(620px, 100%)", maxHeight: "calc(100dvh - 36px)", overflowY: "auto", padding: 20, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.4)" }}><div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 18 }}><h2 style={{ color: "var(--primary)", fontSize: 21, margin: 0 }}>Edit workout</h2><button type="button" onClick={() => setEditorOpen(false)} disabled={saving} aria-label="Close workout editor" className="workout-preview-settings-button"><MaterialIcon name="close" size={19} /></button></div><label className="workout-settings-label">Name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="workout-settings-input" /></label><label className="workout-settings-label">Description<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="workout-settings-input" rows={2} /></label><section style={{ marginTop: 21 }}><h3 style={{ color: "var(--primary)", fontSize: 15, margin: "0 0 10px" }}>Training days</h3><div className="flex justify-between" style={{ gap: 6 }}>{dayLetters.map((letter, index) => { const selected = draft.scheduledDays.includes(index as WorkoutDay); return <button key={`${letter}-${index}`} type="button" onClick={() => toggleDay(index as WorkoutDay)} aria-label={`${selected ? "Remove" : "Add"} ${dayNames[index]}`} aria-pressed={selected} style={{ width: 34, height: 34, minHeight: 0, display: "grid", placeItems: "center", border: selected ? "1px solid #2e9a5b" : "1px solid var(--border)", borderRadius: "50%", background: selected ? "#41e9871c" : "var(--background)", color: selected ? "#2e9a5b" : "var(--secondary)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{letter}</button>; })}</div></section><section style={{ marginTop: 24 }}><div className="flex items-center justify-between" style={{ marginBottom: 10 }}><h3 style={{ color: "var(--primary)", fontSize: 15, margin: 0 }}>Exercises</h3><span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 700 }}>{draftExercises.length} added</span></div><div className="flex flex-col" style={{ gap: 9 }}>{draftExercises.map(({ plan, exercise }, index) => <article key={exercise.id} style={{ padding: 13, border: "1px solid var(--border)", borderRadius: 14, background: "var(--background)" }}><div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 11 }}><div className="flex items-center" style={{ minWidth: 0, gap: 8 }}><span style={{ width: 24, height: 24, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 8, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 11, fontWeight: 800 }}>{index + 1}</span><strong style={{ overflow: "hidden", color: "var(--primary)", fontSize: 14, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.name}</strong></div><div className="flex" style={{ gap: 2 }}><button type="button" onClick={() => movePlan(exercise.id, -1)} disabled={index === 0} aria-label={`Move ${exercise.name} up`} className="workout-preview-settings-button" style={{ opacity: index === 0 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_up" size={17} /></button><button type="button" onClick={() => movePlan(exercise.id, 1)} disabled={index === draftExercises.length - 1} aria-label={`Move ${exercise.name} down`} className="workout-preview-settings-button" style={{ opacity: index === draftExercises.length - 1 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_down" size={17} /></button><button type="button" onClick={() => removePlan(exercise.id)} aria-label={`Remove ${exercise.name}`} className="workout-preview-settings-button" style={{ color: "#d9534f" }}><MaterialIcon name="close" size={17} /></button></div></div><div className="flex" style={{ gap: 9 }}><NumberStepper label="SETS" value={plan.plannedSets} onChange={(value) => updatePlan(exercise.id, "plannedSets", value)} /><NumberStepper label="REPS" value={plan.plannedReps} onChange={(value) => updatePlan(exercise.id, "plannedReps", value)} /></div></article>)}</div></section><section style={{ marginTop: 24 }}><h3 style={{ color: "var(--primary)", fontSize: 15, margin: "0 0 10px" }}>Add exercises</h3><div className="flex items-center" style={{ gap: 8, padding: "0 11px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)" }}><MaterialIcon name="search" size={19} color="var(--secondary)" /><input value={exerciseSearch} onChange={(event) => setExerciseSearch(event.target.value)} placeholder="Search exercises or muscle groups" style={{ width: "100%", minWidth: 0, padding: "11px 0", border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 14 }} /></div><div className="flex flex-col" style={{ gap: 7, marginTop: 9 }}>{addableExercises.map((exercise) => <button key={exercise.id} type="button" onClick={() => addExercise(exercise)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 11px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}><span><strong style={{ display: "block", fontSize: 13 }}>{exercise.name}</strong><small style={{ color: "var(--secondary)", fontSize: 11 }}>{exercise.primaryMuscleGroups.join(" · ")}</small></span><MaterialIcon name="add" size={19} color="#2e9a5b" /></button>)}</div>{exerciseSearch && addableExercises.length === 0 && <p style={{ margin: "10px 0 0", color: "var(--secondary)", fontSize: 13 }}>No unselected exercises match that search.</p>}</section><div className="flex" style={{ gap: 10, marginTop: 24 }}><button type="button" onClick={() => setDeleteConfirmOpen(true)} style={{ border: "1px solid #d9534f66", borderRadius: 12, padding: "12px 13px", background: "#d9534f14", color: "#d9534f", fontWeight: 800, cursor: "pointer" }}>Delete</button><button type="button" onClick={() => void saveEditor()} disabled={!draft.name.trim() || !draft.exercises.length || saving} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "var(--primary)", color: "var(--background)", fontWeight: 850, cursor: saving ? "not-allowed" : "pointer", opacity: !draft.name.trim() || !draft.exercises.length || saving ? 0.55 : 1 }}>{saving ? "Saving…" : "Save changes"}</button></div></div></div>}
    {deleteConfirmOpen && <div onMouseDown={() => !deleting && setDeleteConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 75, display: "grid", placeItems: "center", padding: 22, background: "rgba(0, 0, 0, 0.67)" }}><div role="alertdialog" aria-modal="true" aria-label="Delete workout" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(380px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.4)" }}><h2 style={{ color: "#d9534f", fontSize: 20, margin: "0 0 8px" }}>Delete workout?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>This removes the workout template. Your completed workout history stays saved.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => void deleteWorkout()} disabled={deleting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.65 : 1 }}>{deleting ? "Deleting…" : "Delete workout"}</button></div></div></div>}
  </div>;
}
