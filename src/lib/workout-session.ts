import type { ExerciseDefinition, StretchDefinition, WorkoutDefinition, WorkoutExerciseLog, WorkoutSession, WorkoutSetLog } from "@/lib/types";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";

const catalogue = exerciseCatalogueJson as ExerciseDefinition[];

/** Planned sets alone aren't logged data; checking a set off is optional. */
export function hasWorkoutData(session: WorkoutSession): boolean {
  return session.exercises.some((exercise) => exercise.sets.some((set) =>
    [set.weightLbs, set.reps].some((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)));
}

function hasSetData(set: WorkoutSetLog | undefined): set is WorkoutSetLog {
  return !!set && (set.weightLbs !== null || set.reps !== null);
}

/**
 * Uses the same set number from the exercise's latest workout. If the exercise
 * has no completed history, later sets instead repeat the latest earlier set
 * entered during this workout. Undefined means history is still loading.
 */
export function getPreviousSetSuggestion(
  exercise: WorkoutExerciseLog,
  previousExercise: WorkoutExerciseLog | null | undefined,
  setIndex: number,
): WorkoutSetLog | null {
  if (previousExercise === undefined) return null;
  if (previousExercise !== null) {
    const matchingSet = previousExercise.sets[setIndex];
    return hasSetData(matchingSet) ? matchingSet : null;
  }
  for (let index = setIndex - 1; index >= 0; index -= 1) {
    if (hasSetData(exercise.sets[index])) return exercise.sets[index];
  }
  return null;
}

function exerciseLog(exercise: ExerciseDefinition, sortOrder: number, plannedSets = 3, plannedReps = 10): WorkoutExerciseLog {
  return {
    exerciseId: exercise.id,
    exerciseNameSnapshot: exercise.name,
    loadType: exercise.loadType,
    restSeconds: exercise.restSeconds,
    sortOrder,
    plannedSets,
    plannedReps,
    sets: Array.from({ length: plannedSets }, () => ({ id: crypto.randomUUID(), weightLbs: null, reps: null, completed: false })),
  };
}

/** A session owns its exercise logs; creating one never writes a saved workout. */
export function createWorkoutSession(userId: string, workout?: WorkoutDefinition): WorkoutSession {
  const now = Date.now();
  const id = crypto.randomUUID();
  return {
    id, userId, sessionType: "workout",
    // Blank sessions have their own identity and cannot match a saved routine.
    workoutId: workout?.id ?? `blank-${id}`,
    workoutNameSnapshot: workout?.name ?? "Freestyle workout",
    startedAt: now, completedAt: null, durationSeconds: null, completedDate: null,
    status: "active", personalRecords: [],
    exercises: (workout?.exercises ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).flatMap((plan) => {
      const exercise = catalogue.find((item) => item.id === plan.exerciseId);
      return exercise ? [exerciseLog(exercise, plan.sortOrder, plan.plannedSets, plan.plannedReps)] : [];
    }),
    createdAt: now, updatedAt: now,
  };
}

export function createPreviousWorkoutSession(userId: string, workout?: WorkoutDefinition): WorkoutSession {
  return asPreviousSession(createWorkoutSession(userId, workout));
}

export function asPreviousSession(session: WorkoutSession): WorkoutSession {
  return { ...session, entryMode: "previous", performedAt: session.startedAt, durationSeconds: 0 };
}

/** Session-only stretch snapshots never change a saved routine. */
export function addStretchToSession(session: WorkoutSession, stretch: StretchDefinition, holdSeconds: number): WorkoutSession {
  if (session.status !== "active" || session.sessionType !== "stretch") return session;
  if (!Number.isSafeInteger(holdSeconds) || holdSeconds <= 0) throw new Error("Enter a hold time greater than zero.");
  const stretches = session.stretches ?? [];
  if (stretches.some((item) => item.stretchId === stretch.id)) return session;
  return { ...session, updatedAt: Date.now(), stretches: [...stretches, {
    stretchId: stretch.id, stretchNameSnapshot: stretch.name, summarySnapshot: stretch.summary,
    instructionsSnapshot: stretch.instructions, holdSeconds, sortOrder: Math.max(-1, ...stretches.map((item) => item.sortOrder)) + 1,
  }] };
}

export function hasValidPreviousWorkoutTiming(session: WorkoutSession): boolean {
  return typeof session.performedAt === "number" && Number.isFinite(session.performedAt)
    && session.performedAt > 0 && session.performedAt <= Date.now()
    && typeof session.durationSeconds === "number" && Number.isSafeInteger(session.durationSeconds)
    && session.durationSeconds > 0 && session.performedAt - session.durationSeconds * 1000 >= 0;
}

export function setPreviousWorkoutTiming(session: WorkoutSession, performedAt: number, durationSeconds: number): WorkoutSession {
  const next = { ...session, performedAt, durationSeconds };
  if (session.entryMode !== "previous" || !hasValidPreviousWorkoutTiming(next)) {
    throw new Error("Choose a past workout time and a duration greater than zero.");
  }
  return { ...next, startedAt: performedAt - durationSeconds * 1000, updatedAt: Date.now() };
}

/** Append catalogue snapshots to this session only, preserving existing logged sets. */
export function addExercisesToSession(session: WorkoutSession, exercises: ExerciseDefinition[]): WorkoutSession {
  if (session.status !== "active" || session.sessionType !== "workout") return session;
  const existingIds = new Set(session.exercises.map((exercise) => exercise.exerciseId));
  let sortOrder = Math.max(-1, ...session.exercises.map((exercise) => exercise.sortOrder)) + 1;
  const additions = exercises.flatMap((exercise) => {
    if (existingIds.has(exercise.id)) return [];
    existingIds.add(exercise.id);
    return [{ ...exerciseLog(exercise, sortOrder++), addedDuringSession: true }];
  });
  return additions.length ? { ...session, updatedAt: Date.now(), exercises: [...session.exercises, ...additions] } : session;
}

/** Remove any session exercise without touching the saved workout or other logs. */
export function removeExerciseFromSession(session: WorkoutSession, exerciseId: string): WorkoutSession {
  if (session.status !== "active" || session.sessionType !== "workout") return session;
  const exercises = session.exercises.filter((exercise) => exercise.exerciseId !== exerciseId);
  return exercises.length === session.exercises.length ? session : { ...session, updatedAt: Date.now(), exercises };
}

/** Repeat a completed log without carrying over completion, timing, or template mutations. */
export function createRepeatedTrainingSession(userId: string, source: WorkoutSession): WorkoutSession {
  if (source.userId !== userId || source.status !== "completed") throw new Error("Only your completed sessions can be repeated.");
  const session: WorkoutSession = {
    ...createWorkoutSession(userId), sessionType: source.sessionType,
    workoutId: source.workoutId, workoutNameSnapshot: source.workoutNameSnapshot,
  };
  if (source.sessionType === "workout") {
    session.repeatPreviousExercises = structuredClone(source.exercises);
    session.exercises = structuredClone(source.exercises).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((exercise) => {
      const fresh = { ...exercise };
      delete fresh.coaching;
      delete fresh.effort;
      return { ...fresh, addedDuringSession: false, plannedSets: exercise.sets.length,
        sets: exercise.sets.map((set) => ({ id: crypto.randomUUID(), weightLbs: null, reps: null, completed: false, ...(set.kind ? { kind: set.kind } : {}) })),
      };
    });
  } else if (source.sessionType === "activity") {
    session.activityId = source.activityId ?? source.workoutId;
    session.activityCategorySnapshot = source.activityCategorySnapshot ?? "Activity";
    session.activityIconSnapshot = source.activityIconSnapshot ?? "directions_run";
    session.activityDescriptionSnapshot = source.activityDescriptionSnapshot ?? "";
    session.activityIntensity = null;
  } else {
    session.stretchRoutineId = source.stretchRoutineId ?? source.workoutId;
    session.stretchRoutineDescriptionSnapshot = source.stretchRoutineDescriptionSnapshot ?? "";
    session.stretches = structuredClone(source.stretches ?? []);
  }
  return session;
}

export function mergePreviousExerciseLogs(latest: Record<string, WorkoutExerciseLog>, repeated: WorkoutExerciseLog[] = []): Record<string, WorkoutExerciseLog> {
  return { ...latest, ...Object.fromEntries(repeated.map((exercise) => [exercise.exerciseId, exercise])) };
}
