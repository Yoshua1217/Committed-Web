"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Habit, HabitCompletion, Bucket, Goal } from "@/lib/types";
import {
  subscribeToHabits,
  subscribeToCompletionsForDate,
  saveHabit,
  createHabit,
  deleteHabit,
} from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { habitDay } from "@/lib/habit-history";
import { useToday } from "@/lib/use-today";
import TodayHabitsSidebar from "@/components/today-habits-sidebar";
import ProgressCard from "@/components/progress-card";
import HabitEditModal from "@/components/habit-edit-modal";
import HabitCompletionChart from "@/components/habit-completion-chart";

export default function HabitsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const today = useToday();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
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

  const day = habitDay(habits, completions, today);
  const scheduledHabits = day.habits;
  const todayProgress = day.progress;

  const handleSaveHabit = async (habit: Habit) => {
    try {
      if (editingHabit) await saveHabit(habit);
      else await createHabit(habit);
    } catch (err) {
      console.error("Failed to save habit:", err);
      throw err;
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    try {
      await deleteHabit(habitId);
    } catch (err) {
      console.error("Failed to delete habit:", err);
      throw err;
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
    <div style={{ padding: 32, maxWidth: 1280 }}>
      {/* Header */}
      <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Habits</h1>
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

      <div role="tablist" aria-label="Habit sections" className="flex items-center" style={{ width: "fit-content", padding: 4, marginBottom: 24, borderRadius: 14, backgroundColor: "var(--surface-variant)" }}>
        <button type="button" role="tab" aria-selected onClick={() => router.push("/dashboard/habits")} style={{ padding: "9px 16px", border: "none", borderRadius: 10, backgroundColor: "var(--surface)", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Overview</button>
        {([{ id: "bucket", label: "Card" }, { id: "list", label: "List" }, { id: "history", label: "History" }] as const).map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={false} onClick={() => router.push(`/dashboard/habits/manage?tab=${tab.id}`)} style={{ padding: "9px 16px", border: "none", borderRadius: 10, backgroundColor: "transparent", color: "var(--secondary)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{tab.label}</button>
        ))}
      </div>

      <div className="habits-page-grid flex flex-col lg:flex-row gap-8" style={{ alignItems: "flex-start" }}>
        <div className="flex-1 min-w-0">
          <div style={{ marginBottom: 24 }}>
            <ProgressCard totalScheduled={scheduledHabits.length} progressValue={todayProgress} />
          </div>
          {habits.length > 0 ? (
            <HabitCompletionChart userId={user?.uid ?? ""} todayCompletions={completions} animateTodayChange />
          ) : (
            <div className="text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 48 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)", margin: "0 0 4px" }}>No habits yet</p>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Create your first habit to start tracking.</p>
            </div>
          )}
        </div>

        <TodayHabitsSidebar habits={habits} completions={completions} buckets={buckets} goals={goals} today={today} userId={user?.uid ?? ""} onReorder={setHabits} />
      </div>

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
