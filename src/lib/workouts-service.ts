import { db } from "@/lib/firebase";
import { ActivityDefinition, ActivityIntensity, WorkoutDefinition, WorkoutPersonalRecordEvent, WorkoutSession } from "@/lib/types";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";
import { ExerciseDefinition } from "@/lib/types";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, runTransaction, setDoc, where } from "firebase/firestore";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const exerciseCatalogue = exerciseCatalogueJson as ExerciseDefinition[];

function localDateString(time: number): string {
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createWorkoutId(): string {
  return generateId();
}

export function createWorkoutSession(userId: string, workout: WorkoutDefinition): WorkoutSession {
  const now = Date.now();
  return {
    id: generateId(),
    userId,
    sessionType: "workout",
    workoutId: workout.id,
    workoutNameSnapshot: workout.name,
    startedAt: now,
    completedAt: null,
    durationSeconds: null,
    completedDate: null,
    status: "active",
    personalRecords: [],
    exercises: workout.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).flatMap((plan) => {
      const exercise = exerciseCatalogue.find((item) => item.id === plan.exerciseId);
      if (!exercise) return [];
      return [{
        exerciseId: exercise.id,
        exerciseNameSnapshot: exercise.name,
        loadType: exercise.loadType,
        restSeconds: exercise.restSeconds,
        sortOrder: plan.sortOrder,
        plannedSets: plan.plannedSets,
        plannedReps: plan.plannedReps,
        sets: Array.from({ length: plan.plannedSets }, () => ({ id: generateId(), weightLbs: null, reps: null, completed: false })),
      }];
    }),
    createdAt: now,
    updatedAt: now,
  };
}

/** Starts a cloud-backed activity session in the same history stream as workouts. */
export function createActivitySession(userId: string, activity: ActivityDefinition): WorkoutSession {
  const now = Date.now();
  return {
    id: generateId(),
    userId,
    sessionType: "activity",
    // Keep the existing field populated for backwards-compatible shared storage.
    workoutId: activity.id,
    workoutNameSnapshot: activity.name,
    activityId: activity.id,
    activityCategorySnapshot: activity.category,
    activityIconSnapshot: activity.icon,
    activityDescriptionSnapshot: activity.description,
    activityIntensity: null,
    startedAt: now,
    completedAt: null,
    durationSeconds: null,
    completedDate: null,
    status: "active",
    personalRecords: [],
    exercises: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function completeWorkoutSession(session: WorkoutSession): WorkoutSession {
  const now = Date.now();
  return { ...session, status: "completed", completedAt: now, durationSeconds: Math.max(0, Math.floor((now - session.startedAt) / 1000)), completedDate: localDateString(now), updatedAt: now };
}

/** Finishes an activity only after the user has selected how the effort felt. */
export function completeActivitySession(session: WorkoutSession, activityIntensity: ActivityIntensity): WorkoutSession {
  const now = Date.now();
  return {
    ...session,
    sessionType: "activity",
    activityIntensity,
    status: "completed",
    completedAt: now,
    durationSeconds: Math.max(0, Math.floor((now - session.startedAt) / 1000)),
    completedDate: localDateString(now),
    updatedAt: now,
  };
}

/** Completes a session and atomically records new per-exercise rep PRs. */
export async function completeWorkoutSessionWithPersonalRecords(session: WorkoutSession): Promise<WorkoutSession> {
  if (session.sessionType === "activity") return completeActivitySession(session, session.activityIntensity ?? "steady");
  const completed = completeWorkoutSession(session);
  const candidates = completed.exercises.flatMap((exercise) => {
    const reps = Math.max(...exercise.sets.filter((set) => set.completed && typeof set.reps === "number").map((set) => set.reps ?? 0), 0);
    return reps > 0 ? [{
      exerciseId: exercise.exerciseId,
      exerciseNameSnapshot: exercise.exerciseNameSnapshot,
      reps,
      setIds: exercise.sets
        .filter((set) => set.completed && set.reps === reps)
        .map((set) => set.id),
    }] : [];
  });

  return runTransaction(db, async (transaction) => {
    const recordRefs = candidates.map((candidate) => doc(db, "workout_personal_records", `${completed.userId}_${candidate.exerciseId}`));
    const recordSnapshots = await Promise.all(recordRefs.map((recordRef) => transaction.get(recordRef)));
    const personalRecords: WorkoutPersonalRecordEvent[] = [];

    candidates.forEach((candidate, index) => {
      const existing = recordSnapshots[index].data();
      const previousBestReps = typeof existing?.bestReps === "number" ? existing.bestReps : null;
      if (previousBestReps === null || candidate.reps > previousBestReps) {
        personalRecords.push({ ...candidate, previousBestReps });
        transaction.set(recordRefs[index], {
          id: recordRefs[index].id,
          userId: completed.userId,
          exerciseId: candidate.exerciseId,
          exerciseNameSnapshot: candidate.exerciseNameSnapshot,
          bestReps: candidate.reps,
          updatedAt: completed.completedAt,
          sourceSessionId: completed.id,
        }, { merge: true });
      }
    });

    const finishedSession: WorkoutSession = { ...completed, personalRecords };
    transaction.set(doc(db, "workout_sessions", finishedSession.id), finishedSession);
    return finishedSession;
  });
}

function workoutFromFirestore(data: Record<string, unknown>): WorkoutDefinition {
  return {
    id: (data.id as string) ?? "", userId: (data.userId as string) ?? "", name: (data.name as string) ?? "", description: (data.description as string) ?? "",
    scheduledDays: Array.isArray(data.scheduledDays) ? data.scheduledDays.map(Number) as WorkoutDefinition["scheduledDays"] : [],
    exercises: Array.isArray(data.exercises) ? data.exercises as WorkoutDefinition["exercises"] : [],
    sortOrder: Number(data.sortOrder ?? 0), createdAt: Number(data.createdAt ?? 0), updatedAt: Number(data.updatedAt ?? 0),
  };
}

function sessionFromFirestore(data: Record<string, unknown>): WorkoutSession {
  const activityIntensity = data.activityIntensity;
  return {
    id: (data.id as string) ?? "", userId: (data.userId as string) ?? "", sessionType: data.sessionType === "activity" ? "activity" : "workout", workoutId: (data.workoutId as string) ?? "", workoutNameSnapshot: (data.workoutNameSnapshot as string) ?? "",
    activityId: typeof data.activityId === "string" ? data.activityId : undefined,
    activityCategorySnapshot: typeof data.activityCategorySnapshot === "string" ? data.activityCategorySnapshot : undefined,
    activityIconSnapshot: typeof data.activityIconSnapshot === "string" ? data.activityIconSnapshot : undefined,
    activityDescriptionSnapshot: typeof data.activityDescriptionSnapshot === "string" ? data.activityDescriptionSnapshot : undefined,
    activityIntensity: activityIntensity === "easy" || activityIntensity === "steady" || activityIntensity === "hard" || activityIntensity === "all_out" ? activityIntensity : null,
    startedAt: Number(data.startedAt ?? 0), completedAt: typeof data.completedAt === "number" ? data.completedAt : null, durationSeconds: typeof data.durationSeconds === "number" ? data.durationSeconds : null, completedDate: typeof data.completedDate === "string" ? data.completedDate : null,
    status: data.status === "completed" || data.status === "abandoned" ? data.status : "active",
    personalRecords: Array.isArray(data.personalRecords) ? data.personalRecords as WorkoutSession["personalRecords"] : [],
    exercises: Array.isArray(data.exercises) ? (data.exercises as WorkoutSession["exercises"]).map((exercise) => ({ ...exercise, loadType: exercise.loadType ?? "external_weight", restSeconds: exercise.restSeconds ?? exerciseCatalogue.find((catalogueExercise) => catalogueExercise.id === exercise.exerciseId)?.restSeconds ?? 90 })) : [],
    createdAt: Number(data.createdAt ?? 0), updatedAt: Number(data.updatedAt ?? 0),
  };
}

export function subscribeToWorkouts(userId: string, callback: (workouts: WorkoutDefinition[]) => void): () => void {
  return onSnapshot(query(collection(db, "workouts"), where("userId", "==", userId)), (snapshot) => {
    callback(snapshot.docs.map((snapshotDoc) => workoutFromFirestore(snapshotDoc.data())).sort((a, b) => a.sortOrder - b.sortOrder));
  }, (error) => { console.error("subscribeToWorkouts error:", error); callback([]); });
}

export function subscribeToActiveWorkoutSession(userId: string, callback: (session: WorkoutSession | null) => void): () => void {
  return onSnapshot(query(collection(db, "workout_sessions"), where("userId", "==", userId), where("status", "==", "active")), (snapshot) => {
    callback(snapshot.docs.map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data())).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null);
  }, (error) => { console.error("subscribeToActiveWorkoutSession error:", error); callback(null); });
}

export function subscribeToCompletedWorkoutSessions(userId: string, callback: (sessions: WorkoutSession[]) => void): () => void {
  return onSnapshot(query(collection(db, "workout_sessions"), where("userId", "==", userId)), (snapshot) => {
    callback(snapshot.docs
      .map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data()))
      .filter((session) => session.status === "completed" && session.completedAt !== null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)));
  }, (error) => { console.error("subscribeToCompletedWorkoutSessions error:", error); callback([]); });
}

/** Returns the newest completed instance of this exact workout template. */
export async function getMostRecentCompletedWorkoutSession(userId: string, workoutId: string): Promise<WorkoutSession | null> {
  const snapshot = await getDocs(query(collection(db, "workout_sessions"), where("userId", "==", userId)));
  return snapshot.docs
    .map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data()))
    .filter((session) => session.workoutId === workoutId && session.status === "completed" && session.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null;
}

export async function saveWorkout(workout: WorkoutDefinition): Promise<void> {
  await setDoc(doc(db, "workouts", workout.id), workout);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await deleteDoc(doc(db, "workouts", workoutId));
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  await setDoc(doc(db, "workout_sessions", session.id), session);
}

export async function deleteWorkoutSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, "workout_sessions", sessionId));
}

/** Deletes a finished log and rebuilds PR baselines for its affected exercises. */
export async function deleteCompletedWorkoutSession(session: WorkoutSession): Promise<void> {
  const affectedExercises = session.exercises.map((exercise) => ({ id: exercise.exerciseId, name: exercise.exerciseNameSnapshot }));
  await deleteDoc(doc(db, "workout_sessions", session.id));

  const remainingSessions = (await getDocs(query(collection(db, "workout_sessions"), where("userId", "==", session.userId)))).docs
    .map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data()))
    .filter((item) => item.status === "completed");

  await Promise.all(affectedExercises.map(async (exercise) => {
    const bestReps = Math.max(...remainingSessions.flatMap((item) => item.exercises
      .filter((loggedExercise) => loggedExercise.exerciseId === exercise.id)
      .flatMap((loggedExercise) => loggedExercise.sets)
      .filter((set) => set.completed && typeof set.reps === "number")
      .map((set) => set.reps ?? 0)), 0);
    const recordRef = doc(db, "workout_personal_records", `${session.userId}_${exercise.id}`);
    if (bestReps > 0) {
      await setDoc(recordRef, { id: recordRef.id, userId: session.userId, exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, bestReps, updatedAt: Date.now() }, { merge: true });
    } else {
      // A historical log may predate the PR document entirely. Writing a zero
      // baseline handles both create and update safely; deleting a document
      // that never existed is rejected by our owner-only Firestore rule.
      await setDoc(recordRef, { id: recordRef.id, userId: session.userId, exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, bestReps: 0, updatedAt: Date.now() }, { merge: true });
    }
  }));
}

/** Deletes either kind of completed training record from the shared history. */
export async function deleteCompletedSession(session: WorkoutSession): Promise<void> {
  if (session.sessionType === "activity") {
    await deleteDoc(doc(db, "workout_sessions", session.id));
    return;
  }
  await deleteCompletedWorkoutSession(session);
}
