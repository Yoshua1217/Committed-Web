import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { Habit, HabitCompletion, Bucket, Goal, StreakInfo, UserSettings, ChatMessage } from "@/lib/types";
import { calculateStreak, isScheduledForDate } from "@/lib/streak-calculator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemPromptParams {
  buckets: Bucket[];
  goals: Goal[];
  habits: Habit[];
  completions: HabitCompletion[]; // today's completions
  streaks: Record<string, StreakInfo>;
  settings: UserSettings | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getTodayDayOfWeek(): number {
  const jsDay = new Date().getDay(); // 0=Sun
  return jsDay === 0 ? 7 : jsDay;
}

function formatTodayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDayOfWeekName(): string {
  return DAY_NAMES[getTodayDayOfWeek() - 1];
}

function getScheduleDays(habit: Habit): string {
  const days: string[] = [];
  if (habit.monday) days.push("Mon");
  if (habit.tuesday) days.push("Tue");
  if (habit.wednesday) days.push("Wed");
  if (habit.thursday) days.push("Thu");
  if (habit.friday) days.push("Fri");
  if (habit.saturday) days.push("Sat");
  if (habit.sunday) days.push("Sun");
  return days.length === 7 ? "Every day" : days.join(", ");
}

function getTypeInfo(habit: Habit): string {
  switch (habit.completionType) {
    case "checkbox":
      return "Checkbox (done/not done)";
    case "counter":
      return `Counter (goal: ${habit.counterGoal}, step: ${habit.counterIncrement})`;
    case "timer":
      return `Timer (goal: ${Math.round(habit.timerGoalSeconds / 60)} min)`;
    default:
      return "Checkbox (done/not done)";
  }
}

function getTodayStatus(habit: Habit, completions: HabitCompletion[]): string {
  if (!isScheduledForDate(habit, formatTodayDate())) {
    return "Not scheduled today";
  }

  const completion = completions.find((c) => c.habitId === habit.id);

  if (!completion) {
    return "Not started today";
  }

  if (completion.completed) {
    return "COMPLETED today";
  }

  switch (habit.completionType) {
    case "counter":
      return `In progress: ${completion.counterValue}/${habit.counterGoal}`;
    case "timer":
      return `In progress: ${completion.timerSeconds}s/${habit.timerGoalSeconds}s`;
    default:
      return "Not started today";
  }
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(params: SystemPromptParams): string {
  const { buckets, goals, habits, completions, streaks, settings } = params;
  const lines: string[] = [];

  // Header
  lines.push(
    "You are Committed AI, a thoughtful personal productivity coach embedded in the Committed app."
  );
  lines.push(
    "You have full access to the user's data. Be specific, personalized, and encouraging."
  );
  lines.push("Keep responses concise but helpful. Use bullet points for lists.");
  lines.push(`Today is ${getDayOfWeekName()}, ${formatTodayDate()}.`);

  // Personalization
  lines.push("");
  lines.push("=== USER'S PERSONALIZATION ===");
  if (settings?.preferredName) {
    lines.push(`Name: ${settings.preferredName}`);
  }
  if (settings?.mainGoals) {
    lines.push(`Goals: ${settings.mainGoals}`);
  }
  if (settings?.mainStruggles) {
    lines.push(`Struggles: ${settings.mainStruggles}`);
  }
  if (settings?.customPrompt) {
    lines.push(`Custom instructions: ${settings.customPrompt}`);
  }

  // Buckets
  lines.push("");
  lines.push("=== USER'S BUCKETS (life categories) ===");
  for (const bucket of buckets) {
    const habitCount = habits.filter((h) => h.bucketId === bucket.id).length;
    lines.push(`- ${bucket.name} (${habitCount} habits)`);
  }

  // Goals
  lines.push("");
  lines.push("=== USER'S GOALS ===");
  for (const goal of goals) {
    const bucket = buckets.find((b) => b.id === goal.bucketId);
    const bucketName = bucket?.name ?? "Unknown";
    const goalHabits = habits.filter((h) => h.goalId === goal.id);
    lines.push(`- "${goal.name}" [${bucketName}] (${goalHabits.length} habits)`);
    if (goal.description) {
      lines.push(`  Description: ${goal.description}`);
    }
  }

  // Habits
  lines.push("");
  lines.push("=== USER'S HABITS ===");
  for (const habit of habits) {
    const bucket = buckets.find((b) => b.id === habit.bucketId);
    const goal = goals.find((g) => g.id === habit.goalId);
    const bucketName = bucket?.name ?? "Unknown";
    const typeInfo = getTypeInfo(habit);
    const schedule = getScheduleDays(habit);
    const todayStatus = getTodayStatus(habit, completions);
    const streak = streaks[habit.id] ?? { currentStreak: 0, currentAntiStreak: 0 };

    const goalName = goal?.name ?? "No goal";
    lines.push(`- "${habit.name}" [${bucketName} → ${goalName}]`);
    lines.push(`  Type: ${typeInfo} | Schedule: ${schedule}`);
    lines.push(
      `  Today: ${todayStatus} | streak: ${streak.currentStreak} days, antistreak: ${streak.currentAntiStreak} days`
    );
  }

  // Today's summary
  const scheduledHabits = habits.filter((h) =>
    isScheduledForDate(h, formatTodayDate()) || completions.find((c) => c.habitId === h.id)?.completed
  );
  const completedHabits = scheduledHabits.filter((h) => {
    const completion = completions.find((c) => c.habitId === h.id);
    return completion?.completed === true;
  });
  const scheduledCount = scheduledHabits.length;
  const completedCount = completedHabits.length;
  const progress = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;

  lines.push("");
  lines.push("=== TODAY'S SUMMARY ===");
  lines.push(`Scheduled: ${scheduledCount} habits | Completed: ${completedCount}`);
  lines.push(`Progress: ${progress}%`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Models & types
// ---------------------------------------------------------------------------

export type AiModel =
  | "google/gemini-2.5-flash-lite"
  | "deepseek/deepseek-v3.2"
  | "meta-llama/llama-4-maverick";

export const AI_MODELS: { id: AiModel; label: string }[] = [
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
];

export interface RoutingInfo {
  specialist: string;
  model: string;
  label: string;
  description: string;
  reason: string;
}

export interface AgentResponse {
  content: string;
  routing: RoutingInfo;
}

// ---------------------------------------------------------------------------
// sendMessage — Manual model selection
// ---------------------------------------------------------------------------

export async function sendMessage(
  systemPrompt: string,
  messages: ChatMessage[],
  model?: AiModel
): Promise<string> {
  const aiChat = httpsCallable<
    { systemPrompt: string; messages: { role: string; content: string }[]; model?: string },
    { content: string }
  >(functions, "aiChat");

  const result = await aiChat({
    systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    model,
  });

  return result.data.content;
}

// ---------------------------------------------------------------------------
// sendAgentMessage — Agentic Router (Manager → Specialist)
// ---------------------------------------------------------------------------

export async function sendAgentMessage(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<AgentResponse> {
  const aiChatAgent = httpsCallable<
    { systemPrompt: string; messages: { role: string; content: string }[] },
    AgentResponse
  >(functions, "aiChatAgent");

  const result = await aiChatAgent({
    systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return result.data;
}
