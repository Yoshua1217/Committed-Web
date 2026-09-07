"use client";
import { useState } from "react";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { exerciseTarget, formatTargetSet, workingSets } from "@/lib/workout-coaching";
import type { ExerciseEffort, WorkoutExerciseLog } from "@/lib/types";
import styles from "./workout-coaching.module.css";

export function ExerciseTargetPanel({ exercise, onIncrementChange }: { exercise: WorkoutExerciseLog; onIncrementChange?: (value: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [increment, setIncrement] = useState(String(exercise.weightIncrementLbs ?? ""));
  const target = exerciseTarget(exercise);
  return <div className={styles.target} aria-label={`Target for ${exercise.exerciseNameSnapshot}`}>
    <div className={styles.targetHeader}><strong className={styles.targetLabel}><MaterialIcon name="flag" size={16} />{target.label}</strong><span className={styles.planned}>{target.sets.length} working sets · {exercise.plannedReps} saved reps</span></div>
    <p>{target.focus}</p>
    <div className={styles.chips}>{target.sets.map((set, index) => <span className={styles.chip} key={index}><small>{index + 1}</small>{formatTargetSet(set, exercise.loadType)}</span>)}</div>
    <div className={styles.targetFooter}><details className={styles.explanation}><summary>Why this target?</summary><p>{target.why}</p>{exercise.coaching?.previous && <p>Based on {new Date(exercise.coaching.previous.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Targets are guidance; log what you actually do.</p>}</details>
      {onIncrementChange && exercise.loadType !== "bodyweight" && <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>{exercise.weightIncrementLbs ? `Weight step: ${exercise.weightIncrementLbs} lbs` : "Set weight step"}</button>}
    </div>
    {editing && <WorkoutFlowDialog title="Your weight increment" description="Enter the smallest weight step available for this exercise. For dumbbells, use the step per dumbbell; for assistance, use the machine’s step." onClose={() => setEditing(false)}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); const value = Number(increment); if (!Number.isFinite(value) || value <= 0 || value > 100) return; onIncrementChange?.(value); setEditing(false); }}>
        <label>Weight step (lbs)<input autoFocus type="number" inputMode="decimal" min="0.1" max="100" step="any" required value={increment} onChange={(event) => setIncrement(event.target.value)} /></label>
        <p className={styles.muted}>Saved with this exercise’s session history. Larger jumps lead to rep guidance instead of an automatic load increase.</p>
        <button type="submit" className={styles.primary}>Use this increment</button>
      </form>
    </WorkoutFlowDialog>}
  </div>;
}

export function ExerciseEffortFeedback({ exercise, onChange }: { exercise: WorkoutExerciseLog; onChange: (value: ExerciseEffort | null) => void }) {
  if (!workingSets(exercise).length) return null;
  return <div className={styles.feedback}><fieldset><legend>How did this exercise feel? <span>Optional</span></legend><div className={styles.choices}>{([["easier", "Easier than expected"], ["about_right", "About right"], ["harder", "Harder"]] as const).map(([value, label]) => <button type="button" className={styles.choice} key={value} aria-pressed={exercise.effort === value} onClick={() => onChange(exercise.effort === value ? null : value)}>{label}</button>)}</div></fieldset>{exercise.effort && <p className={styles.muted}>Used for your next session’s guidance. Tap again to clear.</p>}</div>;
}
