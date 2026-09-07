import type { WorkoutPersonalRecordEvent, WorkoutSession } from "@/lib/types";

type Performance = Pick<WorkoutPersonalRecordEvent, "weightLbs" | "reps">;

function beats(candidate: Performance, previous: Performance): boolean {
  return candidate.weightLbs > previous.weightLbs
    || (candidate.weightLbs === previous.weightLbs && (candidate.reps ?? 0) > (previous.reps ?? 0));
}

/** Rebuild from logs so legacy rep records, backdated entries, and deletions stay correct. */
export function withHistoricalPersonalRecords(sessions: WorkoutSession[]): WorkoutSession[] {
  const bestByExercise = new Map<string, Performance>();
  return sessions.slice().sort((a, b) =>
    (a.completedAt ?? a.createdAt) - (b.completedAt ?? b.createdAt)
    || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  ).map((session) => {
    const candidates = new Map<string, WorkoutPersonalRecordEvent>();
    if (session.status === "completed" && session.sessionType !== "activity" && session.sessionType !== "stretch") {
      for (const exercise of session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
        if (exercise.loadType === "bodyweight") continue;
        for (const set of exercise.sets) {
          const weight = set.weightLbs;
          if (!set.completed || typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) continue;
          const reps = typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps >= 0 ? set.reps : null;
          const performance = { weightLbs: weight, reps };
          const candidate = candidates.get(exercise.exerciseId);
          // Weight comes first, then reps. Exact ties keep the first matching set.
          if (!candidate || beats(performance, candidate)) {
            candidates.set(exercise.exerciseId, {
              exerciseId: exercise.exerciseId,
              exerciseNameSnapshot: exercise.exerciseNameSnapshot,
              ...performance,
              previousBestWeightLbs: null,
              previousBestReps: null,
              setIds: [set.id],
            });
          }
        }
      }
    }
    const personalRecords: WorkoutPersonalRecordEvent[] = [];
    for (const candidate of candidates.values()) {
      const key = JSON.stringify([session.userId, candidate.exerciseId]);
      const previous = bestByExercise.get(key);
      if (previous && !beats(candidate, previous)) continue;
      bestByExercise.set(key, candidate);
      personalRecords.push({ ...candidate, previousBestWeightLbs: previous?.weightLbs ?? null, previousBestReps: previous?.reps ?? null });
    }
    return { ...session, personalRecords };
  }).reverse();
}
