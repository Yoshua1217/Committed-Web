"use client";

import { useEffect, useMemo, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import CreateWorkoutModal from "@/components/create-workout-modal";
import CreateStretchRoutineModal from "@/components/create-stretch-routine-modal";
import CreateTrainingModal from "@/components/create-training-modal";
import WorkoutPreviewModal from "@/components/workout-preview-modal";
import StretchRoutinePreviewModal from "@/components/stretch-routine-preview-modal";
import ActiveStretchRoutineScreen from "@/components/active-stretch-routine-screen";
import ActiveWorkoutScreen from "@/components/active-workout-screen";
import ActiveActivityScreen from "@/components/active-activity-screen";
import ActivityPickerModal from "@/components/activity-picker-modal";
import CompletedWorkoutDetailModal from "@/components/completed-workout-detail-modal";
import CompletedActivityDetailModal from "@/components/completed-activity-detail-modal";
import CompletedStretchRoutineDetailModal from "@/components/completed-stretch-routine-detail-modal";
import WorkoutCompletionSummary from "@/components/workout-completion-summary";
import ScheduleCheckInModal from "@/components/schedule-checkin-modal";
import { useAuth } from "@/lib/auth-context";
import { activityIntensityMeta } from "@/lib/activity-intensity";
import { ActivityDefinition, ActivityIntensity, ScheduledCheckIn, StretchRoutineDefinition, WorkoutDay, WorkoutDefinition, WorkoutSession } from "@/lib/types";
import { completeActivitySession, completeWorkoutSession, completeWorkoutSessionWithPersonalRecords, createActivitySession, createStretchRoutineSession, createWorkoutSession, deleteCompletedSession, deleteWorkout, deleteWorkoutSession, saveStretchRoutine, saveWorkout, saveWorkoutSession, subscribeToActiveWorkoutSession, subscribeToCompletedWorkoutSessions, subscribeToStretchRoutines, subscribeToWorkouts } from "@/lib/workouts-service";
import { getSettings } from "@/lib/settings-service";
import { markHabitComplete } from "@/lib/habits-service";
import { scheduleStretchRoutineCheckIn, subscribeToScheduledCheckIns } from "@/lib/scheduled-checkins-service";

const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mondayFirstDay(): WorkoutDay {
  return ((new Date().getDay() + 6) % 7) as WorkoutDay;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Adds rep PR events to older sessions too, so workout history is useful even
 * when a session was completed before PRs were persisted to Firestore.
 */
function withHistoricalPersonalRecords(sessions: WorkoutSession[]): WorkoutSession[] {
  const bestRepsByExercise = new Map<string, number>();

  return sessions
    .slice()
    .sort((a, b) => (a.completedAt ?? a.createdAt) - (b.completedAt ?? b.createdAt))
    .map((session) => {
      if (session.sessionType === "activity" || session.sessionType === "stretch") return { ...session, personalRecords: [] };
      const personalRecords = session.exercises.flatMap((exercise) => {
        const completedSets = exercise.sets.filter((set) => set.completed && typeof set.reps === "number" && set.reps > 0);
        const reps = Math.max(...completedSets.map((set) => set.reps ?? 0), 0);
        const previousBestReps = bestRepsByExercise.get(exercise.exerciseId);

        if (!reps || (previousBestReps !== undefined && reps <= previousBestReps)) return [];

        bestRepsByExercise.set(exercise.exerciseId, reps);
        return [{
          exerciseId: exercise.exerciseId,
          exerciseNameSnapshot: exercise.exerciseNameSnapshot,
          reps,
          previousBestReps: previousBestReps ?? null,
          setIds: completedSets.filter((set) => set.reps === reps).map((set) => set.id),
        }];
      });

      return { ...session, personalRecords };
    })
    .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
}

export default function WorkoutsPage() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutDefinition[]>([]);
  const [stretchRoutines, setStretchRoutines] = useState<StretchRoutineDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createWorkoutOpen, setCreateWorkoutOpen] = useState(false);
  const [createStretchOpen, setCreateStretchOpen] = useState(false);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [previewWorkout, setPreviewWorkout] = useState<WorkoutDefinition | null>(null);
  const [previewStretchRoutine, setPreviewStretchRoutine] = useState<StretchRoutineDefinition | null>(null);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [section, setSection] = useState<"overview" | "history">("overview");
  const [completedSessions, setCompletedSessions] = useState<WorkoutSession[]>([]);
  const [historySession, setHistorySession] = useState<WorkoutSession | null>(null);
  const [completionSession, setCompletionSession] = useState<WorkoutSession | null>(null);
  const [scheduledCheckIns, setScheduledCheckIns] = useState<ScheduledCheckIn[]>([]);
  const [routineToSchedule, setRoutineToSchedule] = useState<StretchRoutineDefinition | null>(null);
  const todayDay = mondayFirstDay();
  const todaysWorkout = useMemo(() => workouts.find((workout) => workout.scheduledDays.includes(todayDay)) ?? null, [todayDay, workouts]);
  const scheduledWorkoutEntries = useMemo(() => workouts
    .flatMap((workout) => workout.scheduledDays.map((day) => ({ workout, day })))
    .sort((a, b) => ((a.day - todayDay + 7) % 7) - ((b.day - todayDay + 7) % 7) || a.workout.sortOrder - b.workout.sortOrder), [todayDay, workouts]);
  const historySessions = useMemo(() => withHistoricalPersonalRecords(completedSessions), [completedSessions]);
  const weeklyProgress = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayDay);
    const scheduledDays = new Set(workouts.flatMap((workout) => workout.scheduledDays));
    const completedDateKeys = new Set(completedSessions
      .filter((session) => session.completedAt !== null)
      .map((session) => session.completedDate ?? localDateKey(new Date(session.completedAt!))));
    const days = dayLetters.map((letter, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const isScheduled = scheduledDays.has(index as WorkoutDay);
      const isCompleted = completedDateKeys.has(localDateKey(date));
      const isTodayOrFuture = date >= todayStart;
      const status = isCompleted ? "completed" : isScheduled ? (isTodayOrFuture ? "pending" : "missed") : "unscheduled";
      return { letter, date, isScheduled, isCompleted, status };
    });
    const eligibleDays = days.filter((day) => day.isScheduled && day.date < todayStart);
    const completedEligibleDays = eligibleDays.filter((day) => day.isCompleted).length;
    return {
      days,
      percentage: eligibleDays.length ? Math.round((completedEligibleDays / eligibleDays.length) * 100) : 0,
      completedEligibleDays,
      eligibleDays: eligibleDays.length,
    };
  }, [completedSessions, todayDay, workouts]);

  useEffect(() => {
    if (!user) return;
    return subscribeToWorkouts(user.uid, (nextWorkouts) => {
      setWorkouts(nextWorkouts);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToStretchRoutines(user.uid, setStretchRoutines);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToCompletedWorkoutSessions(user.uid, setCompletedSessions);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToActiveWorkoutSession(user.uid, setActiveSession);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToScheduledCheckIns(user.uid, setScheduledCheckIns);
  }, [user]);

  async function startWorkout(workout: WorkoutDefinition) {
    if (!user) return;
    if (activeSession) {
      setPreviewWorkout(null);
      return;
    }
    const session = createWorkoutSession(user.uid, workout);
    await saveWorkoutSession(session);
    setPreviewWorkout(null);
    setActiveSession(session);
  }

  async function finishWorkout(session: WorkoutSession) {
    const completed = await completeWorkoutSessionWithPersonalRecords(session);
    await applyHabitMapping(completed, "workout");
    setActiveSession(null);
    setCompletionSession(completed);
  }

  async function startActivity(activity: ActivityDefinition) {
    if (!user || activeSession) return;
    const session = createActivitySession(user.uid, activity);
    await saveWorkoutSession(session);
    setActivityPickerOpen(false);
    setActiveSession(session);
  }

  async function finishActivity(session: WorkoutSession, intensity: ActivityIntensity) {
    const completed = completeActivitySession(session, intensity);
    await saveWorkoutSession(completed);
    await applyHabitMapping(completed, "workout");
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

  async function startStretchRoutine(routine: StretchRoutineDefinition) {
    if (!user || activeSession) return;
    const session = createStretchRoutineSession(user.uid, routine);
    await saveWorkoutSession(session);
    setPreviewStretchRoutine(null);
    setActiveSession(session);
  }

  async function finishStretchRoutine(session: WorkoutSession) {
    const completed = completeWorkoutSession(session);
    await saveWorkoutSession(completed);
    await applyHabitMapping(completed, "stretch");
    setActiveSession(null);
    setSection("history");
    setHistorySession(completed);
  }

  async function abandonWorkout(session: WorkoutSession) {
    await deleteWorkoutSession(session.id);
    setActiveSession(null);
  }

  const formattedDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const formatHistoryDate = (session: WorkoutSession) => session.completedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(session.completedAt)) : session.completedDate ?? "Completed";
  const formatHistoryDuration = (session: WorkoutSession) => {
    const seconds = session.durationSeconds ?? (session.completedAt ? Math.max(0, Math.floor((session.completedAt - session.startedAt) / 1000)) : 0);
    return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };
  const pendingCheckInForRoutine = (routineId: string) => scheduledCheckIns.find((checkIn) => checkIn.status === "pending" && checkIn.sourceType === "stretch_routine" && checkIn.sourceId === routineId) ?? null;

  return (
    <div className="workouts-page" style={{ padding: "32px 28px", maxWidth: 720, width: "100%" }}>
      <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="flex items-center gap-2" style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)", margin: "0 0 6px" }}><MaterialIcon name="FitnessCenter" size={26} />Workouts</h1>
          <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>Train with intention.</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} style={{ background: "var(--primary)", color: "var(--background)", border: "none", borderRadius: 14, padding: "11px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Create</button>
      </div>

      <div role="tablist" aria-label="Workout sections" className="flex items-center" style={{ width: "fit-content", padding: 4, marginBottom: 24, borderRadius: 14, backgroundColor: "var(--surface-variant)" }}><button type="button" role="tab" aria-selected={section === "overview"} onClick={() => setSection("overview")} style={{ padding: "9px 16px", border: "none", borderRadius: 10, backgroundColor: section === "overview" ? "var(--surface)" : "transparent", boxShadow: section === "overview" ? "0 1px 3px rgba(0, 0, 0, 0.12)" : "none", color: section === "overview" ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Overview</button><button type="button" role="tab" aria-selected={section === "history"} onClick={() => setSection("history")} style={{ padding: "9px 16px", border: "none", borderRadius: 10, backgroundColor: section === "history" ? "var(--surface)" : "transparent", boxShadow: section === "history" ? "0 1px 3px rgba(0, 0, 0, 0.12)" : "none", color: section === "history" ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>History</button></div>

      <div hidden={section !== "overview"}>
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 24, marginBottom: 18 }}>
        <p style={{ color: "var(--secondary)", fontWeight: 700, fontSize: 12, letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 8px" }}>Today&apos;s workout</p>
        <p style={{ color: "var(--secondary)", fontSize: 13, margin: "0 0 18px" }}>{formattedDate}</p>
        {loading ? <p style={{ color: "var(--secondary)", fontSize: 14, margin: 0 }}>Loading workout…</p> : todaysWorkout ? (
          <><h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)", margin: "0 0 6px" }}>{todaysWorkout.name}</h2><p style={{ fontSize: 14, color: "var(--secondary)", margin: "0 0 20px" }}>{todaysWorkout.description || "Your scheduled workout is ready."}</p><div className="flex gap-2"><button type="button" onClick={() => setPreviewWorkout(todaysWorkout)} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface)", color: "var(--primary)", fontWeight: 700, cursor: "pointer" }}>Preview</button><button type="button" onClick={() => void startWorkout(todaysWorkout)} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "var(--primary)", color: "var(--background)", fontWeight: 700, cursor: "pointer" }}>{activeSession ? "Resume" : "Start"}</button></div></>
        ) : <div className="flex flex-col items-center" style={{ textAlign: "center", padding: "8px 0 2px" }}><MaterialIcon name="calendar_month" size={32} color="var(--secondary)" /><p style={{ fontSize: 16, fontWeight: 750, color: "var(--primary)", margin: "12px 0 5px" }}>No workout scheduled for today</p><p style={{ fontSize: 14, color: "var(--secondary)", margin: 0, maxWidth: 340 }}>Create a workout and choose its training days to see it here.</p></div>}
      </section>

      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "22px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 18 }}><div><h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--primary)", margin: "0 0 4px" }}>This week</h2><p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Your scheduled workout progress</p></div><span style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>{weeklyProgress.percentage}%</span></div>
        <div className="flex justify-between" style={{ gap: 7 }} aria-label="Weekly workout status">{weeklyProgress.days.map((day, index) => { const style = day.status === "completed" ? { background: "#2e9a5b", border: "1px solid #2e9a5b", color: "white" } : day.status === "missed" ? { background: "#d9534f1a", border: "1px solid #d9534f75", color: "#d9534f" } : day.status === "pending" ? { background: "#f5c84c1a", border: "1px solid #f5c84c75", color: "#d69e13" } : { background: "var(--surface-variant)", border: "1px solid var(--border)", color: "var(--secondary)" }; const label = `${dayNames[index]}: ${day.status === "completed" ? "workout completed" : day.status === "missed" ? "scheduled workout missed" : day.status === "pending" ? "scheduled workout pending" : "no workout scheduled"}`; return <div key={`${day.letter}-${index}`} className="flex flex-col items-center" style={{ gap: 6 }}><span aria-label={label} title={label} style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: "50%", ...style, fontSize: 13, fontWeight: 750 }}>{day.letter}</span>{index === todayDay && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--primary)" }} aria-label="Today" />}</div>; })}</div>
        {!loading && workouts.length > 0 && <p style={{ fontSize: 12, color: "var(--secondary)", margin: "16px 0 0", textAlign: "center" }}>{weeklyProgress.eligibleDays ? `${weeklyProgress.completedEligibleDays} of ${weeklyProgress.eligibleDays} scheduled day${weeklyProgress.eligibleDays === 1 ? "" : "s"} complete` : "Your progress starts after your first scheduled workout day."}</p>}
        {!loading && workouts.length === 0 && <p style={{ fontSize: 13, color: "var(--secondary)", margin: "18px 0 0", textAlign: "center" }}>Your weekly progress will appear after you schedule your first workout.</p>}
      </section>
      <button type="button" onClick={() => setActivityPickerOpen(true)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 14, padding: "15px 16px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}><span className="flex items-center" style={{ gap: 12 }}><span style={{ width: 39, height: 39, display: "grid", placeItems: "center", borderRadius: 13, background: "#41e987", color: "#073019" }}><MaterialIcon name="add_task" size={21} /></span><span><strong style={{ display: "block", fontSize: 15, fontWeight: 850 }}>Log new activity</strong><small style={{ display: "block", marginTop: 2, color: "var(--secondary)", fontSize: 12, fontWeight: 650 }}>Start now, finish whenever you&apos;re done</small></span></span><MaterialIcon name="chevron_right" size={22} color="#41e987" /></button>
      {!loading && scheduledWorkoutEntries.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--primary)", margin: 0 }}>Scheduled workouts</h2>
            <span style={{ fontSize: 12, color: "var(--secondary)", fontWeight: 650 }}>{workouts.length} workout{workouts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {scheduledWorkoutEntries.map(({ workout, day }) => (
              <button type="button" key={`${workout.id}-${day}`} onClick={() => setPreviewWorkout(workout)} aria-label={`Preview ${workout.name}`} style={{ width: "100%", textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "15px 16px", cursor: "pointer" }}>
                <div className="flex items-center justify-between" style={{ gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: day === todayDay ? "#2e9a5b" : "var(--secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", margin: "0 0 5px", textTransform: "uppercase" }}>{day === todayDay ? "Today" : dayNames[day]}</p>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--primary)", margin: "0 0 4px" }}>{workout.name}</h3>
                    <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}{workout.description ? ` · ${workout.description}` : ""}</p>
                  </div>
                  <MaterialIcon name="chevron_right" size={21} color="var(--secondary)" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
      {!loading && stretchRoutines.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div><h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--primary)", margin: 0 }}>Stretching routines</h2></div>
            <span style={{ fontSize: 12, color: "var(--secondary)", fontWeight: 650 }}>{stretchRoutines.length} routine{stretchRoutines.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {stretchRoutines.map((routine) => {
              const totalSeconds = routine.stretches.reduce((total, stretch) => total + stretch.holdSeconds, 0);
              const duration = totalSeconds >= 60 ? `${Math.floor(totalSeconds / 60)}m${totalSeconds % 60 ? ` ${totalSeconds % 60}s` : ""}` : `${totalSeconds}s`;
              const pendingCheckIn = pendingCheckInForRoutine(routine.id);
              const scheduledLabel = pendingCheckIn ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(pendingCheckIn.dueAt)) : null;
              return <button type="button" key={routine.id} onClick={() => setPreviewStretchRoutine(routine)} aria-label={`Preview ${routine.name}`} style={{ width: "100%", padding: "15px 16px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)", color: "var(--primary)", cursor: "pointer", textAlign: "left" }}>
                <div className="flex items-center justify-between" style={{ gap: 12 }}><div className="flex items-center" style={{ minWidth: 0, gap: 12 }}><span style={{ width: 38, height: 38, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 12, background: "var(--surface-variant)", color: "#41e987" }}><MaterialIcon name="self_improvement" size={22} /></span><div style={{ minWidth: 0 }}><h3 style={{ margin: "0 0 4px", color: "var(--primary)", fontSize: 16, fontWeight: 800 }}>{routine.name}</h3><p style={{ margin: 0, color: "var(--secondary)", fontSize: 13 }}>{routine.stretches.length} stretch{routine.stretches.length === 1 ? "" : "es"} · {duration}{routine.description ? ` · ${routine.description}` : ""}</p>{scheduledLabel && <small style={{ display: "block", marginTop: 5, color: "#d69e13", fontWeight: 750, fontSize: 12 }}>Check-in scheduled for {scheduledLabel}</small>}</div></div><MaterialIcon name="chevron_right" size={21} color="var(--secondary)" /></div>
              </button>;
            })}
          </div>
        </section>
      )}
      </div>
      {section === "history" && <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "20px 18px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 15 }}>
          <div><h2 style={{ fontSize: 17, fontWeight: 850, color: "var(--primary)", margin: "0 0 4px" }}>Training history</h2><p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Your completed workouts and activities</p></div>
          <span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 750 }}>{historySessions.length} total</span>
        </div>
        {historySessions.length ? <div className="flex flex-col" style={{ gap: 9 }}>
          {historySessions.map((session) => {
            const isActivity = session.sessionType === "activity";
            const isStretch = session.sessionType === "stretch";
            const intensity = isActivity ? activityIntensityMeta(session.activityIntensity) : null;
            return <button key={session.id} type="button" onClick={() => setHistorySession(session)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 14px 13px", border: "1px solid var(--border)", borderRadius: 14, background: "var(--background)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}>
              <span className="flex items-center" style={{ minWidth: 0, gap: 11 }}>
                {(isActivity || isStretch) && <span style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 11, background: "var(--surface-variant)", color: "#41e987" }}><MaterialIcon name={isStretch ? "self_improvement" : session.activityIconSnapshot ?? "directions_run"} size={19} /></span>}
                <span style={{ minWidth: 0 }}><strong className="flex items-center" style={{ gap: 6, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!isActivity && !isStretch && session.personalRecords.length > 0 && <MaterialIcon name="emoji_events" size={18} color="#d69e13" />}{session.workoutNameSnapshot}</strong><small style={{ display: "block", marginTop: 4, color: "var(--secondary)", fontSize: 12, fontWeight: 600 }}>{isActivity ? `${session.activityCategorySnapshot ?? "Activity"}${intensity ? ` · ${intensity.label}` : ""} · ` : isStretch ? `Stretching routine · ` : ""}{formatHistoryDate(session)} · {formatHistoryDuration(session)}</small></span>
              </span>
              <MaterialIcon name="chevron_right" size={21} color="var(--secondary)" />
            </button>;
          })}
        </div> : <div style={{ padding: "32px 12px", textAlign: "center" }}><MaterialIcon name="history" size={31} color="var(--secondary)" /><p style={{ color: "var(--primary)", fontSize: 15, fontWeight: 800, margin: "12px 0 5px" }}>No completed training yet</p><p style={{ color: "var(--secondary)", fontSize: 13, margin: 0 }}>Finish a workout or activity to see it here.</p></div>}
      </section>}
      {createOpen && <CreateTrainingModal isOpen onClose={() => setCreateOpen(false)} onChooseWorkout={() => { setCreateOpen(false); setCreateWorkoutOpen(true); }} onChooseStretchRoutine={() => { setCreateOpen(false); setCreateStretchOpen(true); }} />}
      {createWorkoutOpen && <CreateWorkoutModal isOpen userId={user?.uid ?? ""} nextSortOrder={workouts.length} onClose={() => setCreateWorkoutOpen(false)} onCreate={saveWorkout} />}
      {createStretchOpen && <CreateStretchRoutineModal isOpen userId={user?.uid ?? ""} nextSortOrder={stretchRoutines.length} onClose={() => setCreateStretchOpen(false)} onCreate={createStretchRoutine} />}
      {activityPickerOpen && <ActivityPickerModal isOpen onClose={() => setActivityPickerOpen(false)} onStart={startActivity} />}
      {previewWorkout && <WorkoutPreviewModal workout={previewWorkout} onExit={() => setPreviewWorkout(null)} onStart={(workout) => void startWorkout(workout)} onSave={async (workout) => { await saveWorkout(workout); setPreviewWorkout(workout); }} onDelete={async (workout) => { await deleteWorkout(workout.id); setPreviewWorkout(null); }} />}
      {previewStretchRoutine && <StretchRoutinePreviewModal routine={previewStretchRoutine} onClose={() => setPreviewStretchRoutine(null)} onStart={(routine) => void startStretchRoutine(routine)} onScheduleCheckIn={() => setRoutineToSchedule(previewStretchRoutine)} pendingCheckInAt={pendingCheckInForRoutine(previewStretchRoutine.id)?.dueAt ?? null} />}
      {routineToSchedule && <ScheduleCheckInModal title={routineToSchedule.name} detail="Keep this routine pending and we’ll ask whether you completed it the next time you open the dashboard after your chosen time." onClose={() => setRoutineToSchedule(null)} onSchedule={async (time) => { await scheduleStretchRoutineCheckIn(routineToSchedule, time); }} />}
      {activeSession?.sessionType === "activity" ? <ActiveActivityScreen session={activeSession} onFinish={finishActivity} onAbandon={abandonWorkout} /> : activeSession?.sessionType === "stretch" ? <ActiveStretchRoutineScreen session={activeSession} onFinish={(session) => void finishStretchRoutine(session)} onAbandon={abandonWorkout} /> : activeSession && <ActiveWorkoutScreen session={activeSession} onChange={saveWorkoutSession} onFinish={finishWorkout} onAbandon={abandonWorkout} />}
      {completionSession && <WorkoutCompletionSummary session={completionSession} onDone={() => setCompletionSession(null)} onViewHistory={() => { setSection("history"); setHistorySession(completionSession); setCompletionSession(null); }} />}
      {historySession?.sessionType === "activity" ? <CompletedActivityDetailModal session={historySession} onClose={() => setHistorySession(null)} onDelete={deleteCompletedSession} /> : historySession?.sessionType === "stretch" ? <CompletedStretchRoutineDetailModal session={historySession} onClose={() => setHistorySession(null)} /> : historySession && <CompletedWorkoutDetailModal session={historySession} onClose={() => setHistorySession(null)} onDelete={deleteCompletedSession} />}
    </div>
  );
}
