"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Habit, HabitCompletion, Bucket, Goal, StreakInfo } from "@/lib/types";
import {
  subscribeToHabits,
  subscribeToCompletionsForDate,
  todayString,
  toggleCheckbox,
  incrementCounter,
  addTimerSeconds,
  saveHabit,
  deleteHabit,
  getCompletionsForHabit,
} from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { calculateStreak, isScheduledForDate } from "@/lib/streak-calculator";
import HabitCard from "@/components/habit-card";
import ProgressCard from "@/components/progress-card";
import CongratsPopup from "@/components/congrats-popup";
import HabitEditModal from "@/components/habit-edit-modal";

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--secondary)",
  margin: 0,
  marginBottom: 10,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export default function HabitsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const today = todayString();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [streaks, setStreaks] = useState<Record<string, StreakInfo>>({});
  const [loading, setLoading] = useState(true);
  const [congratsHabit, setCongratsHabit] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  // Subscribe to real-time data
  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribeToHabits(user.uid, (h) => {
      setHabits(h);
      setLoading(false);
    }));

    unsubs.push(subscribeToCompletionsForDate(user.uid, today, (c) => {
      setCompletions(c);
    }));

    unsubs.push(subscribeToBuckets(user.uid, (b) => {
      setBuckets(b);
    }));

    unsubs.push(subscribeToGoals(user.uid, (g) => {
      setGoals(g);
    }));

    return () => unsubs.forEach((u) => u());
  }, [user, today]);

  // Refresh streaks
  const [streakVersion, setStreakVersion] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setStreakVersion((v) => v + 1), 500);
    return () => clearTimeout(timer);
  }, [completions]);

  useEffect(() => {
    if (habits.length === 0) return;
    let cancelled = false;

    async function refresh() {
      const results = await Promise.all(
        habits.map(async (habit) => {
          try {
            const hCompletions = await getCompletionsForHabit(habit.userId, habit.id);
            return [habit.id, calculateStreak(habit, hCompletions)] as const;
          } catch {
            return [habit.id, { currentStreak: 0, currentAntiStreak: 0 }] as const;
          }
        })
      );
      if (!cancelled) {
        const newStreaks: Record<string, StreakInfo> = {};
        for (const [id, info] of results) newStreaks[id] = info;
        setStreaks(newStreaks);
      }
    }

    refresh();
    return () => { cancelled = true; };
  }, [habits, streakVersion]);

  // Filter to today's scheduled habits
  const completionMap = new Map(completions.map((c) => [c.habitId, c]));
  const scheduledHabits = habits.filter((h) =>
    isScheduledForDate(h, today) || completionMap.get(h.id)?.completed
  );
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));

  const todoHabits = scheduledHabits.filter((h) => !completionMap.get(h.id)?.completed);
  const doneHabits = scheduledHabits.filter((h) => completionMap.get(h.id)?.completed);

  const handleToggleCheckbox = useCallback(async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    const result = await toggleCheckbox(habit, today, existing);
    if (result.completed) setCongratsHabit(habit.name);
  }, [completions, today]);

  const handleIncrementCounter = useCallback(async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    const result = await incrementCounter(habit, today, existing);
    if (result.completed && !existing?.completed) setCongratsHabit(habit.name);
  }, [completions, today]);

  const handleAddTimerSeconds = useCallback(async (habit: Habit, seconds: number) => {
    const existing = completionMap.get(habit.id) ?? null;
    const result = await addTimerSeconds(habit, today, existing, seconds);
    if (result.completed && !existing?.completed) setCongratsHabit(habit.name);
  }, [completions, today]);

  const handleSaveHabit = async (habit: Habit) => {
    try {
      await saveHabit(habit);
    } catch (err) {
      console.error("Failed to save habit:", err);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    try {
      await deleteHabit(habitId);
    } catch (err) {
      console.error("Failed to delete habit:", err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 720 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", marginBottom: 24, marginTop: 0 }}>Habits</h1>
        <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      {/* Header */}
      <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Habits</h1>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/dashboard/habits/manage")}
            style={{
              backgroundColor: "var(--surface-variant)",
              color: "var(--secondary)",
              border: "none",
              cursor: "pointer",
              borderRadius: 14,
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 16,
              paddingRight: 16,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Manage
          </button>
          <button
            onClick={() => { setEditingHabit(null); setModalOpen(true); }}
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--background)",
              border: "none",
              cursor: "pointer",
              borderRadius: 14,
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 20,
              paddingRight: 20,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            + New
          </button>
        </div>
      </div>

      {/* Today's Progress */}
      <div style={{ marginBottom: 24 }}>
        <ProgressCard
          totalScheduled={scheduledHabits.length}
          completedCount={doneHabits.length}
          completedNames={doneHabits.map((h) => h.name)}
        />
      </div>

      {/* Empty state */}
      {habits.length === 0 && (
        <div
          className="text-center"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            paddingTop: 48,
            paddingBottom: 48,
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)", margin: 0, marginBottom: 4 }}>No habits yet</p>
          <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Create your first habit to start tracking.</p>
        </div>
      )}

      {/* TO DO section */}
      {todoHabits.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionHeaderStyle}>
            To Do
          </h2>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {todoHabits.map((habit) => (
              <div key={habit.id} onClick={() => { setEditingHabit(habit); setModalOpen(true); }} style={{ cursor: "pointer" }}>
                <HabitCard
                  habit={habit}
                  completion={completionMap.get(habit.id) ?? null}
                  bucket={bucketMap.get(habit.bucketId) ?? null}
                  goal={goalMap.get(habit.goalId) ?? null}
                  streak={streaks[habit.id] ?? null}
                  onToggleCheckbox={() => handleToggleCheckbox(habit)}
                  onIncrementCounter={() => handleIncrementCounter(habit)}
                  onAddTimerSeconds={(s) => handleAddTimerSeconds(habit, s)}
                  completed={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPLETED section */}
      {doneHabits.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ ...sectionHeaderStyle, color: "#4CAF50" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Completed
          </h2>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {doneHabits.map((habit) => (
              <div key={habit.id} onClick={() => { setEditingHabit(habit); setModalOpen(true); }} style={{ cursor: "pointer" }}>
                <HabitCard
                  habit={habit}
                  completion={completionMap.get(habit.id) ?? null}
                  bucket={bucketMap.get(habit.bucketId) ?? null}
                  goal={goalMap.get(habit.goalId) ?? null}
                  streak={streaks[habit.id] ?? null}
                  onToggleCheckbox={() => handleToggleCheckbox(habit)}
                  onIncrementCounter={() => handleIncrementCounter(habit)}
                  onAddTimerSeconds={(s) => handleAddTimerSeconds(habit, s)}
                  completed={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No scheduled habits today (but habits exist) */}
      {habits.length > 0 && scheduledHabits.length === 0 && (
        <div
          className="text-center"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            paddingTop: 48,
            paddingBottom: 48,
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>No habits scheduled for today</p>
        </div>
      )}

      {/* Congrats popup */}
      <CongratsPopup habitName={congratsHabit} onDismiss={() => setCongratsHabit(null)} />

      {/* Edit/Create Modal */}
      <HabitEditModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingHabit(null); }}
        onSave={handleSaveHabit}
        onDelete={handleDeleteHabit}
        habit={editingHabit}
        goals={goals}
        buckets={buckets}
        userId={user?.uid ?? ""}
        nextSortOrder={habits.length}
      />
    </div>
  );
}
