"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Habit, HabitCompletion, Bucket, Goal, DailyLog } from "@/lib/types";
import {
  subscribeToHabits,
  subscribeToCompletionsForDate,
  todayString,
  toggleCheckbox,
  incrementCounter,
  addTimerSeconds,
} from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { isScheduledForDate } from "@/lib/streak-calculator";
import { getProgressColor } from "@/lib/progress-color";
import HabitCard from "@/components/habit-card";
import MaterialIcon from "@/components/material-icon";
import DailyLogCard from "@/components/daily-log-card";
import DailyLogModal from "@/components/daily-log-modal";
import { saveDailyLog, subscribeToDailyLog } from "@/lib/daily-log-service";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

function offsetIsoDate(date: string, dayOffset: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + dayOffset);
  const shiftedMonth = String(shifted.getMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getDate()).padStart(2, "0");
  return `${shifted.getFullYear()}-${shiftedMonth}-${shiftedDay}`;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const displayName = user?.displayName || user?.email?.split("@")[0] || "there";

  const today = todayString();
  const previousDate = offsetIsoDate(today, -1);
  const now = new Date();
  const dateStr = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [previousDailyLog, setPreviousDailyLog] = useState<DailyLog | null>(null);
  const [dailyLogOpen, setDailyLogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeToHabits(user.uid, (h) => { setHabits(h); setLoading(false); }));
    unsubs.push(subscribeToCompletionsForDate(user.uid, today, (c) => setCompletions(c)));
    unsubs.push(subscribeToBuckets(user.uid, (b) => setBuckets(b)));
    unsubs.push(subscribeToGoals(user.uid, (g) => setGoals(g)));
    unsubs.push(subscribeToDailyLog(user.uid, today, setDailyLog));
    unsubs.push(subscribeToDailyLog(user.uid, previousDate, setPreviousDailyLog));
    return () => unsubs.forEach((u) => u());
  }, [user, today, previousDate]);

  const completionMap = new Map(completions.map((c) => [c.habitId, c]));
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));

  const scheduledHabits = habits.filter((h) =>
    isScheduledForDate(h, today) || completionMap.get(h.id)?.completed
  );
  const todoHabits = scheduledHabits.filter((h) => !completionMap.get(h.id)?.completed);
  const doneHabits = scheduledHabits.filter((h) => completionMap.get(h.id)?.completed);
  const dailyLogCompleted = dailyLog?.completed === true;
  const dailyLogHasAnswers = !!dailyLog && [
    dailyLog.grateful,
    dailyLog.learned,
    dailyLog.struggled,
    dailyLog.improveTomorrow,
  ].some((answer) => answer.trim().length > 0);
  const todoCount = todoHabits.length + (dailyLogCompleted ? 0 : 1);
  const completedCount = doneHabits.length + (dailyLogCompleted ? 1 : 0);
  const previousCommitment = previousDailyLog?.improveTomorrow.trim() ?? "";
  // Calculate progress: counter/timer habits contribute fractionally
  const progressSum = scheduledHabits.reduce((sum, h) => {
    const comp = completionMap.get(h.id);
    if (comp?.completed) return sum + 1;
    if (!comp) return sum;
    if (h.completionType === "counter" && h.counterGoal > 0) {
      return sum + Math.min((comp.counterValue ?? 0) / h.counterGoal, 1);
    }
    if (h.completionType === "timer" && h.timerGoalSeconds > 0) {
      return sum + Math.min((comp.timerSeconds ?? 0) / h.timerGoalSeconds, 1);
    }
    return sum;
  }, 0);
  const pct = scheduledHabits.length > 0 ? Math.round((progressSum / scheduledHabits.length) * 100) : 0;
  const progressColor = getProgressColor(pct);

  const handleToggleCheckbox = async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    await toggleCheckbox(habit, today, existing);
  };

  const handleIncrementCounter = async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    await incrementCounter(habit, today, existing);
  };

  const handleAddTimerSeconds = async (habit: Habit, seconds: number) => {
    const existing = completionMap.get(habit.id) ?? null;
    await addTimerSeconds(habit, today, existing, seconds);
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Greeting + Date */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)", margin: 0, marginBottom: 4 }}>
          Welcome back, {displayName}
        </h1>
        <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>
          {dateStr}
        </p>
      </div>

      {/* Two-column layout: left = overview, right = today's habits */}
      <div className="flex flex-col lg:flex-row gap-8" style={{ alignItems: "flex-start" }}>

        {/* LEFT COLUMN */}
        <div className="flex-1 min-w-0">
          {/* Today's Progress Summary */}
          {!loading && scheduledHabits.length > 0 && (
            <>
              <div
                style={{
                  background: pct >= 100 ? "#4CAF5010" : "var(--surface)",
                  border: `1px solid ${pct >= 100 ? "#4CAF5040" : "var(--border)"}`,
                  borderRadius: 20,
                  padding: 24,
                  marginBottom: previousCommitment ? 12 : 24,
                }}
              >
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>Today&apos;s Progress</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: progressColor }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 9999, backgroundColor: "var(--surface-variant)", position: "relative" }}>
                <div style={{
                  height: "100%",
                  borderRadius: 9999,
                  width: `${Math.min(pct, 100)}%`,
                  backgroundColor: progressColor,
                  transition: "width 0.5s ease, background-color 0.3s ease",
                }} />
                {pct === 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: progressColor,
                      transform: "translateY(-50%)",
                      boxShadow: "0 0 0 3px var(--surface)",
                    }}
                  />
                )}
              </div>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, marginTop: 10 }}>
                {doneHabits.length} of {scheduledHabits.length} habits completed
              </p>
              </div>
              {previousCommitment && (
                <p
                  style={{
                    margin: "0 4px 24px",
                    color: "var(--secondary)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    overflowWrap: "anywhere",
                  }}
                >
                  &ldquo;{previousCommitment}&rdquo;
                </p>
              )}
            </>
          )}

          {/* Buckets */}
          {buckets.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--secondary)", margin: 0 }}>
                  Your Buckets
                </h2>
                <button
                  onClick={() => router.push("/dashboard/buckets")}
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--secondary)", background: "none", border: "none", cursor: "pointer" }}
                >
                  View all &rarr;
                </button>
              </div>
              <div className="flex gap-3" style={{ overflowX: "auto", paddingBottom: 4 }}>
                {buckets.map((bucket) => {
                  const hex = argbToHex(bucket.color);
                  return (
                    <div
                      key={bucket.id}
                      onClick={() => router.push("/dashboard/buckets")}
                      className="shrink-0 flex items-center gap-3"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: "12px 16px",
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                      }}
                    >
                      <div
                        className="flex items-center justify-center"
                        style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: hex + "20" }}
                      >
                        <MaterialIcon name={bucket.iconName} size={18} color={hex} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>
                        {bucket.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Goals with descriptions */}
          {goals.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--secondary)", margin: 0 }}>
                  Your Goals
                </h2>
                <button
                  onClick={() => router.push("/dashboard/goals")}
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--secondary)", background: "none", border: "none", cursor: "pointer" }}
                >
                  View all &rarr;
                </button>
              </div>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {goals.map((goal) => {
                  const bucket = bucketMap.get(goal.bucketId);
                  const hex = bucket ? argbToHex(bucket.color) : "var(--secondary)";
                  return (
                    <div
                      key={goal.id}
                      onClick={() => router.push("/dashboard/goals")}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        padding: "16px 18px",
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="shrink-0 flex items-center justify-center rounded-full"
                          style={{ width: 38, height: 38, backgroundColor: hex + "20" }}
                        >
                          <MaterialIcon name={goal.iconName} size={20} color={hex} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--primary)", margin: 0 }}>
                              {goal.name}
                            </p>
                            {bucket && (
                              <span style={{ fontSize: 11, color: hex, fontWeight: 500 }}>
                                {bucket.name}
                              </span>
                            )}
                          </div>
                          {goal.description && (
                            <p style={{
                              fontSize: 13,
                              color: "var(--secondary)",
                              margin: 0,
                              marginTop: 4,
                              lineHeight: 1.5,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}>
                              {goal.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No habits at all */}
          {!loading && habits.length === 0 && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "36px 24px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)", margin: 0, marginBottom: 4 }}>
                No habits yet
              </p>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, marginBottom: 16 }}>
                Create your first habit to start tracking.
              </p>
              <button
                onClick={() => router.push("/dashboard/habits")}
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--background)",
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Get Started
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — Today's Habits */}
        {!loading && (
          <div className="w-full lg:w-96 shrink-0">
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--secondary)", margin: 0 }}>
                Today&apos;s Habits
              </h2>
              <button
                onClick={() => router.push("/dashboard/habits")}
                style={{ fontSize: 13, fontWeight: 500, color: "var(--secondary)", background: "none", border: "none", cursor: "pointer" }}
              >
                View all &rarr;
              </button>
            </div>

            {/* To Do */}
            {todoCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--secondary)",
                  margin: 0,
                  marginBottom: 8,
                }}>
                  To Do ({todoCount})
                </h3>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {todoHabits.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      completion={completionMap.get(habit.id) ?? null}
                      bucket={bucketMap.get(habit.bucketId) ?? null}
                      goal={goalMap.get(habit.goalId) ?? null}
                      streak={null}
                      onToggleCheckbox={() => handleToggleCheckbox(habit)}
                      onIncrementCounter={() => handleIncrementCounter(habit)}
                      onAddTimerSeconds={(s) => handleAddTimerSeconds(habit, s)}
                      completed={false}
                    />
                  ))}
                  {!dailyLogCompleted && (
                    <DailyLogCard
                      completed={false}
                      hasAnswers={dailyLogHasAnswers}
                      onClick={() => setDailyLogOpen(true)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Completed */}
            {completedCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#4CAF50",
                  margin: 0,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Completed ({completedCount})
                </h3>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  {doneHabits.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      completion={completionMap.get(habit.id) ?? null}
                      bucket={bucketMap.get(habit.bucketId) ?? null}
                      goal={goalMap.get(habit.goalId) ?? null}
                      streak={null}
                      onToggleCheckbox={() => handleToggleCheckbox(habit)}
                      onIncrementCounter={() => handleIncrementCounter(habit)}
                      onAddTimerSeconds={(s) => handleAddTimerSeconds(habit, s)}
                      completed={true}
                    />
                  ))}
                  {dailyLogCompleted && (
                    <DailyLogCard
                      completed={true}
                      hasAnswers={dailyLogHasAnswers}
                      onClick={() => setDailyLogOpen(true)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* All done state */}
            {todoCount === 0 && (
              <div
                style={{
                  background: "#4CAF5010",
                  border: "1px solid #4CAF5030",
                  borderRadius: 20,
                  padding: "28px 20px",
                  textAlign: "center",
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 6 }}>&#10003;</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#4CAF50", margin: 0, marginBottom: 4 }}>
                  All done for today!
                </p>
                <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>
                  {completedCount} item{completedCount !== 1 ? "s" : ""} completed. Stay committed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      {user && (
        <DailyLogModal
          isOpen={dailyLogOpen}
          dailyLog={dailyLog}
          userId={user.uid}
          date={today}
          onSave={saveDailyLog}
          onClose={() => setDailyLogOpen(false)}
        />
      )}
    </div>
  );
}
