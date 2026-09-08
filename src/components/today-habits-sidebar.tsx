"use client";
import { useState, useEffect, useRef } from "react";
import type { Habit, HabitCompletion, Bucket, Goal, ScheduledCheckIn } from "@/lib/types";
import { toggleCheckbox, incrementCounter, addTimerSeconds, saveHabit } from "@/lib/habits-service";
import { habitDay } from "@/lib/habit-history";
import HabitCard from "@/components/habit-card";
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


export default function TodayHabitsSidebar({ habits, completions, buckets, goals, today, userId, onReorder }: {
  habits: Habit[]; completions: HabitCompletion[]; buckets: Bucket[]; goals: Goal[]; today: string; userId: string; onReorder: (habits: Habit[]) => void;
}) {
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


  useEffect(() => subscribeToScheduledCheckIns(userId, setScheduledCheckIns), [userId]);
  useEffect(() => () => {
    if (completionTransitionTimeout.current) clearTimeout(completionTransitionTimeout.current);
    if (completedEntryTimeout.current) clearTimeout(completedEntryTimeout.current);
    if (flightTimeout.current) clearTimeout(flightTimeout.current);
  }, []);

  // Filter to today's scheduled habits
  const completionMap = new Map(completions.filter((c) => c.date === today).map((c) => [c.habitId, c]));
  const day = habitDay(habits, completions, today);
  const scheduledHabits = day.habits;
  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  const pendingCheckInForHabit = (habitId: string) => scheduledCheckIns.find((checkIn) => checkIn.status === "pending" && checkIn.sourceType === "habit" && checkIn.sourceId === habitId) ?? null;

  // Keep a newly checked card in place briefly so it can animate out before
  // React moves it into the completed group.
  const todoHabits = scheduledHabits.filter((h) => !completionMap.get(h.id)?.completed || h.id === completingHabitId);
  const doneHabits = scheduledHabits.filter((h) => completionMap.get(h.id)?.completed && h.id !== completingHabitId);

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
    onReorder(savedOrder);
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


  return <>
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
              <p style={{ fontSize: 15, fontWeight: 700, color: "#4CAF50", margin: "0 0 4px" }}>{scheduledHabits.length ? "All done for today!" : "No habits scheduled today"}</p>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>{doneHabits.length} item{doneHabits.length !== 1 ? "s" : ""} completed. Stay committed.</p>
            </div>
          )}
        </aside>

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

  </>;
}
