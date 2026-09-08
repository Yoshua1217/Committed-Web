"use client";
import { formatRepRange } from "@/lib/workout-rep-range";
import { type ReactNode, useId, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { exerciseTarget, formatTargetSet, workingSets } from "@/lib/workout-coaching";
import type { ExerciseEffort, WorkoutExerciseLog } from "@/lib/types";
import styles from "./workout-coaching.module.css";

export function ExerciseTrainingHeader({ exercise, options, onIncrementChange, error = false, onRetry, showPrevious = false, heading = "h2", collapsible = true }: { exercise: WorkoutExerciseLog; options?: ReactNode; onIncrementChange: (value: number) => void; error?: boolean; onRetry?: () => void; showPrevious?: boolean; heading?: "h2" | "h5"; collapsible?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const Heading = heading;
  const cue = exercise.coaching ? exerciseTarget(exercise).label : error ? "Targets unavailable" : "Loading your targets…";
  return <div className={styles.trainingHeader}>
    <div className={styles.trainingHeading}>
      {options}
      <Heading className={styles.trainingTitle}>{collapsible ? <button type="button" className={styles.trainingToggle} aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
        <span className={styles.trainingName}>{exercise.exerciseNameSnapshot}<span className={styles.trainingCue}>{cue}</span></span>
        <MaterialIcon name={expanded ? "expand_less" : "expand_more"} size={21} />
      </button> : <span className={styles.trainingName}>{exercise.exerciseNameSnapshot}<span className={styles.trainingGoal}>{cue}</span></span>}</Heading>
    </div>
    <div id={contentId} hidden={collapsible && !expanded} className={styles.trainingContent}>
      {exercise.coaching ? <ExerciseTargetPanel exercise={exercise} embedded onIncrementChange={onIncrementChange} /> : <p className={styles.muted}>{error ? "Targets are unavailable. You can still log your workout." : "Loading your targets…"}{error && <button type="button" className={styles.quiet} onClick={onRetry}>Retry</button>}</p>}
      {showPrevious && exercise.coaching?.previous && <p className={styles.previousTarget}>Last time: {workingSets(exercise.coaching.previous).map((set) => formatTargetSet(set, exercise.loadType)).join(" · ") || "No completed working sets"}</p>}
    </div>
  </div>;
}

export function ExerciseTargetPanel({ exercise, onIncrementChange, embedded = false }: { exercise: WorkoutExerciseLog; onIncrementChange?: (value: number) => void; embedded?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [increment, setIncrement] = useState(String(exercise.weightIncrementLbs ?? ""));
  const target = exerciseTarget(exercise);
  return <div className={`${styles.target}${embedded ? ` ${styles.embeddedTarget}` : ""}`} aria-label={`Target for ${exercise.exerciseNameSnapshot}`}>
    <div className={styles.targetHeader}>{!embedded && <strong className={styles.targetLabel}><MaterialIcon name="flag" size={16} />{target.label}</strong>}<span className={styles.planned}>{target.sets.length} working sets · {formatRepRange(exercise)} target reps</span></div>
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
