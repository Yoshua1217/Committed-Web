"use client";

import { useEffect, useRef, useState } from "react";
import CreateWorkoutModal from "@/components/create-workout-modal";
import StartTrainingModal from "@/components/start-training-modal";
import CreateStretchRoutineModal from "@/components/create-stretch-routine-modal";
import CreateTrainingModal from "@/components/create-training-modal";
import WorkoutPreviewModal from "@/components/workout-preview-modal";
import StretchRoutinePreviewModal from "@/components/stretch-routine-preview-modal";
import ActiveStretchRoutineScreen from "@/components/active-stretch-routine-screen";
import ActiveWorkoutScreen from "@/components/active-workout-screen";
import ActiveActivityScreen from "@/components/active-activity-screen";
import TrainingDashboard from "@/components/training-dashboard";
import { useToday } from "@/lib/use-today";
import type { TrainingSection } from "@/lib/training-dashboard";
import CompletedWorkoutDetailModal from "@/components/completed-workout-detail-modal";
import CompletedActivityDetailModal from "@/components/completed-activity-detail-modal";
import CompletedStretchRoutineDetailModal from "@/components/completed-stretch-routine-detail-modal";
import WorkoutCompletionSummary from "@/components/workout-completion-summary";
import ScheduleCheckInModal from "@/components/schedule-checkin-modal";
import { useAuth } from "@/lib/auth-context";
import { ActivityDefinition, ActivityIntensity, ScheduledCheckIn, StretchRoutineDefinition, WorkoutDefinition, WorkoutSession } from "@/lib/types";
import { completeActivitySession, completeWorkoutSession, completeWorkoutSessionWithPersonalRecords, createActivitySession, createStretchRoutineSession, createWorkoutSession, deleteCompletedSession, deleteWorkout, deleteWorkoutSession, saveStretchRoutine, saveWorkout, saveWorkoutSession, subscribeToActiveWorkoutSession, subscribeToCompletedWorkoutSessions, subscribeToStretchRoutines, subscribeToWorkouts } from "@/lib/workouts-service";
import { getSettings } from "@/lib/settings-service";
import { markHabitComplete } from "@/lib/habits-service";
import { scheduleStretchRoutineCheckIn, subscribeToScheduledCheckIns } from "@/lib/scheduled-checkins-service";
import { withHistoricalPersonalRecords } from "@/lib/workout-personal-records";
import { createPreviousWorkoutSession, createRepeatedTrainingSession } from "@/lib/workout-session";
import { attachWorkoutCoaching } from "@/lib/workout-coaching";

export default function WorkoutsPage() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutDefinition[]>([]);
  const [stretchRoutines, setStretchRoutines] = useState<StretchRoutineDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [logPreviousOpen, setLogPreviousOpen] = useState(false);
  const startingWorkout = useRef(false);
  const [createWorkoutOpen, setCreateWorkoutOpen] = useState(false);
  const [createStretchOpen, setCreateStretchOpen] = useState(false);
  const [startKind, setStartKind] = useState<"type" | "workout">("type");
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState({ workouts: false, routines: false, history: false });
  const [retry, setRetry] = useState(0);
  const [previewWorkout, setPreviewWorkout] = useState<WorkoutDefinition | null>(null);
  const [previewStretchRoutine, setPreviewStretchRoutine] = useState<StretchRoutineDefinition | null>(null);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [activeSessionReady, setActiveSessionReady] = useState(false);
  const [activeSessionError, setActiveSessionError] = useState(false);
  const [section, setSection] = useState<TrainingSection>("train");
  const [completedSessions, setCompletedSessions] = useState<WorkoutSession[]>([]);
  const [selectedHistorySession, setHistorySession] = useState<WorkoutSession | null>(null);
  const [completionSession, setCompletionSession] = useState<WorkoutSession | null>(null);
  const [scheduledCheckIns, setScheduledCheckIns] = useState<ScheduledCheckIn[]>([]);
  const [routineToSchedule, setRoutineToSchedule] = useState<StretchRoutineDefinition | null>(null);
  const today = useToday();
  const historySession = completedSessions.find((session) => session.id === selectedHistorySession?.id) ?? selectedHistorySession;

  useEffect(() => {
    if (!user) return;
    return subscribeToWorkouts(user.uid, (nextWorkouts) => {
      setWorkouts(nextWorkouts);
      setLoading(false);
      setLoadErrors((errors) => ({ ...errors, workouts: false }));
    }, () => { setLoading(false); setLoadErrors((errors) => ({ ...errors, workouts: true })); });
  }, [user, retry]);

  useEffect(() => {
    if (!user) return;
    return subscribeToStretchRoutines(user.uid, (routines) => { setStretchRoutines(routines); setRoutinesLoading(false); setLoadErrors((errors) => ({ ...errors, routines: false })); }, () => { setRoutinesLoading(false); setLoadErrors((errors) => ({ ...errors, routines: true })); });
  }, [user, retry]);

  useEffect(() => {
    if (!user) return;
    return subscribeToCompletedWorkoutSessions(user.uid, (sessions) => { setCompletedSessions(sessions); setHistoryLoading(false); setLoadErrors((errors) => ({ ...errors, history: false })); }, () => { setHistoryLoading(false); setLoadErrors((errors) => ({ ...errors, history: true })); });
  }, [user, retry]);

  useEffect(() => {
    if (!user) return;
    return subscribeToActiveWorkoutSession(user.uid, (session) => {
      // Firestore emits local drafts before their write is acknowledged. The
      // start handlers open them only after saveWorkoutSession succeeds.
      if (!startingWorkout.current) setActiveSession(session);
      setActiveSessionReady(true);
      setActiveSessionError(false);
    }, () => { setActiveSessionReady(false); setActiveSessionError(true); });
  }, [user, retry]);

  useEffect(() => {
    if (!user) return;
    return subscribeToScheduledCheckIns(user.uid, setScheduledCheckIns);
  }, [user]);

  async function startWorkout(workout?: WorkoutDefinition, previous = false, increments: Record<string, number> = {}) {
    if (!user) return;
    if (!activeSessionReady) throw new Error("Please wait for your active session to load.");
    if (activeSession) {
      setPreviewWorkout(null);
      setStartOpen(false);
      setLogPreviousOpen(false);
      return;
    }
    if (startingWorkout.current) return;
    startingWorkout.current = true;
    try {
      const draft = previous ? createPreviousWorkoutSession(user.uid, workout) : createWorkoutSession(user.uid, workout);
      const session = !previous && !historyLoading && !loadErrors.history ? attachWorkoutCoaching(draft, completedSessions) : draft;
      session.exercises = session.exercises.map((exercise) => increments[exercise.exerciseId] ? { ...exercise, weightIncrementLbs: increments[exercise.exerciseId] } : exercise);
      const savedSetCount = workouts.find((item) => item.id === workout?.id)?.exercises.reduce((sum, exercise) => sum + exercise.plannedSets, 0);
      if (!previous && savedSetCount && savedSetCount > session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)) session.adjustedFromSetCount = savedSetCount;
      await saveWorkoutSession(session);
      setPreviewWorkout(null);
      setStartOpen(false);
      setLogPreviousOpen(false);
      setActiveSession(session);
    } finally {
      startingWorkout.current = false;
    }
  }

  async function finishWorkout(session: WorkoutSession) {
    const completed = await completeWorkoutSessionWithPersonalRecords(session);
    if (session.entryMode === "previous") {
      setActiveSession(null);
      setSection("history");
      setHistorySession(withHistoricalPersonalRecords([...completedSessions.filter((item) => item.id !== completed.id), completed]).find((item) => item.id === completed.id) ?? completed);
      return;
    }
    await applyHabitMapping(completed, "workout");
    setActiveSession(null);
    setCompletionSession(completed);
  }

  async function startActivity(activity: ActivityDefinition, previous = false) {
    if (!activeSessionReady) throw new Error("Please wait for your active session to load.");
    if (!user || activeSession || startingWorkout.current) return;
    startingWorkout.current = true;
    try {
      const session = createActivitySession(user.uid, activity, previous);
      await saveWorkoutSession(session);
      setStartOpen(false); setLogPreviousOpen(false);
      setActiveSession(session);
    } finally { startingWorkout.current = false; }
  }

  async function finishActivity(session: WorkoutSession, intensity: ActivityIntensity) {
    const completed = completeActivitySession(session, intensity);
    await saveWorkoutSession(completed);
    if (session.entryMode !== "previous") await applyHabitMapping(completed, "workout");
    setActiveSession(null);
    setSection("history");
    setHistorySession(completed);
  }

  async function applyHabitMapping(session: WorkoutSession, type: "workout" | "stretch") {
    if (!user || !session.completedDate) return;
    try {
      const settings = await getSettings(user.uid);
      const enabled = type === "workout" ? settings.workoutHabitMappingEnabled : settings.stretchHabitMappingEnabled;
      const habitId = type === "workout" ? settings.workoutHabitMappingHabitId : settings.stretchHabitMappingHabitId;
      if (enabled && habitId) {
        await markHabitComplete(user.uid, habitId, session.completedDate);
      }
    } catch (error) {
      // The training session is already saved, so a transient mapping error must
      // not make the user repeat their workout or activity.
      console.error(`Failed to mark the mapped ${type} habit complete:`, error);
    }
  }

  async function createStretchRoutine(routine: StretchRoutineDefinition) {
    await saveStretchRoutine(routine);
    setPreviewStretchRoutine(routine);
  }

  async function startStretchRoutine(routine?: StretchRoutineDefinition, previous = false) {
    if (!activeSessionReady) throw new Error("Please wait for your active session to load.");
    if (!user || activeSession || startingWorkout.current) return;
    startingWorkout.current = true;
    try {
      const session = createStretchRoutineSession(user.uid, routine, previous);
      await saveWorkoutSession(session);
      setPreviewStretchRoutine(null); setStartOpen(false); setLogPreviousOpen(false);
      setActiveSession(session);
    } finally { startingWorkout.current = false; }
  }

  async function finishStretchRoutine(session: WorkoutSession) {
    const completed = completeWorkoutSession(session);
    await saveWorkoutSession(completed);
    if (session.entryMode !== "previous") await applyHabitMapping(completed, "stretch");
    setActiveSession(null);
    setSection("history");
    setHistorySession(completed);
  }

  async function abandonWorkout(session: WorkoutSession) {
    await deleteWorkoutSession(session.id);
    setActiveSession(null);
  }

  async function repeatSession(source: WorkoutSession) {
    if (!user) throw new Error("Sign in to repeat a session.");
    if (!activeSessionReady) throw new Error("Please wait for your active session to load.");
    if (activeSession) { setHistorySession(null); setCompletionSession(null); return; }
    if (startingWorkout.current) throw new Error("A session is already starting.");
    startingWorkout.current = true;
    try {
      const repeated = createRepeatedTrainingSession(user.uid, source);
      const draft = !historyLoading && !loadErrors.history ? attachWorkoutCoaching(repeated, completedSessions) : repeated;
      await saveWorkoutSession(draft);
      setHistorySession(null); setCompletionSession(null); setActiveSession(draft);
    } finally { startingWorkout.current = false; }
  }

  function openStart(kind: "type" | "workout" = "type") {
    if (activeSession) { setHistorySession(null); setCompletionSession(null); return; }
    setStartKind(kind); setStartOpen(true);
  }

  const pendingCheckInForRoutine = (routineId: string) => scheduledCheckIns.find((checkIn) => checkIn.status === "pending" && checkIn.sourceType === "stretch_routine" && checkIn.sourceId === routineId) ?? null;

  return (
    <div className="workouts-page" style={{ padding: "32px 28px", width: "100%", minWidth: 0 }}>
      <TrainingDashboard workouts={workouts} routines={stretchRoutines} sessions={completedSessions} today={today}
        section={section} onSection={setSection} loading={{ workouts: loading, routines: routinesLoading, history: historyLoading }}
        loadErrors={{ ...loadErrors, active: activeSessionError }} onRetry={() => { setLoading(true); setRoutinesLoading(true); setHistoryLoading(true); setLoadErrors({ workouts: false, routines: false, history: false }); setRetry((value) => value + 1); }}
        enabled={!!user && activeSessionReady} activeSession={activeSession} onStart={() => openStart()} onStartWorkout={() => openStart("workout")}
        onCreate={() => setCreateOpen(true)} onLogPrevious={() => setLogPreviousOpen(true)} onPreviewWorkout={setPreviewWorkout}
        onPreviewStretch={setPreviewStretchRoutine} onStartSaved={(workout, increments) => startWorkout(workout, false, increments)} onHistory={setHistorySession} />
      {createOpen && <CreateTrainingModal isOpen onClose={() => setCreateOpen(false)} onChooseWorkout={() => { setCreateOpen(false); setCreateWorkoutOpen(true); }} onChooseStretchRoutine={() => { setCreateOpen(false); setCreateStretchOpen(true); }} />}
      {startOpen && <StartTrainingModal initialStep={startKind} workouts={workouts} routines={stretchRoutines} loading={loading} onClose={() => setStartOpen(false)} onWorkout={startWorkout} onActivity={startActivity} onStretch={startStretchRoutine} />}
      {logPreviousOpen && <StartTrainingModal previous workouts={workouts} routines={stretchRoutines} loading={loading} onClose={() => setLogPreviousOpen(false)} onWorkout={(workout) => startWorkout(workout, true)} onActivity={(activity) => startActivity(activity, true)} onStretch={(routine) => startStretchRoutine(routine, true)} />}
      {createWorkoutOpen && <CreateWorkoutModal isOpen userId={user?.uid ?? ""} nextSortOrder={workouts.length} onClose={() => setCreateWorkoutOpen(false)} onCreate={saveWorkout} />}
      {createStretchOpen && <CreateStretchRoutineModal isOpen userId={user?.uid ?? ""} nextSortOrder={stretchRoutines.length} onClose={() => setCreateStretchOpen(false)} onCreate={createStretchRoutine} />}
      {previewWorkout && <WorkoutPreviewModal workout={previewWorkout} onExit={() => setPreviewWorkout(null)} onStart={(workout) => void startWorkout(workout)} onSave={async (workout) => { await saveWorkout(workout); setPreviewWorkout(workout); }} onDelete={async (workout) => { await deleteWorkout(workout.id); setPreviewWorkout(null); }} />}
      {previewStretchRoutine && <StretchRoutinePreviewModal routine={previewStretchRoutine} onClose={() => setPreviewStretchRoutine(null)} onStart={(routine) => void startStretchRoutine(routine)} onScheduleCheckIn={() => setRoutineToSchedule(previewStretchRoutine)} pendingCheckInAt={pendingCheckInForRoutine(previewStretchRoutine.id)?.dueAt ?? null} />}
      {routineToSchedule && <ScheduleCheckInModal title={routineToSchedule.name} detail="Keep this routine pending and we’ll ask whether you completed it the next time you open the dashboard after your chosen time." onClose={() => setRoutineToSchedule(null)} onSchedule={async (time) => { await scheduleStretchRoutineCheckIn(routineToSchedule, time); }} />}
      {activeSession?.sessionType === "activity" ? <ActiveActivityScreen key={activeSession.id} onChange={saveWorkoutSession} session={activeSession} onFinish={finishActivity} onAbandon={abandonWorkout} /> : activeSession?.sessionType === "stretch" ? <ActiveStretchRoutineScreen key={activeSession.id} onChange={saveWorkoutSession} session={activeSession} onFinish={finishStretchRoutine} onAbandon={abandonWorkout} /> : activeSession && <ActiveWorkoutScreen key={activeSession.id} history={historyLoading || loadErrors.history ? undefined : completedSessions} session={activeSession} onChange={saveWorkoutSession} onFinish={finishWorkout} onAbandon={abandonWorkout} />}
      {completionSession && <WorkoutCompletionSummary session={completionSession} onDone={() => setCompletionSession(null)} onViewHistory={() => { setSection("history"); setHistorySession(completionSession); setCompletionSession(null); }} />}
      {historySession?.sessionType === "activity" ? <CompletedActivityDetailModal onRepeat={repeatSession} repeatLabel={activeSession ? "Resume active session" : "Repeat session"} session={historySession} onClose={() => setHistorySession(null)} onDelete={deleteCompletedSession} /> : historySession?.sessionType === "stretch" ? <CompletedStretchRoutineDetailModal onRepeat={repeatSession} repeatLabel={activeSession ? "Resume active session" : "Repeat session"} session={historySession} onClose={() => setHistorySession(null)} /> : historySession && <CompletedWorkoutDetailModal onRepeat={repeatSession} repeatLabel={activeSession ? "Resume active session" : "Repeat session"} session={historySession} onClose={() => setHistorySession(null)} onDelete={deleteCompletedSession} />}
    </div>
  );
}
