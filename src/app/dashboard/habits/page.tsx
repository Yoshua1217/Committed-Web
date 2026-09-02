"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Habit, HabitCompletion, Bucket, Goal, ScheduledCheckIn } from "@/lib/types";
import {
  subscribeToHabits,
  subscribeToCompletionsForDate,
  todayString,
  toggleCheckbox,
  incrementCounter,
  addTimerSeconds,
  saveHabit,
  deleteHabit,
} from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { isScheduledForDate } from "@/lib/streak-calculator";
import HabitCard from "@/components/habit-card";
import ProgressCard from "@/components/progress-card";
import HabitEditModal from "@/components/habit-edit-modal";
import HabitCompletionChart from "@/components/habit-completion-chart";
import ScheduleCheckInModal from "@/components/schedule-checkin-modal";
import { scheduleHabitCheckIn, subscribeToScheduledCheckIns } from "@/lib/scheduled-checkins-service";

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

type CardPosition = Pick<DOMRect, "top" | "left" | "width" | "height">;

interface CompletionFlight {
  habit: Habit;
  origin: CardPosition;
  target: CardPosition;
}

export default function HabitsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const today = todayString();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [draggedHabitId, setDraggedHabitId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ habitId: string; position: "before" | "after" } | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(null);
  const [justCompletedHabitId, setJustCompletedHabitId] = useState<string | null>(null);
  const [completionFlight, setCompletionFlight] = useState<CompletionFlight | null>(null);
  const [scheduledCheckIns, setScheduledCheckIns] = useState<ScheduledCheckIn[]>([]);
  const [habitToSchedule, setHabitToSchedule] = useState<Habit | null>(null);
  const completionTransitionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedEntryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionOrigin = useRef<CardPosition | null>(null);
  const habitCardRefs = useRef(new Map<string, HTMLDivElement>());

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
    unsubs.push(subscribeToScheduledCheckIns(user.uid, setScheduledCheckIns));

    return () => unsubs.forEach((u) => u());
  }, [user, today]);

  useEffect(() => () => {
    if (completionTransitionTimeout.current) clearTimeout(completionTransitionTimeout.current);
    if (completedEntryTimeout.current) clearTimeout(completedEntryTimeout.current);
    if (flightTimeout.current) clearTimeout(flightTimeout.current);
  }, []);

  // Filter to today's scheduled habits
  const completionMap = new Map(completions.map((c) => [c.habitId, c]));
  const scheduledHabits = habits.filter((h) =>
    isScheduledForDate(h, today) || completionMap.get(h.id)?.completed
  );
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  const pendingCheckInForHabit = (habitId: string) => scheduledCheckIns.find((checkIn) => checkIn.status === "pending" && checkIn.sourceType === "habit" && checkIn.sourceId === habitId) ?? null;

  // Keep a newly checked card in place briefly so it can animate out before
  // React moves it into the completed group.
  const todoHabits = scheduledHabits.filter((h) => !completionMap.get(h.id)?.completed || h.id === completingHabitId);
  const doneHabits = scheduledHabits.filter((h) => completionMap.get(h.id)?.completed && h.id !== completingHabitId);
  const todayProgress = scheduledHabits.reduce((total, habit) => {
    const completion = completionMap.get(habit.id);
    if (habit.completionType === "counter" && habit.counterGoal > 0) {
      return total + Math.min((completion?.counterValue ?? 0) / habit.counterGoal, 1);
    }
    if (habit.completionType === "timer" && habit.timerGoalSeconds > 0) {
      return total + Math.min((completion?.timerSeconds ?? 0) / habit.timerGoalSeconds, 1);
    }
    return total + (completion?.completed ? 1 : 0);
  }, 0);

  const handleToggleCheckbox = async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    const isBeingCompleted = !existing?.completed;

    if (isBeingCompleted) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const pauseBeforeMove = 0;
      if (completionTransitionTimeout.current) clearTimeout(completionTransitionTimeout.current);
      if (completedEntryTimeout.current) clearTimeout(completedEntryTimeout.current);
      if (flightTimeout.current) clearTimeout(flightTimeout.current);
      const sourceCard = habitCardRefs.current.get(habit.id)?.getBoundingClientRect();
      completionOrigin.current = sourceCard
        ? { top: sourceCard.top, left: sourceCard.left, width: sourceCard.width, height: sourceCard.height }
        : null;
      setCompletingHabitId(habit.id);
      setJustCompletedHabitId(null);
      setCompletionFlight(null);
      completionTransitionTimeout.current = setTimeout(() => {
        setCompletingHabitId(null);
        setJustCompletedHabitId(habit.id);
        requestAnimationFrame(() => {
          const destinationCard = habitCardRefs.current.get(habit.id)?.getBoundingClientRect();
          const origin = completionOrigin.current;
          if (!origin || !destinationCard || prefersReducedMotion) {
            setJustCompletedHabitId(null);
            return;
          }
          setCompletionFlight({
            habit,
            origin,
            target: { top: destinationCard.top, left: destinationCard.left, width: destinationCard.width, height: destinationCard.height },
          });
          flightTimeout.current = setTimeout(() => {
            setCompletionFlight(null);
            setJustCompletedHabitId(null);
          }, 520);
        });
      }, pauseBeforeMove);
    }

    try {
      await toggleCheckbox(habit, today, existing);
    } catch (error) {
      if (completionTransitionTimeout.current) clearTimeout(completionTransitionTimeout.current);
      if (completedEntryTimeout.current) clearTimeout(completedEntryTimeout.current);
      if (flightTimeout.current) clearTimeout(flightTimeout.current);
      setCompletingHabitId(null);
      setJustCompletedHabitId(null);
      setCompletionFlight(null);
      console.error("Failed to update habit completion:", error);
    }
  };

  const handleIncrementCounter = async (habit: Habit) => {
    const existing = completionMap.get(habit.id) ?? null;
    await incrementCounter(habit, today, existing);
  };

  const handleAddTimerSeconds = async (habit: Habit, seconds: number) => {
    const existing = completionMap.get(habit.id) ?? null;
    await addTimerSeconds(habit, today, existing, seconds);
  };

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

  const handleDropHabit = async (targetHabitId: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceHabitId = draggedHabitId;
    setDraggedHabitId(null);
    setDropTarget(null);
    if (!sourceHabitId || sourceHabitId === targetHabitId || savingOrder) return;

    const sourceIndex = habits.findIndex((habit) => habit.id === sourceHabitId);
    const targetIndex = habits.findIndex((habit) => habit.id === targetHabitId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reordered = [...habits];
    const [movedHabit] = reordered.splice(sourceIndex, 1);
    const targetIndexAfterRemoval = reordered.findIndex((habit) => habit.id === targetHabitId);
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const insertAfterTarget = event.clientY > targetBounds.top + targetBounds.height / 2;
    reordered.splice(targetIndexAfterRemoval + (insertAfterTarget ? 1 : 0), 0, movedHabit);

    const savedOrder = reordered.map((habit, index) => ({ ...habit, sortOrder: index }));
    setHabits(savedOrder);
    setSavingOrder(true);
    try {
      await Promise.all(savedOrder.map((habit) => saveHabit(habit)));
    } catch (error) {
      console.error("Failed to save habit order:", error);
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDragOverHabit = (habitId: string, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!draggedHabitId || draggedHabitId === habitId) {
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropTarget({ habitId, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
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
            <ProgressCard totalScheduled={scheduledHabits.length} progressValue={todayProgress} completedNames={doneHabits.map((h) => h.name)} />
          </div>
          {habits.length > 0 ? (
            <HabitCompletionChart userId={user?.uid ?? ""} habits={habits} todayCompletions={completions} animateTodayChange />
          ) : (
            <div className="text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 48 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)", margin: "0 0 4px" }}>No habits yet</p>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Create your first habit to start tracking.</p>
            </div>
          )}
        </div>

        <aside className="home-habits w-full lg:w-80 shrink-0">
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--secondary)", margin: 0 }}>Today&apos;s Habits</h2>
            <span style={{ color: "var(--secondary)", fontSize: 11, fontWeight: 600 }}>{savingOrder ? "Saving…" : "Drag to order"}</span>
          </div>
          {todoHabits.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={sectionHeaderStyle}>To Do ({todoHabits.length})</h3>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {todoHabits.map((habit) => (
                  <div key={habit.id} ref={(element) => { if (element) habitCardRefs.current.set(habit.id, element); else habitCardRefs.current.delete(habit.id); }} draggable={!savingOrder} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedHabitId(habit.id); setDropTarget(null); }} onDragOver={(event) => handleDragOverHabit(habit.id, event)} onDragEnd={() => { setDraggedHabitId(null); setDropTarget(null); }} onDrop={(event) => void handleDropHabit(habit.id, event)} style={{ cursor: savingOrder ? "default" : "grab", opacity: draggedHabitId === habit.id ? 0.45 : 1, boxShadow: dropTarget?.habitId === habit.id ? dropTarget.position === "before" ? "0 -4px 0 #41e987" : "0 4px 0 #41e987" : "none", borderRadius: 16, transition: "opacity 0.15s ease, box-shadow 0.12s ease" }}>
                    <HabitCard habit={habit} completion={completionMap.get(habit.id) ?? null} bucket={bucketMap.get(habit.bucketId) ?? null} goal={goalMap.get(habit.goalId) ?? null} streak={null} onToggleCheckbox={() => handleToggleCheckbox(habit)} onIncrementCounter={() => handleIncrementCounter(habit)} onAddTimerSeconds={(seconds) => handleAddTimerSeconds(habit, seconds)} onScheduleCheckIn={() => setHabitToSchedule(habit)} pendingCheckInAt={pendingCheckInForHabit(habit.id)?.dueAt ?? null} completed={habit.id === completingHabitId} completionAnimation={habit.id === completingHabitId ? "confirming" : undefined} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {doneHabits.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ ...sectionHeaderStyle, color: "#4CAF50" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Completed ({doneHabits.length})
              </h3>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {doneHabits.map((habit) => (
                  <div key={habit.id} ref={(element) => { if (element) habitCardRefs.current.set(habit.id, element); else habitCardRefs.current.delete(habit.id); }} draggable={!savingOrder} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedHabitId(habit.id); setDropTarget(null); }} onDragOver={(event) => handleDragOverHabit(habit.id, event)} onDragEnd={() => { setDraggedHabitId(null); setDropTarget(null); }} onDrop={(event) => void handleDropHabit(habit.id, event)} className={habit.id === justCompletedHabitId ? "habit-card-flight-target" : undefined} style={{ cursor: savingOrder ? "default" : "grab", opacity: draggedHabitId === habit.id ? 0.45 : 1, boxShadow: dropTarget?.habitId === habit.id ? dropTarget.position === "before" ? "0 -4px 0 #41e987" : "0 4px 0 #41e987" : "none", borderRadius: 16, transition: "opacity 0.15s ease, box-shadow 0.12s ease" }}>
                    <HabitCard habit={habit} completion={completionMap.get(habit.id) ?? null} bucket={bucketMap.get(habit.bucketId) ?? null} goal={goalMap.get(habit.goalId) ?? null} streak={null} onToggleCheckbox={() => handleToggleCheckbox(habit)} onIncrementCounter={() => handleIncrementCounter(habit)} onAddTimerSeconds={(seconds) => handleAddTimerSeconds(habit, seconds)} onScheduleCheckIn={() => setHabitToSchedule(habit)} pendingCheckInAt={pendingCheckInForHabit(habit.id)?.dueAt ?? null} completed />
                  </div>
                ))}
              </div>
            </div>
          )}
          {todoHabits.length === 0 && (
            <div style={{ background: "#4CAF5010", border: "1px solid #4CAF5030", borderRadius: 20, padding: "28px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>&#10003;</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#4CAF50", margin: "0 0 4px" }}>All done for today!</p>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>{doneHabits.length} item{doneHabits.length !== 1 ? "s" : ""} completed. Stay committed.</p>
            </div>
          )}
        </aside>
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

      {completionFlight && (
        <div
          className="habit-card-flight"
          style={{
            left: completionFlight.origin.left,
            top: completionFlight.origin.top,
            width: completionFlight.origin.width,
            height: completionFlight.origin.height,
            "--flight-x": `${completionFlight.target.left - completionFlight.origin.left}px`,
            "--flight-y": `${completionFlight.target.top - completionFlight.origin.top}px`,
          } as React.CSSProperties}
        >
          <HabitCard habit={completionFlight.habit} completion={completionMap.get(completionFlight.habit.id) ?? null} bucket={bucketMap.get(completionFlight.habit.bucketId) ?? null} goal={goalMap.get(completionFlight.habit.goalId) ?? null} streak={null} onToggleCheckbox={() => {}} onIncrementCounter={() => {}} onAddTimerSeconds={() => {}} completed completionAnimation="confirming" />
        </div>
      )}
      {habitToSchedule && <ScheduleCheckInModal title={habitToSchedule.name} detail="We’ll keep this habit pending and ask whether you completed it when you next open the dashboard after your chosen time." onClose={() => setHabitToSchedule(null)} onSchedule={async (time) => { await scheduleHabitCheckIn(habitToSchedule, time); }} />}
    </div>
  );
}
