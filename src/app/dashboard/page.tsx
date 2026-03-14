"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Habit, HabitCompletion, Bucket, Goal } from "@/lib/types";
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
import { isScheduledForDay } from "@/lib/streak-calculator";
import HabitCard from "@/components/habit-card";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

function jsDayToOurDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const quickLinks = [
  { label: "Buckets", href: "/dashboard/buckets", icon: "category" },
  { label: "Goals", href: "/dashboard/goals", icon: "flag" },
  { label: "Habits", href: "/dashboard/habits", icon: "loop" },
  { label: "Tasks", href: "/dashboard/tasks", icon: "task_alt" },
];

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const displayName = user?.displayName || user?.email?.split("@")[0] || "there";

  const today = todayString();
  const todayDow = jsDayToOurDay(new Date().getDay());
  const now = new Date();
  const dateStr = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeToHabits(user.uid, (h) => { setHabits(h); setLoading(false); }));
    unsubs.push(subscribeToCompletionsForDate(today, (c) => setCompletions(c)));
    unsubs.push(subscribeToBuckets(user.uid, (b) => setBuckets(b)));
    unsubs.push(subscribeToGoals(user.uid, (g) => setGoals(g)));
    return () => unsubs.forEach((u) => u());
  }, [user, today]);

  const completionMap = new Map(completions.map((c) => [c.habitId, c]));
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));

  const scheduledHabits = habits.filter((h) => isScheduledForDay(h, todayDow));
  const todoHabits = scheduledHabits.filter((h) => !completionMap.get(h.id)?.completed);
  const doneHabits = scheduledHabits.filter((h) => completionMap.get(h.id)?.completed);
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

  const handleToggleCheckbox = useCallback(async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    await toggleCheckbox(habit, today, existing);
  }, [completions, today]);

  const handleIncrementCounter = useCallback(async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    await incrementCounter(habit, today, existing);
  }, [completions, today]);

  const handleAddTimerSeconds = useCallback(async (habit: Habit, seconds: number) => {
    const existing = completionMap.get(habit.id) ?? null;
    await addTimerSeconds(habit, today, existing, seconds);
  }, [completions, today]);

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
          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 28 }}>
            {quickLinks.map((link) => (
              <div
                key={link.label}
                onClick={() => router.push(link.href)}
                style={{
                  background: "var(--surface)",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  padding: "16px 18px",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-rounded" style={{ fontSize: 22, color: "var(--primary)" }}>
                      {link.icon}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--primary)" }}>
                      {link.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 16, color: "var(--secondary)" }}>&rarr;</span>
                </div>
              </div>
            ))}
          </div>

          {/* Today's Progress Summary */}
          {!loading && scheduledHabits.length > 0 && (
            <div
              style={{
                background: pct >= 100 ? "#4CAF5010" : "var(--surface)",
                border: `1px solid ${pct >= 100 ? "#4CAF5040" : "var(--border)"}`,
                borderRadius: 20,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>Today&apos;s Progress</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: pct >= 100 ? "#4CAF50" : "var(--primary)" }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 9999, backgroundColor: "var(--surface-variant)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  borderRadius: 9999,
                  width: `${Math.min(pct, 100)}%`,
                  backgroundColor: pct >= 100 ? "#4CAF50" : "var(--primary)",
                  transition: "width 0.5s ease",
                }} />
              </div>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, marginTop: 10 }}>
                {doneHabits.length} of {scheduledHabits.length} habits completed
              </p>
            </div>
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
        {!loading && scheduledHabits.length > 0 && (
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
            {todoHabits.length > 0 && (
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
                  To Do ({todoHabits.length})
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
                </div>
              </div>
            )}

            {/* Completed */}
            {doneHabits.length > 0 && (
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
                  Completed ({doneHabits.length})
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
                </div>
              </div>
            )}

            {/* All done state */}
            {todoHabits.length === 0 && (
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
                  {scheduledHabits.length} habit{scheduledHabits.length !== 1 ? "s" : ""} completed. Stay committed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
