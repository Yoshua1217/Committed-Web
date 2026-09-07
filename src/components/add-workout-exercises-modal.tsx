"use client";

import { useState } from "react";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import type { ExerciseDefinition } from "@/lib/types";
import styles from "./workout-flow.module.css";

const catalogue = exerciseCatalogueJson as ExerciseDefinition[];

export default function AddWorkoutExercisesModal({ existingIds, onClose, onAdd }: {
  existingIds: string[]; onClose: () => void; onAdd: (exercises: ExerciseDefinition[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const search = query.trim().toLowerCase();
  const matches = catalogue.filter((exercise) => [exercise.name, exercise.summary, ...exercise.primaryMuscleGroups, ...exercise.secondaryMuscleGroups].join(" ").toLowerCase().includes(search));
  const additions = selected.flatMap((id) => {
    const exercise = catalogue.find((item) => item.id === id);
    return exercise && !existingIds.includes(id) ? [exercise] : [];
  });
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  return <WorkoutFlowDialog title="Add exercises" description="Choose as many as you like. Additions are saved to this session’s history; your saved workout stays the same." onClose={onClose}
    footer={<><p className={styles.hint} aria-live="polite">{additions.length} selected · New exercises start with 3 sets of 10 reps.</p><button type="button" className={styles.primary} disabled={!additions.length} onClick={() => onAdd(additions)}>Add to workout{additions.length ? ` · ${additions.length}` : ""}</button></>}>
    <label className={styles.search}><MaterialIcon name="search" size={20} /><input aria-label="Search exercises" placeholder="Search exercises or muscle groups" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className={styles.list}>{matches.map((exercise) => {
      const added = existingIds.includes(exercise.id);
      const checked = selected.includes(exercise.id);
      return <button type="button" key={exercise.id} className={styles.option} aria-pressed={added || checked} disabled={added} onClick={() => toggle(exercise.id)}>
        <span><strong>{exercise.name}</strong><small>{exercise.primaryMuscleGroups.join(" · ")}{added ? " · Already in workout" : ""}</small></span>
        <MaterialIcon name={added || checked ? "check_box" : "check_box_outline_blank"} size={24} />
      </button>;
    })}</div>
    {!matches.length && <p className={styles.empty}>No exercises match that search.</p>}
  </WorkoutFlowDialog>;
}
