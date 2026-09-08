import { validRepRange } from "@/lib/workout-rep-range";
import { db } from "@/lib/firebase";
import { ActivityDefinition, ActivityIntensity, StretchRoutineDefinition, WorkoutDefinition, WorkoutExerciseLog, WorkoutSession } from "@/lib/types";
import { normalizeWorkoutTimes, normalizeWorkoutTimeOverrides } from "@/lib/workout-schedule";
import exerciseCatalogueJson from "@/data/exercise-catalogue.json";
import { ExerciseDefinition } from "@/lib/types";
import stretchCatalogueJson from "@/data/stretching-catalogue.json";
import { StretchDefinition } from "@/lib/types";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { asPreviousSession, hasValidPreviousWorkoutTiming, hasWorkoutData } from "@/lib/workout-session";
import { withHistoricalPersonalRecords } from "@/lib/workout-personal-records";
import { attachWorkoutCoaching } from "@/lib/workout-coaching";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const exerciseCatalogue = exerciseCatalogueJson as ExerciseDefinition[];
const stretchCatalogue = stretchCatalogueJson as StretchDefinition[];

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

export { createWorkoutSession } from "@/lib/workout-session";

/** Starts a cloud-backed activity session in the same history stream as workouts. */
export function createActivitySession(userId: string, activity: ActivityDefinition, previous = false): WorkoutSession {
  const now = Date.now();
  const session: WorkoutSession = {
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
  return previous ? asPreviousSession(session) : session;
}

/** Starts a simple, untimed stretching session from a saved routine. */
export function createStretchRoutineSession(userId: string, routine?: StretchRoutineDefinition, previous = false): WorkoutSession {
  const now = Date.now();
  const id = generateId();
  const session: WorkoutSession = {
    id, userId, sessionType: "stretch", workoutId: routine?.id ?? `blank-stretch-${id}`, workoutNameSnapshot: routine?.name ?? "Freestyle stretching",
    stretchRoutineId: routine?.id ?? `blank-stretch-${id}`, stretchRoutineDescriptionSnapshot: routine?.description ?? "",
    stretches: (routine?.stretches ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).flatMap((plan) => {
      const stretch = stretchCatalogue.find((item) => item.id === plan.stretchId);
      return stretch ? [{ stretchId: stretch.id, stretchNameSnapshot: stretch.name, summarySnapshot: stretch.summary, instructionsSnapshot: stretch.instructions, holdSeconds: plan.holdSeconds, sortOrder: plan.sortOrder }] : [];
    }),
    startedAt: now, completedAt: null, durationSeconds: null, completedDate: null, status: "active", personalRecords: [], exercises: [], createdAt: now, updatedAt: now,
  };
  return previous ? asPreviousSession(session) : session;
}

export function completeWorkoutSession(session: WorkoutSession): WorkoutSession {
  if (session.sessionType === "stretch" && !(session.stretches ?? []).some((stretch) => Number.isFinite(stretch.holdSeconds) && stretch.holdSeconds > 0)) {
    throw new Error("Add at least one stretch before finishing.");
  }
  if (session.sessionType !== "activity" && session.sessionType !== "stretch" && !hasWorkoutData(session)) {
    throw new Error("Log weight or reps for at least one set before finishing.");
  }
  const now = Date.now();
  if (session.entryMode === "previous") {
    if (!hasValidPreviousWorkoutTiming(session)) throw new Error("Set the workout date and duration before saving.");
    const completedAt = session.performedAt!;
    const durationSeconds = session.durationSeconds!;
    return { ...session, status: "completed", startedAt: completedAt - durationSeconds * 1000, completedAt, durationSeconds, completedDate: localDateString(completedAt), updatedAt: now };
  }
  return { ...session, status: "completed", completedAt: now, durationSeconds: Math.max(0, Math.floor((now - session.startedAt) / 1000)), completedDate: localDateString(now), updatedAt: now };
}

/** Finishes an activity only after the user has selected how the effort felt. */
export function completeActivitySession(session: WorkoutSession, activityIntensity: ActivityIntensity): WorkoutSession {
  return completeWorkoutSession({ ...session, sessionType: "activity", activityIntensity });
}

/** Saves weight PRs using the same historical calculation as the history screen. */
export async function completeWorkoutSessionWithPersonalRecords(session: WorkoutSession): Promise<WorkoutSession> {
  if (session.sessionType === "activity") return completeActivitySession(session, session.activityIntensity ?? "steady");
  const completed = completeWorkoutSession(session);
  const snapshot = await getDocs(query(collection(db, "workout_sessions"), where("userId", "==", completed.userId)));
  const history = snapshot.docs.map((item) => sessionFromFirestore(item.data()))
    .filter((item) => item.id !== completed.id && item.status === "completed" && item.completedAt !== null);
  const finishedSession = withHistoricalPersonalRecords([...history, attachWorkoutCoaching(completed, history)]).find((item) => item.id === completed.id)!;
  await saveWorkoutSession(finishedSession);
  return finishedSession;
}

function workoutFromFirestore(data: Record<string, unknown>): WorkoutDefinition {
  return {
    id: (data.id as string) ?? "", userId: (data.userId as string) ?? "", name: (data.name as string) ?? "", description: (data.description as string) ?? "",
    scheduledDays: Array.isArray(data.scheduledDays) ? data.scheduledDays.map(Number) as WorkoutDefinition["scheduledDays"] : [],
    scheduledStartTimes: normalizeWorkoutTimes(Array.isArray(data.scheduledDays) ? data.scheduledDays as WorkoutDefinition["scheduledDays"] : [], data.scheduledStartTimes),
    scheduledTimeOverrides: normalizeWorkoutTimeOverrides(data.scheduledTimeOverrides),
    exercises: Array.isArray(data.exercises) ? data.exercises as WorkoutDefinition["exercises"] : [],
    sortOrder: Number(data.sortOrder ?? 0), createdAt: Number(data.createdAt ?? 0), updatedAt: Number(data.updatedAt ?? 0),
  };
}

function stretchRoutineFromFirestore(data: Record<string, unknown>): StretchRoutineDefinition {
  return {
    id: (data.id as string) ?? "", userId: (data.userId as string) ?? "", name: (data.name as string) ?? "", description: (data.description as string) ?? "",
    scheduledDays: Array.isArray(data.scheduledDays) ? data.scheduledDays.map(Number) as StretchRoutineDefinition["scheduledDays"] : [],
    stretches: Array.isArray(data.stretches) ? data.stretches as StretchRoutineDefinition["stretches"] : [],
    sortOrder: Number(data.sortOrder ?? 0), createdAt: Number(data.createdAt ?? 0), updatedAt: Number(data.updatedAt ?? 0),
  };
}

/** Firestore rejects explicit undefined values; null still means an empty log field. */
function definedSessionFields(session: WorkoutSession): WorkoutSession {
  return Object.fromEntries(Object.entries(session).filter(([, value]) => value !== undefined)) as WorkoutSession;
}

function sessionFromFirestore(data: Record<string, unknown>): WorkoutSession {
  const activityIntensity = data.activityIntensity;
  return definedSessionFields({
    id: (data.id as string) ?? "", userId: (data.userId as string) ?? "", sessionType: data.sessionType === "activity" || data.sessionType === "stretch" ? data.sessionType : "workout", workoutId: (data.workoutId as string) ?? "", workoutNameSnapshot: (data.workoutNameSnapshot as string) ?? "",
    repeatPreviousExercises: Array.isArray(data.repeatPreviousExercises) ? data.repeatPreviousExercises as WorkoutSession["repeatPreviousExercises"] : undefined,
    adjustedFromSetCount: typeof data.adjustedFromSetCount === "number" ? data.adjustedFromSetCount : undefined,
    entryMode: data.entryMode === "previous" ? "previous" : undefined,
    performedAt: typeof data.performedAt === "number" ? data.performedAt : undefined,
    activityId: typeof data.activityId === "string" ? data.activityId : undefined,
    activityCategorySnapshot: typeof data.activityCategorySnapshot === "string" ? data.activityCategorySnapshot : undefined,
    activityIconSnapshot: typeof data.activityIconSnapshot === "string" ? data.activityIconSnapshot : undefined,
    activityDescriptionSnapshot: typeof data.activityDescriptionSnapshot === "string" ? data.activityDescriptionSnapshot : undefined,
    activityIntensity: activityIntensity === "easy" || activityIntensity === "steady" || activityIntensity === "hard" || activityIntensity === "all_out" ? activityIntensity : null,
    stretchRoutineId: typeof data.stretchRoutineId === "string" ? data.stretchRoutineId : undefined,
    stretchRoutineDescriptionSnapshot: typeof data.stretchRoutineDescriptionSnapshot === "string" ? data.stretchRoutineDescriptionSnapshot : undefined,
    stretches: Array.isArray(data.stretches) ? data.stretches as WorkoutSession["stretches"] : [],
    startedAt: Number(data.startedAt ?? 0), completedAt: typeof data.completedAt === "number" ? data.completedAt : null, durationSeconds: typeof data.durationSeconds === "number" ? data.durationSeconds : null, completedDate: typeof data.completedDate === "string" ? data.completedDate : null,
    status: data.status === "completed" || data.status === "abandoned" ? data.status : "active",
    personalRecords: Array.isArray(data.personalRecords) ? data.personalRecords as WorkoutSession["personalRecords"] : [],
    exercises: Array.isArray(data.exercises) ? (data.exercises as WorkoutSession["exercises"]).map((exercise) => ({ ...exercise, loadType: exercise.loadType ?? "external_weight", restSeconds: exercise.restSeconds ?? exerciseCatalogue.find((catalogueExercise) => catalogueExercise.id === exercise.exerciseId)?.restSeconds ?? 90 })) : [],
    createdAt: Number(data.createdAt ?? 0), updatedAt: Number(data.updatedAt ?? 0),
  });
}

export function subscribeToWorkouts(userId: string, callback: (workouts: WorkoutDefinition[]) => void, onError?: () => void): () => void {
  return onSnapshot(query(collection(db, "workouts"), where("userId", "==", userId)), (snapshot) => {
    callback(snapshot.docs.map((snapshotDoc) => workoutFromFirestore(snapshotDoc.data())).sort((a, b) => a.sortOrder - b.sortOrder));
  }, (error) => { console.error("subscribeToWorkouts error:", error); if (onError) onError(); else callback([]); });
}

export function subscribeToStretchRoutines(userId: string, callback: (routines: StretchRoutineDefinition[]) => void, onError?: () => void): () => void {
  return onSnapshot(query(collection(db, "stretch_routines"), where("userId", "==", userId)), (snapshot) => {
    callback(snapshot.docs.map((snapshotDoc) => stretchRoutineFromFirestore(snapshotDoc.data())).sort((a, b) => a.sortOrder - b.sortOrder));
  }, (error) => { console.error("subscribeToStretchRoutines error:", error); if (onError) onError(); else callback([]); });
}

export function subscribeToActiveWorkoutSession(userId: string, callback: (session: WorkoutSession | null) => void, onError?: () => void): () => void {
  return onSnapshot(query(collection(db, "workout_sessions"), where("userId", "==", userId), where("status", "==", "active")), (snapshot) => {
    callback(snapshot.docs.map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data())).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null);
  }, (error) => { console.error("subscribeToActiveWorkoutSession error:", error); if (onError) onError(); else callback(null); });
}

export function subscribeToCompletedWorkoutSessions(userId: string, callback: (sessions: WorkoutSession[]) => void, onError?: () => void): () => void {
  return onSnapshot(query(collection(db, "workout_sessions"), where("userId", "==", userId)), (snapshot) => {
    callback(withHistoricalPersonalRecords(snapshot.docs
      .map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data()))
      .filter((session) => session.status === "completed" && session.completedAt !== null)));
  }, (error) => { console.error("subscribeToCompletedWorkoutSessions error:", error); if (onError) onError(); else callback([]); });
}

/** Returns the newest completed instance of this exact workout template. */
export async function getMostRecentCompletedWorkoutSession(userId: string, workoutId: string): Promise<WorkoutSession | null> {
  const snapshot = await getDocs(query(collection(db, "workout_sessions"), where("userId", "==", userId)));
  return snapshot.docs
    .map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data()))
    .filter((session) => session.workoutId === workoutId && session.status === "completed" && session.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null;
}

/** Returns each exercise's log from the latest completed workout containing it. */
export async function getMostRecentCompletedExerciseLogs(userId: string): Promise<Record<string, WorkoutExerciseLog>> {
  const snapshot = await getDocs(query(collection(db, "workout_sessions"), where("userId", "==", userId)));
  const sessions = snapshot.docs
    .map((snapshotDoc) => sessionFromFirestore(snapshotDoc.data()))
    .filter((session) => session.sessionType === "workout" && session.status === "completed" && session.completedAt !== null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const latestByExercise: Record<string, WorkoutExerciseLog> = {};
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (!latestByExercise[exercise.exerciseId]) latestByExercise[exercise.exerciseId] = exercise;
    }
  }
  return latestByExercise;
}

export async function getWorkoutCoachingHistory(userId: string): Promise<WorkoutSession[]> {
  const snapshot = await getDocs(query(collection(db, "workout_sessions"), where("userId", "==", userId)));
  return snapshot.docs.map((item) => sessionFromFirestore(item.data()))
    .filter((session) => session.sessionType === "workout" && session.status === "completed" && session.completedAt !== null);
}

export async function saveWorkout(workout: WorkoutDefinition): Promise<void> {
  if (workout.exercises.some((plan) => !validRepRange(plan))) throw new Error("Enter a valid rep range. Maximum reps must be at least minimum reps.");
  await setDoc(doc(db, "workouts", workout.id), { ...workout, scheduledStartTimes: normalizeWorkoutTimes(workout.scheduledDays, workout.scheduledStartTimes) });
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await deleteDoc(doc(db, "workouts", workoutId));
}

export async function saveStretchRoutine(routine: StretchRoutineDefinition): Promise<void> {
  await setDoc(doc(db, "stretch_routines", routine.id), routine);
}

/** Removes a saved stretch template without affecting completed routine history. */
export async function deleteStretchRoutine(routineId: string): Promise<void> {
  await deleteDoc(doc(db, "stretch_routines", routineId));
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  await setDoc(doc(db, "workout_sessions", session.id), definedSessionFields(session));
}

export async function deleteWorkoutSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, "workout_sessions", sessionId));
}

/** History subscribers rebuild weight PRs from the remaining logs after deletion. */
export async function deleteCompletedWorkoutSession(session: WorkoutSession): Promise<void> {
  await deleteDoc(doc(db, "workout_sessions", session.id));
}

/** Deletes either kind of completed training record from the shared history. */
export async function deleteCompletedSession(session: WorkoutSession): Promise<void> {
  if (session.sessionType === "activity" || session.sessionType === "stretch") {
    await deleteDoc(doc(db, "workout_sessions", session.id));
    return;
  }
  await deleteCompletedWorkoutSession(session);
}
