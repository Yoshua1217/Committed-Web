export interface Bucket {
  id: string;
  name: string;
  iconName: string;
  color: number; // ARGB long value
  sortOrder: number;
  createdAt: number;
  userId: string;
}

export interface Goal {
  id: string;
  bucketId: string;
  name: string;
  iconName: string;
  description: string;
  sortOrder: number;
  createdAt: number;
  userId: string;
}

export interface Habit {
  id: string;
  bucketId: string;
  goalId: string;
  name: string;
  iconName: string;
  completionType: "checkbox" | "counter" | "timer";
  counterIncrement: number;
  counterGoal: number;
  timerGoalSeconds: number;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  reminderTime: string | null; // "HH:mm" (24h) or null
  sortOrder: number;
  createdAt: number;
  userId: string;
  pausePeriods: { startedOn: string; endedOn: string | null }[];
  /** Local creation date, captured once so travel cannot move the start day. */
  createdOn?: string;
  /** Current definition applies from this date; earlier definitions are frozen. */
  effectiveFrom?: string;
  deletedOn?: string | null;
  /** Each key is the exclusive end date of the saved definition. */
  history?: Record<string, HabitDefinition>;
}

export type HabitDefinition = Omit<Habit, "history">;

export interface HabitCompletion {
  id: string;
  habitId: string;
  utcOffsetMinutes?: number; // Current offset for server local-date validation
  dayEndsAt?: number; // Original next local midnight, including DST transitions
  manualHistoryEdit?: boolean; // Explicit correction in the day editor
  includedInDay?: boolean; // Keep an originally counted habit in the day when unchecked
  date: string; // ISO format "2026-03-03"
  completed: boolean;
  counterValue: number;
  timerSeconds: number;
  completedAt: number | null;
  userId: string;
}

export interface Idea {
  id: string;
  userId: string;
  text: string;
  starred: boolean;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  outcome: string;
  goalId: string;
  deadline: string;
  archived: boolean;
  createdAt: number;
}

export interface Task {
  id: string;
  userId: string;
  type: "todo" | "task";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  projectId?: string;
  /** Effort estimate; a timed start plus this duration forms the work block. */
  estimatedMinutes?: number | null;
  /** Sync-owned fields, never overwritten by task forms. */
  calendarLink?: { calendarId: string; eventId: string; fingerprint: string } | null;
  deleted?: boolean;
  goalId: string;
  dueDate: string | null; // "YYYY-MM-DD"
  /** Local date and time selected for beginning the task: "YYYY-MM-DDTHH:mm". */
  startDateTime: string | null;
  /** Local date and time selected for completing the task: "YYYY-MM-DDTHH:mm". */
  dueDateTime: string | null;
  /** Whether the start date represents a full-day schedule. */
  startAllDay: boolean;
  /** Whether the due date represents a full-day schedule. */
  dueAllDay: boolean;
  notificationDateTime: string | null; // "YYYY-MM-DDTHH:mm"
  completed: boolean;
  completedAt: number | null;
  archived: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  modelLabel?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface UserSettings {
  darkMode: boolean;
  preferredName: string;
  mainGoals: string;
  mainStruggles: string;
  customPrompt: string;
  workoutHabitMappingEnabled: boolean;
  workoutHabitMappingHabitId: string | null;
  stretchHabitMappingEnabled: boolean;
  stretchHabitMappingHabitId: string | null;
}

export type MuscleGroup = "Chest" | "Back" | "Shoulders" | "Biceps" | "Triceps" | "Forearms" | "Core" | "Quadriceps" | "Hamstrings" | "Glutes" | "Calves" | "Full body";
export type ExerciseLoadType = "external_weight" | "bodyweight" | "assistance" | "added_weight";

export interface ExerciseDefinition {
  id: string;
  name: string;
  loadType: ExerciseLoadType;
  /** Recommended rest between completed sets, in seconds. */
  restSeconds: number;
  primaryMuscleGroups: MuscleGroup[];
  secondaryMuscleGroups: MuscleGroup[];
  summary: string;
  instructions: string;
}

/** Monday is 0 and Sunday is 6. */
export type WorkoutDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkoutExercisePlan {
  exerciseId: string;
  sortOrder: number;
  plannedSets: number;
  plannedReps: number;
}

export interface WorkoutDefinition {
  id: string;
  userId: string;
  name: string;
  description: string;
  scheduledDays: WorkoutDay[];
  exercises: WorkoutExercisePlan[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** A curated stretch from the hard-coded stretching catalogue. */
export interface StretchDefinition {
  id: string;
  name: string;
  primaryMuscleGroups: MuscleGroup[];
  secondaryMuscleGroups: MuscleGroup[];
  summary: string;
  instructions: string;
}

export interface StretchRoutinePlan {
  stretchId: string;
  /** Seconds to hold this stretch before moving to the next one. */
  holdSeconds: number;
  sortOrder: number;
}

/** Scheduling is saved independently and never contributes to workout progress. */
export interface StretchRoutineDefinition {
  id: string;
  userId: string;
  name: string;
  description: string;
  scheduledDays: WorkoutDay[];
  stretches: StretchRoutinePlan[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type ScheduledCheckInSourceType = "habit" | "stretch_routine";
export type ScheduledCheckInStatus = "pending" | "completed" | "missed";

/** A one-time promise to check back in with the user after a chosen local time. */
export interface ScheduledCheckIn {
  id: string;
  userId: string;
  sourceType: ScheduledCheckInSourceType;
  sourceId: string;
  sourceNameSnapshot: string;
  /** The local calendar day represented by this check-in (YYYY-MM-DD). */
  scheduledForDate: string;
  dueAt: number;
  status: ScheduledCheckInStatus;
  resolvedAt: number | null;
  /** A routine can be completed even if the template changes before the user checks in. */
  stretchRoutineSnapshot?: StretchRoutineDefinition;
  createdAt: number;
  updatedAt: number;
}

export type WorkoutSessionStatus = "active" | "completed" | "abandoned";
export type WorkoutSessionType = "workout" | "activity" | "stretch";

/** The perceived effort selected after an activity is finished. */
export type ActivityIntensity = "easy" | "steady" | "hard" | "all_out";

/** A curated, hard-coded activity that can be logged independently of a workout. */
export interface ActivityDefinition {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
}

export interface WorkoutSetLog {
  id: string;
  weightLbs: number | null;
  reps: number | null;
  completed: boolean;
  kind?: "working" | "warmup";
}

export type ExerciseEffort = "easier" | "about_right" | "harder";
export interface ExerciseCoachingBaseline {
  sessionId: string;
  completedAt: number;
  loadType: ExerciseLoadType;
  plannedReps: number;
  effort: ExerciseEffort | null;
  sets: WorkoutSetLog[];
}
export interface ExerciseCoaching {
  version: 1;
  previous: ExerciseCoachingBaseline | null;
  earlier: ExerciseCoachingBaseline | null;
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  exerciseNameSnapshot: string;
  loadType: ExerciseLoadType;
  restSeconds: number;
  sortOrder: number;
  plannedSets: number;
  plannedReps: number;
  /** Added while logging, without changing the saved routine. */
  addedDuringSession?: boolean;
  sets: WorkoutSetLog[];
  effort?: ExerciseEffort | null;
  /** The actual available load step, entered by the user, never guessed. */
  weightIncrementLbs?: number | null;
  /** Frozen pre-session evidence; prevents targets changing while logging. */
  coaching?: ExerciseCoaching;
}

/** A frozen stretch entry keeps completed routines readable if the catalogue later changes. */
export interface StretchRoutineLog {
  stretchId: string;
  stretchNameSnapshot: string;
  summarySnapshot: string;
  instructionsSnapshot: string;
  holdSeconds: number;
  sortOrder: number;
}

export interface WorkoutPersonalRecordEvent {
  exerciseId: string;
  exerciseNameSnapshot: string;
  weightLbs: number;
  reps: number | null;
  previousBestWeightLbs: number | null;
  previousBestReps: number | null;
  /** Highest weight, then highest reps; exact ties highlight only the first set. */
  setIds: [string];
}

export interface WorkoutSession {
  id: string;
  userId: string;
  /** Legacy sessions without this field are treated as workouts when loaded. */
  sessionType: WorkoutSessionType;
  workoutId: string;
  workoutNameSnapshot: string;
  /** Previous training sessions use an entered duration instead of live timers. */
  entryMode?: "previous";
  /** Actual session end time for a previous training draft. */
  performedAt?: number;
  /** Activity-only snapshots keep history useful if the catalogue changes later. */
  activityId?: string;
  activityCategorySnapshot?: string;
  activityIconSnapshot?: string;
  activityDescriptionSnapshot?: string;
  activityIntensity?: ActivityIntensity | null;
  /** Stretch-routine-only snapshots. */
  stretchRoutineId?: string;
  stretchRoutineDescriptionSnapshot?: string;
  stretches?: StretchRoutineLog[];
  startedAt: number;
  completedAt: number | null;
  /** Frozen elapsed time when finished, in seconds. */
  durationSeconds: number | null;
  /** Local calendar date on which the workout was finished (YYYY-MM-DD). */
  completedDate: string | null;
  status: WorkoutSessionStatus;
  personalRecords: WorkoutPersonalRecordEvent[];
  exercises: WorkoutExerciseLog[];
  /** Frozen Prev values from the historical workout used to start this session. */
  repeatPreviousExercises?: WorkoutExerciseLog[];
  /** Set count in the saved routine before this session was shortened. */
  adjustedFromSetCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StreakInfo {
  currentStreak: number;
  currentAntiStreak: number;
}
