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
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  date: string; // ISO format "2026-03-03"
  completed: boolean;
  counterValue: number;
  timerSeconds: number;
  completedAt: number | null;
  userId: string;
}

export interface Task {
  id: string;
  userId: string;
  type: "todo" | "task";
  title: string;
  description: string;
  goalId: string;
  dueDate: string | null; // "YYYY-MM-DD"
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

export type WorkoutSessionStatus = "active" | "completed" | "abandoned";
export type WorkoutSessionType = "workout" | "activity";

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
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  exerciseNameSnapshot: string;
  loadType: ExerciseLoadType;
  restSeconds: number;
  sortOrder: number;
  plannedSets: number;
  plannedReps: number;
  sets: WorkoutSetLog[];
}

export interface WorkoutPersonalRecordEvent {
  exerciseId: string;
  exerciseNameSnapshot: string;
  reps: number;
  previousBestReps: number | null;
  /** IDs of the logged sets that established this session's best rep record. */
  setIds?: string[];
}

export interface WorkoutSession {
  id: string;
  userId: string;
  /** Legacy sessions without this field are treated as workouts when loaded. */
  sessionType: WorkoutSessionType;
  workoutId: string;
  workoutNameSnapshot: string;
  /** Activity-only snapshots keep history useful if the catalogue changes later. */
  activityId?: string;
  activityCategorySnapshot?: string;
  activityIconSnapshot?: string;
  activityDescriptionSnapshot?: string;
  activityIntensity?: ActivityIntensity | null;
  startedAt: number;
  completedAt: number | null;
  /** Frozen elapsed time when finished, in seconds. */
  durationSeconds: number | null;
  /** Local calendar date on which the workout was finished (YYYY-MM-DD). */
  completedDate: string | null;
  status: WorkoutSessionStatus;
  personalRecords: WorkoutPersonalRecordEvent[];
  exercises: WorkoutExerciseLog[];
  createdAt: number;
  updatedAt: number;
}

export interface StreakInfo {
  currentStreak: number;
  currentAntiStreak: number;
}
