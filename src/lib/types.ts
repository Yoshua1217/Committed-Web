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

export interface Label {
  id: string;
  name: string;
  bucketId: string;
  sortOrder?: number;
  createdAt: number;
  userId: string;
}

// Prompt Library interfaces
export interface PromptPlatform {
  id: string;
  name: string;
  color: string; // Hex color string
  createdAt: number;
  userId: string;
}

export interface PromptLabel {
  id: string;
  name: string;
  sortOrder?: number;
  createdAt: number;
  userId: string;
}

export interface Prompt {
  id: string;
  title: string;
  description: string;
  promptText: string;
  labelIds: string[];
  platformId: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  labelIds: string[];
  bucketId: string;
  createdAt: number;
  updatedAt: number;
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

export interface StreakInfo {
  currentStreak: number;
  currentAntiStreak: number;
}
