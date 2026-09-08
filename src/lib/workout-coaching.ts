import { repRange } from "@/lib/workout-rep-range";
import type { ExerciseCoaching, ExerciseCoachingBaseline, WorkoutDefinition, WorkoutExerciseLog, WorkoutSession } from "@/lib/types";

export interface ExerciseTarget {
  action: "baseline" | "repeat" | "reps" | "weight" | "ease";
  label: string;
  focus: string;
  why: string;
  sets: { weightLbs: number | null; reps: number }[];
  needsWeightStep: boolean;
}

export function workingSets(exercise: Pick<WorkoutExerciseLog, "sets" | "loadType">) {
  return exercise.sets.filter((set) => set.kind !== "warmup" && set.completed && Number.isSafeInteger(set.reps) && set.reps! > 0
    && (exercise.loadType === "bodyweight" || (typeof set.weightLbs === "number" && Number.isFinite(set.weightLbs) && set.weightLbs >= 0)));
}

function baseline(session: WorkoutSession, exercise: WorkoutExerciseLog): ExerciseCoachingBaseline {
  return { sessionId: session.id, completedAt: session.completedAt!, loadType: exercise.loadType, plannedReps: exercise.plannedReps, ...(exercise.plannedRepsMax !== undefined ? { plannedRepsMax: exercise.plannedRepsMax } : {}),
    effort: exercise.effort ?? null, sets: exercise.sets.map((set) => ({ ...set })) };
}

export function coachingEvidence(exercise: WorkoutExerciseLog, history: WorkoutSession[], userId: string, before = Infinity): ExerciseCoaching {
  const matches = history.filter((session) => session.userId === userId && session.status === "completed" && session.sessionType === "workout" && session.completedAt !== null && session.completedAt < before)
    .slice().sort((a, b) => b.completedAt! - a.completedAt! || b.createdAt - a.createdAt)
    .flatMap((session) => {
      const log = session.exercises.find((item) => item.exerciseId === exercise.exerciseId && item.loadType === exercise.loadType);
      return log ? [baseline(session, log)] : [];
    });
  return { version: 1, previous: matches[0] ?? null, earlier: matches[1] ?? null };
}

export function attachWorkoutCoaching(session: WorkoutSession, history: WorkoutSession[]): WorkoutSession {
  if (session.sessionType !== "workout" || session.entryMode === "previous") return session;
  return { ...session, exercises: session.exercises.map((exercise) => {
    if (exercise.coaching) return exercise;
    const coaching = coachingEvidence(exercise, history, session.userId, session.startedAt);
    const previous = history.find((item) => item.id === coaching.previous?.sessionId)?.exercises.find((item) => item.exerciseId === exercise.exerciseId);
    return { ...exercise, coaching, weightIncrementLbs: exercise.weightIncrementLbs ?? previous?.weightIncrementLbs ?? null };
  }) };
}

function knownStep(exercise: WorkoutExerciseLog) {
  const step = exercise.weightIncrementLbs;
  return typeof step === "number" && Number.isFinite(step) && step > 0 ? step : null;
}

/** Transparent, conservative suggestions; never changes the routine or the logged fields. */
export function exerciseTarget(exercise: WorkoutExerciseLog): ExerciseTarget {
  const count = exercise.sets.filter((set) => set.kind !== "warmup").length;
  const { min: reps, max: upperReps } = repRange(exercise);
  const hasRange = upperReps > reps;
  const previous = exercise.coaching?.previous;
  const valid = previous ? workingSets(previous) : [];
  const target: ExerciseTarget = { action: "baseline", label: "Build a baseline", focus: "Log your working sets to guide your next session.",
    why: "There are no comparable completed working sets yet. Choose a manageable load for your saved rep target; warm-ups and unchecked sets do not drive progression.",
    sets: Array.from({ length: count }, () => ({ weightLbs: null, reps })), needsWeightStep: false };
  if (!valid.length) return target;
  target.sets = Array.from({ length: count }, (_, index) => ({ weightLbs: exercise.loadType === "bodyweight" ? null : valid[index]?.weightLbs ?? null, reps: hasRange ? Math.min(upperReps, valid[index]?.reps ?? reps) : valid[index]?.reps ?? reps }));
  target.action = "repeat"; target.label = "Repeat your target";
  target.focus = "Keep the load steady and repeat your working sets.";
  target.why = "Start from your last completed working sets. These are suggestions, and your logged values stay yours to choose.";
  const full = previous!.sets.filter((set) => set.kind !== "warmup").length === valid.length && count === valid.length;
  if (!full) {
    target.focus = "Complete a comparable session before progressing.";
    target.why = "The previous session was partial, or the number of working sets changed. Missing sets are not treated as lost strength; new sets use your saved rep target without an invented load.";
    return target;
  }
  if (previous!.effort === "harder") {
    target.action = "ease"; target.label = "Ease back";
    target.focus = "Keep the load and aim for one fewer rep per set.";
    target.sets = target.sets.map((set) => ({ ...set, reps: Math.max(1, set.reps - 1) }));
    target.why = "You marked the last exercise Harder. This lowers the rep demand without guessing a different weight. Choose a different target if that feedback no longer reflects how the exercise feels.";
    return target;
  }
  const goalMet = valid.every((set) => set.reps! >= upperReps);
  const earlier = exercise.coaching?.earlier;
  const oldSets = earlier ? workingSets(earlier) : [];
  const repeatedGoal = oldSets.length === count && earlier!.sets.filter((set) => set.kind !== "warmup").length === count
    && oldSets.every((set, index) => set.reps! >= upperReps && set.weightLbs === valid[index].weightLbs);
  const consistentLoad = valid.every((set) => set.weightLbs === valid[0].weightLbs);
  const loadThreshold = Math.max(reps, upperReps - 1);
  const rangeReady = hasRange && consistentLoad && valid.every((set) => set.reps! >= loadThreshold);
  const progressLoad = hasRange ? rangeReady : goalMet && (previous!.effort === "easier" || repeatedGoal);
  if (progressLoad && exercise.loadType !== "bodyweight") {
    const step = knownStep(exercise);
    const sensibleStep = step !== null && valid.every((set) => set.weightLbs! > 0 && step / set.weightLbs! <= 0.1)
      && (exercise.loadType !== "assistance" || valid.every((set) => set.weightLbs! >= step));
    if (sensibleStep || step === null) {
      target.action = "weight"; target.label = exercise.loadType === "assistance" ? "Reduce assistance" : "Increase weight";
      target.needsWeightStep = step === null;
      target.focus = step === null ? "Set your available weight increment to see the next load." : `Try your next available ${exercise.loadType === "assistance" ? "assistance" : "weight"} at ${reps} reps.`;
      target.why = `${hasRange ? `All ${count} working sets reached at least ${loadThreshold} reps at the same load—within one rep of your ${upperReps}-rep maximum or higher. You’re ready for the next manageable step.` : previous!.effort === "easier" ? "You reached the top of your rep target on every working set and marked it Easier than expected." : "You reached the top of your rep target across all working sets at the same loads in two sessions."} ${step === null ? "No weight increment has been entered, so your previous loads remain visible until you choose one." : "The suggestion uses your entered weight increment; review the targets before following them."}`;
      if (step !== null) target.sets = target.sets.map((set) => ({ weightLbs: Math.round((set.weightLbs! + (exercise.loadType === "assistance" ? -step : step)) * 1000) / 1000, reps }));
      return target;
    }
  }
  if (hasRange && goalMet) {
    target.focus = exercise.loadType === "bodyweight" ? "Repeat the top of your rep range." : "Repeat the top of your rep range before increasing weight.";
    target.why = exercise.loadType === "bodyweight" ? "You reached your upper rep target. Keep this range, or adjust the routine when you want a new rep goal." : consistentLoad ? "You reached the upper rep target. Confirm it across all working sets; a known, manageable weight step is needed before raising the load." : "Your working loads differed. Establish the same load across working sets before using the rep range to increase weight.";
    return target;
  }
  if (!goalMet || previous!.effort === "easier" || progressLoad) {
    target.action = "reps"; target.label = "Build your reps";
    const index = valid.reduce((best, set, i) => set.reps! < valid[best].reps! ? i : best, 0);
    target.sets[index].reps = hasRange ? Math.min(upperReps, target.sets[index].reps + 1) : target.sets[index].reps + 1;
    target.focus = `Aim for one more rep on working set ${index + 1}.${hasRange ? ` Build toward ${upperReps} reps across all working sets before increasing weight.` : ""}`;
    target.why = progressLoad ? "Your available weight jump is large, or this is a bodyweight exercise. A small rep increase keeps the next step manageable." : "Keep the same loads and add one rep to your lowest-rep working set. This builds consistency without asking every set to beat a PR.";
    if (hasRange && consistentLoad && !rangeReady && exercise.loadType !== "bodyweight" && valid.every((set) => set.reps! >= Math.max(reps, upperReps - 2))) {
      target.label = exercise.loadType === "assistance" ? "Nearly ready to reduce assistance" : "Nearly ready to increase weight";
      target.focus = `You’re getting close to your ${upperReps}-rep maximum. Keep the load steady and aim for one more rep on working set ${index + 1}.`;
      target.why = `Once every working set reaches ${loadThreshold} reps or more at the same load, you’ll be ready for a manageable ${exercise.loadType === "assistance" ? "reduction in assistance" : "weight increase"}. A stronger set doesn’t cancel out a set below that threshold.`;
    }
  } else {
    target.focus = exercise.loadType === "bodyweight" ? "Repeat this performance before adding reps." : "Repeat this performance before increasing the load.";
    target.why = "You reached the saved rep target. Without easier-effort feedback or a second comparable session, the suggestion is to confirm that performance first.";
  }
  return target;
}

export function formatTargetSet(set: { weightLbs: number | null; reps: number | null }, loadType: WorkoutExerciseLog["loadType"]) {
  const load = loadType === "bodyweight" ? "BW" : set.weightLbs === null ? "Choose load" : `${loadType === "added_weight" ? "+" : ""}${set.weightLbs} lbs${loadType === "assistance" ? " assist" : ""}`;
  return `${load} × ${set.reps ?? "—"}`;
}

export function estimateWorkoutMinutes(workout: WorkoutDefinition, history: WorkoutSession[]) {
  const count = workout.exercises.reduce((sum, item) => sum + item.plannedSets, 0);
  const recent = history.filter((session) => session.workoutId === workout.id && session.userId === workout.userId && session.sessionType === "workout" && session.status === "completed" && session.durationSeconds! > 0)
    .slice().sort((a, b) => b.completedAt! - a.completedAt!)[0];
  const previousCount = recent?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  return Math.max(1, Math.round(recent && previousCount ? recent.durationSeconds! / 60 * count / previousCount : count * 2.5 + workout.exercises.length));
}

export interface ExerciseReview { exerciseId: string; name: string; outcome: "improved" | "consistent" | "baseline" | "adjust"; observation: string; next: string; nextWhy: string }
export function workoutReview(session: WorkoutSession): ExerciseReview[] {
  return session.exercises.filter((exercise) => exercise.sets.some((set) => set.weightLbs !== null || set.reps !== null)).map((exercise) => {
    const current = workingSets(exercise);
    const previous = exercise.coaching?.previous;
    const prior = previous ? workingSets(previous) : [];
    let outcome: ExerciseReview["outcome"] = "baseline";
    let observation = current.length ? "Your completed working sets establish a starting point." : "Your entries were saved. Complete working sets to make a performance comparison.";
    const comparable = current.length > 0 && current.length === prior.length && current.every((set, index) => set.weightLbs === prior[index].weightLbs)
      && exercise.sets.filter((set) => set.kind !== "warmup").length === current.length && previous!.sets.filter((set) => set.kind !== "warmup").length === prior.length;
    if (comparable) {
      const change = current.reduce((sum, set, index) => sum + set.reps! - prior[index].reps!, 0);
      const met = current.filter((set) => set.reps! >= exercise.plannedReps).length;
      const oldMet = prior.filter((set) => set.reps! >= exercise.plannedReps).length;
      outcome = change > 0 ? "improved" : change === 0 ? "consistent" : "adjust";
      observation = change > 0 ? `${change} more rep${change === 1 ? "" : "s"} across the same working sets and loads.${met > oldMet ? ` ${met} sets reached your rep target, up from ${oldMet}.` : ""}` : change === 0 ? "You matched your total reps across the same working sets and loads." : "Fewer reps at the same loads this time. One session does not establish a downward trend.";
    } else if (current.length && prior.length) {
      observation = "The loads or completed set count changed, so this is not a like-for-like comparison.";
      if (session.personalRecords.some((record) => record.exerciseId === exercise.exerciseId)) { outcome = "improved"; observation = "You set a new personal record. Other sets still guide your next target."; }
    }
    const nextExercise = { ...exercise, coaching: { version: 1 as const, previous: baseline(session, exercise), earlier: previous ?? null } };
    const next = exerciseTarget(nextExercise);
    return { exerciseId: exercise.exerciseId, name: exercise.exerciseNameSnapshot, outcome, observation, next: next.focus, nextWhy: next.why };
  });
}
