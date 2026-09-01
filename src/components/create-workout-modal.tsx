"use client";

import { useMemo, useState } from "react";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";
import DayPicker from "@/components/day-picker";
import MaterialIcon from "@/components/material-icon";
import { ExerciseDefinition, WorkoutDefinition, WorkoutExercisePlan } from "@/lib/types";

const catalogue = exerciseCatalogueJson as ExerciseDefinition[];
const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type Days = Record<(typeof dayKeys)[number], boolean>;
type SelectedPlan = Pick<WorkoutExercisePlan, "exerciseId" | "plannedSets" | "plannedReps">;

interface CreateWorkoutModalProps {
  isOpen: boolean;
  userId: string;
  nextSortOrder: number;
  onClose: () => void;
  onCreate: (workout: WorkoutDefinition) => Promise<void>;
}

const blankDays: Days = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };

function NumberStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const safeValue = Math.max(1, value || 1);
  const buttonStyle: React.CSSProperties = { width: 30, minHeight: 0, height: 19, display: "grid", placeItems: "center", border: "none", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", padding: 0 };
  return (
    <label style={{ flex: 1, color: "var(--secondary)", fontSize: 11, fontWeight: 700 }}>
      {label}
      <span className="flex" style={{ marginTop: 5, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
        <input className="workout-stepper-input" type="number" min="1" value={safeValue} onChange={(event) => onChange(Math.max(1, Number.parseInt(event.target.value, 10) || 1))} style={{ minWidth: 0, width: "100%", border: "none", outline: "none", padding: "9px 10px", background: "transparent", color: "var(--primary)", fontSize: 15, fontWeight: 700 }} />
        <span style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)" }}>
          <button type="button" onClick={() => onChange(safeValue + 1)} aria-label={`Increase ${label.toLowerCase()}`} style={{ ...buttonStyle, borderBottom: "1px solid var(--border)" }}><MaterialIcon name="keyboard_arrow_up" size={16} /></button>
          <button type="button" onClick={() => onChange(safeValue - 1)} disabled={safeValue <= 1} aria-label={`Decrease ${label.toLowerCase()}`} style={{ ...buttonStyle, cursor: safeValue <= 1 ? "not-allowed" : "pointer", opacity: safeValue <= 1 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_down" size={16} /></button>
        </span>
      </span>
    </label>
  );
}

export default function CreateWorkoutModal({ isOpen, userId, nextSortOrder, onClose, onCreate }: CreateWorkoutModalProps) {
  const [name, setName] = useState("New workout");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<Days>(blankDays);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedPlan[]>([]);
  const [detailExercise, setDetailExercise] = useState<ExerciseDefinition | null>(null);
  const [detailSets, setDetailSets] = useState("3");
  const [detailReps, setDetailReps] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matchingExercises = useMemo(() => {
    const search = query.trim().toLowerCase();
    const selectedIds = new Set(selected.map((plan) => plan.exerciseId));
    return catalogue.filter((exercise) => !selectedIds.has(exercise.id) && (!search || [exercise.name, exercise.summary, exercise.instructions, ...exercise.primaryMuscleGroups, ...exercise.secondaryMuscleGroups].join(" ").toLowerCase().includes(search)));
  }, [query, selected]);
  const groups = useMemo(() => Array.from(new Set(matchingExercises.flatMap((exercise) => exercise.primaryMuscleGroups))).map((group) => [group, matchingExercises.filter((exercise) => exercise.primaryMuscleGroups.includes(group))] as const), [matchingExercises]);
  const selectedDetails = selected.map((plan) => ({ plan, exercise: catalogue.find((item) => item.id === plan.exerciseId) })).filter((entry): entry is { plan: SelectedPlan; exercise: ExerciseDefinition } => Boolean(entry.exercise));
  const isValid = name.trim().length > 0 && selected.length > 0 && dayKeys.some((day) => days[day]);

  if (!isOpen) return null;

  function openExercise(exercise: ExerciseDefinition) {
    const current = selected.find((plan) => plan.exerciseId === exercise.id);
    setDetailExercise(exercise);
    setDetailSets(String(current?.plannedSets ?? 3));
    setDetailReps(String(current?.plannedReps ?? 10));
  }

  function addExercise() {
    if (!detailExercise) return;
    const plannedSets = Math.max(1, Number.parseInt(detailSets, 10) || 1);
    const plannedReps = Math.max(1, Number.parseInt(detailReps, 10) || 1);
    setSelected((current) => {
      const plan = { exerciseId: detailExercise.id, plannedSets, plannedReps };
      return current.some((item) => item.exerciseId === detailExercise.id) ? current.map((item) => item.exerciseId === detailExercise.id ? plan : item) : [...current, plan];
    });
    setDetailExercise(null);
  }

  function updatePlan(exerciseId: string, field: "plannedSets" | "plannedReps", value: string) {
    const number = Math.max(1, Number.parseInt(value, 10) || 1);
    setSelected((current) => current.map((plan) => plan.exerciseId === exerciseId ? { ...plan, [field]: number } : plan));
  }

  async function createWorkout() {
    if (!isValid || saving) return;
    setSaving(true);
    setError("");
    const now = Date.now();
    try {
      await onCreate({
        id: crypto.randomUUID(), userId, name: name.trim(), description: description.trim(),
        scheduledDays: dayKeys.flatMap((day, index) => days[day] ? [index] : []) as WorkoutDefinition["scheduledDays"],
        exercises: selected.map((plan, sortOrder) => ({ ...plan, sortOrder })), sortOrder: nextSortOrder, createdAt: now, updatedAt: now,
      });
      onClose();
    } catch (createError) {
      console.error("Failed to create workout:", createError);
      setError("Couldn’t create this workout. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Create workout" style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--background)", overflowY: "auto", paddingBottom: "calc(164px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
          <button type="button" onClick={onClose} aria-label="Close create workout" style={{ width: 42, height: 42, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--border)", borderRadius: "50%", background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="close" size={22} /></button>
          <span style={{ fontSize: 13, fontWeight: 750, color: "var(--secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Create workout</span>
          <span style={{ width: 42 }} />
        </div>

        <input aria-label="Workout name" value={name} onChange={(event) => setName(event.target.value)} style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 30, fontWeight: 850, padding: 0, marginBottom: 12 }} />
        <textarea aria-label="Workout description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a short description" rows={2} style={{ width: "100%", resize: "vertical", border: "none", outline: "none", background: "transparent", color: "var(--secondary)", fontSize: 15, lineHeight: 1.5, padding: 0, marginBottom: 28 }} />

        <section style={{ marginBottom: 28 }}><h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", margin: "0 0 12px" }}>Training days</h2><DayPicker days={days} onChange={setDays} showClearButton /></section>

        {selectedDetails.length > 0 && <section style={{ marginBottom: 26 }}><div className="flex items-center justify-between" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", margin: 0 }}>Selected exercises</h2><span style={{ color: "#2e9a5b", fontSize: 12, fontWeight: 750 }}>{selectedDetails.length} added</span></div><div className="flex flex-col" style={{ gap: 10 }}>{selectedDetails.map(({ exercise, plan }) => <div key={exercise.id} style={{ background: "#41e98718", border: "1px solid #41e98755", borderRadius: 16, padding: "14px 14px 12px" }}><div className="flex items-center justify-between" style={{ gap: 10, marginBottom: 12 }}><div><p style={{ color: "var(--primary)", fontSize: 15, fontWeight: 800, margin: "0 0 3px" }}>{exercise.name}</p><p style={{ color: "var(--secondary)", fontSize: 12, margin: 0 }}>{exercise.primaryMuscleGroups.join(", ")}</p></div><button type="button" onClick={() => setSelected((current) => current.filter((item) => item.exerciseId !== exercise.id))} aria-label={`Remove ${exercise.name}`} style={{ border: "none", background: "transparent", color: "var(--secondary)", cursor: "pointer", padding: 5 }}><MaterialIcon name="close" size={19} /></button></div><div className="flex" style={{ gap: 10 }}><NumberStepper label="SETS" value={plan.plannedSets} onChange={(value) => updatePlan(exercise.id, "plannedSets", String(value))} /><NumberStepper label="REPS" value={plan.plannedReps} onChange={(value) => updatePlan(exercise.id, "plannedReps", String(value))} /></div></div>)}</div></section>}

        <section><h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", margin: "0 0 10px" }}>Add exercises</h2><div className="flex items-center" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "0 12px", gap: 8, marginBottom: 18 }}><MaterialIcon name="search" size={20} color="var(--secondary)" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises or muscle groups" style={{ minWidth: 0, width: "100%", padding: "13px 0", border: "none", outline: "none", color: "var(--primary)", background: "transparent", fontSize: 14 }} /></div>{groups.map(([group, exercises]) => <div key={group} style={{ marginBottom: 20 }}><h3 style={{ color: "var(--secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", margin: "0 0 8px", textTransform: "uppercase" }}>{group}</h3><div className="flex flex-col" style={{ gap: 8 }}>{exercises.map((exercise) => <button key={exercise.id} type="button" onClick={() => openExercise(exercise)} style={{ width: "100%", textAlign: "left", background: "var(--surface)", color: "var(--primary)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 15px", cursor: "pointer" }}><span className="flex items-center justify-between" style={{ gap: 12 }}><span><strong style={{ display: "block", fontSize: 15 }}>{exercise.name}</strong><small style={{ display: "block", color: "var(--secondary)", fontSize: 12, marginTop: 4 }}>{exercise.summary}</small></span><MaterialIcon name="chevron_right" size={20} color="var(--secondary)" /></span></button>)}</div></div>)}{groups.length === 0 && <p style={{ color: "var(--secondary)", textAlign: "center", padding: "28px 0" }}>No exercises match that search.</p>}</section>
        <div aria-hidden="true" style={{ height: 220 }} />
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 61, padding: "12px 24px calc(12px + env(safe-area-inset-bottom))", background: "var(--background)", borderTop: "1px solid var(--border)" }}><div style={{ maxWidth: 672, margin: "0 auto" }}>{error && <p style={{ color: "#d9534f", fontSize: 13, margin: "0 0 8px", textAlign: "center" }}>{error}</p>}<button type="button" disabled={!isValid || saving} onClick={() => void createWorkout()} style={{ width: "100%", border: "none", borderRadius: 14, padding: 15, background: "var(--primary)", color: "var(--background)", fontWeight: 800, fontSize: 15, cursor: isValid && !saving ? "pointer" : "not-allowed", opacity: isValid && !saving ? 1 : 0.4 }}>{saving ? "Creating…" : selected.length ? `Create workout · ${selected.length} exercise${selected.length === 1 ? "" : "s"}` : "Add exercises to create workout"}</button></div></div>

      {detailExercise && (
        <div onMouseDown={() => setDetailExercise(null)} style={{ position: "fixed", inset: 0, zIndex: 70, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.56)" }}>
          <div role="dialog" aria-modal="true" aria-label={detailExercise.name} onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(620px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, padding: 24, boxShadow: "0 24px 72px rgba(0, 0, 0, 0.35)" }}>
            <div className="flex items-start justify-between" style={{ gap: 16 }}>
              <div><h2 style={{ color: "var(--primary)", fontSize: 23, fontWeight: 850, margin: "0 0 8px" }}>{detailExercise.name}</h2><p style={{ color: "var(--secondary)", fontSize: 13, margin: 0 }}>{[...detailExercise.primaryMuscleGroups, ...detailExercise.secondaryMuscleGroups].join(" · ")}</p></div>
              <button type="button" onClick={() => setDetailExercise(null)} aria-label="Close exercise details" style={{ border: "none", background: "transparent", color: "var(--secondary)", cursor: "pointer", padding: 2 }}><MaterialIcon name="close" size={23} /></button>
            </div>
            <p style={{ color: "var(--primary)", fontSize: 15, lineHeight: 1.5, margin: "22px 0 12px" }}>{detailExercise.summary}</p>
            <p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>{detailExercise.instructions}</p>
            <div className="flex" style={{ gap: 12, marginBottom: 22 }}>
              <NumberStepper label="SETS" value={Math.max(1, Number.parseInt(detailSets, 10) || 1)} onChange={(value) => setDetailSets(String(value))} />
              <NumberStepper label="REPS" value={Math.max(1, Number.parseInt(detailReps, 10) || 1)} onChange={(value) => setDetailReps(String(value))} />
            </div>
            <div className="flex" style={{ gap: 10 }}>
              <button type="button" onClick={() => setDetailExercise(null)} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 13, background: "transparent", color: "var(--primary)", fontWeight: 750, cursor: "pointer" }}>Close</button>
              <button type="button" onClick={addExercise} style={{ flex: 1, border: "none", borderRadius: 12, padding: 13, background: "var(--primary)", color: "var(--background)", fontWeight: 800, cursor: "pointer" }}>{selected.some((plan) => plan.exerciseId === detailExercise.id) ? "Update workout" : "Add to workout"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
