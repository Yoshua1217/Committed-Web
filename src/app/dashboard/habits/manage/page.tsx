"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Habit, HabitCompletion, Bucket, Goal } from "@/lib/types";
import {
  subscribeToHabits,
  saveHabit,
  deleteHabit,
  getCompletionsForDate,
  saveCompletion,
  generateId,
} from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { isHabitPausedOnDate, isScheduledForDate } from "@/lib/streak-calculator";
import HabitEditModal from "@/components/habit-edit-modal";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_KEYS: (keyof Pick<Habit, "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday">)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const TYPE_LABELS: Record<string, string> = {
  checkbox: "Checkbox",
  counter: "Counter",
  timer: "Timer",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--secondary)",
  marginBottom: 12,
  marginTop: 0,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function dateToString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Generate past N days (excluding today) */
function getPastDays(count: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(dateToString(d));
  }
  return days;
}

interface DayData {
  date: string;
  completions: HabitCompletion[];
  scheduled: number;
  completed: number;
  loading: boolean;
}

export default function ManageHabitsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // History state
  const [historyDays] = useState(() => getPastDays(14));
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData>>({});
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editCompletions, setEditCompletions] = useState<Record<string, boolean>>({});
  const [savingDay, setSavingDay] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeToHabits(user.uid, (h) => { setHabits(h); setLoading(false); }));
    unsubs.push(subscribeToBuckets(user.uid, (b) => setBuckets(b)));
    unsubs.push(subscribeToGoals(user.uid, (g) => setGoals(g)));
    return () => unsubs.forEach((u) => u());
  }, [user]);

  // Load history data when habits are available
  useEffect(() => {
    if (!user || habits.length === 0) return;
    historyDays.forEach((dateStr) => {
      // Only load if not already loaded
      setDayDataMap((prev) => {
        if (prev[dateStr] && !prev[dateStr].loading) return prev;
        return { ...prev, [dateStr]: { date: dateStr, completions: [], scheduled: 0, completed: 0, loading: true } };
      });

      getCompletionsForDate(user.uid, dateStr).then((completions) => {
        const completionMap = new Map(completions.map((c) => [c.habitId, c]));
        const scheduled = habits.filter((h) =>
          isScheduledForDate(h, dateStr) || completionMap.get(h.id)?.completed
        );
        const completedCount = scheduled.filter((h) => completionMap.get(h.id)?.completed).length;

        setDayDataMap((prev) => ({
          ...prev,
          [dateStr]: {
            date: dateStr,
            completions,
            scheduled: scheduled.length,
            completed: completedCount,
            loading: false,
          },
        }));
      });
    });
  }, [habits, historyDays, user]);

  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));

  const grouped = {
    checkbox: habits.filter((h) => h.completionType === "checkbox"),
    counter: habits.filter((h) => h.completionType === "counter"),
    timer: habits.filter((h) => h.completionType === "timer"),
  };

  const handleSave = async (habit: Habit) => {
    try { await saveHabit(habit); } catch (err) { console.error(err); }
  };

  const handleDelete = async (habitId: string) => {
    setDeleteConfirm(null);
    try { await deleteHabit(habitId); } catch (err) { console.error(err); }
  };

  const handleTogglePause = async (habit: Habit) => {
    const today = dateToString(new Date());
    const periods = [...(habit.pausePeriods ?? [])];
    const openIndex = periods.findIndex((period) => period.endedOn === null);

    if (openIndex >= 0) {
      if (periods[openIndex].startedOn === today) {
        periods.splice(openIndex, 1);
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        periods[openIndex] = { ...periods[openIndex], endedOn: dateToString(yesterday) };
      }
    } else {
      periods.push({ startedOn: today, endedOn: null });
    }

    await saveHabit({ ...habit, pausePeriods: periods });
  };

  const openDayEditor = (dateStr: string) => {
    const dayData = dayDataMap[dateStr];
    if (!dayData || dayData.loading) return;

    const completionMap = new Map(dayData.completions.map((c) => [c.habitId, c]));
    const scheduled = habits.filter((h) =>
      isScheduledForDate(h, dateStr) || completionMap.get(h.id)?.completed
    );

    const initial: Record<string, boolean> = {};
    scheduled.forEach((h) => {
      initial[h.id] = completionMap.get(h.id)?.completed ?? false;
    });

    setEditCompletions(initial);
    setEditingDay(dateStr);
  };

  const handleSaveDay = useCallback(async () => {
    if (!editingDay) return;
    setSavingDay(true);

    const dayData = dayDataMap[editingDay];
    const completionMap = new Map(dayData.completions.map((c) => [c.habitId, c]));

    const promises: Promise<void>[] = [];
    for (const [habitId, completed] of Object.entries(editCompletions)) {
      const existing = completionMap.get(habitId);
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) continue;

      const completion: HabitCompletion = existing
        ? { ...existing, completed, completedAt: completed ? (existing.completedAt ?? Date.now()) : null }
        : {
            id: generateId(),
            habitId,
            date: editingDay,
            completed,
            counterValue: 0,
            timerSeconds: 0,
            completedAt: completed ? Date.now() : null,
            userId: habit.userId,
          };
      promises.push(saveCompletion(completion));
    }

    await Promise.all(promises);

    // Refresh this day's data
    if (!user) {
      setSavingDay(false);
      return;
    }
    const freshCompletions = await getCompletionsForDate(user.uid, editingDay);
    const freshMap = new Map(freshCompletions.map((c) => [c.habitId, c]));
    const scheduled = habits.filter((h) =>
      isScheduledForDate(h, editingDay) || freshMap.get(h.id)?.completed
    );
    const completedCount = scheduled.filter((h) => freshMap.get(h.id)?.completed).length;

    setDayDataMap((prev) => ({
      ...prev,
      [editingDay]: {
        date: editingDay,
        completions: freshCompletions,
        scheduled: scheduled.length,
        completed: completedCount,
        loading: false,
      },
    }));

    setSavingDay(false);
    setEditingDay(null);
  }, [editingDay, editCompletions, dayDataMap, habits, user]);

  // Get scheduled habits for the editing day
  const editingDayScheduled = editingDay
    ? (() => {
        const completionMap = new Map(dayDataMap[editingDay]?.completions.map((c) => [c.habitId, c]) ?? []);
        return habits.filter((h) =>
          isScheduledForDate(h, editingDay) || completionMap.get(h.id)?.completed
        );
      })()
    : [];

  if (loading) {
    return (
      <div style={{ padding: 32, width: "100%" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", marginBottom: 24, marginTop: 0 }}>Manage Habits</h1>
        <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, width: "100%" }}>
      {/* Header */}
      <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/habits")}
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: "var(--surface-variant)",
              color: "var(--secondary)",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Manage Habits</h1>
        </div>
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
          <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>No habits created yet.</p>
        </div>
      )}

      {/* Groups by type */}
      {(["checkbox", "counter", "timer"] as const).map((type) => {
        const items = grouped[type];
        if (items.length === 0) return null;
        const today = dateToString(new Date());
        const activeItems = items.filter((habit) => !isHabitPausedOnDate(habit, today));
        const pausedItems = items.filter((habit) => isHabitPausedOnDate(habit, today));
        const orderedItems = [...activeItems, ...pausedItems];

        return (
          <div key={type} style={{ marginBottom: 32 }}>
            <h2 style={sectionHeaderStyle}>
              {TYPE_LABELS[type]} ({items.length})
            </h2>
            <div className="habit-manage-grid">
              {orderedItems.map((habit, index) => {
                const goal = goalMap.get(habit.goalId);
                const bucket = goal ? bucketMap.get(goal.bucketId) : bucketMap.get(habit.bucketId);
                const isDeleting = deleteConfirm === habit.id;
                const isPaused = isHabitPausedOnDate(habit, dateToString(new Date()));

                return (
                  <Fragment key={habit.id}>
                  {index === activeItems.length && pausedItems.length > 0 && (
                    <div
                      className="flex items-center gap-2"
                      style={{
                        gridColumn: "1 / -1",
                        marginTop: activeItems.length > 0 ? 12 : 0,
                        color: "var(--secondary)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      <span>Paused</span>
                      <span style={{ opacity: 0.55 }}>({pausedItems.length})</span>
                      <span style={{ height: 1, flex: 1, backgroundColor: "var(--border)" }} />
                    </div>
                  )}
                  <div
                    className="flex items-center gap-3"
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                      paddingTop: 16,
                      paddingBottom: 16,
                      paddingLeft: 20,
                      paddingRight: 20,
                      cursor: "pointer",
                    }}
                    onClick={() => { setEditingHabit(habit); setModalOpen(true); }}
                  >
                    {(goal || bucket) && (
                      <div
                        className="shrink-0 flex items-center justify-center rounded-full"
                        style={{
                          width: 36,
                          height: 36,
                          backgroundColor: bucket ? argbToHex(bucket.color) + "20" : "var(--surface-variant)",
                        }}
                      >
                        <MaterialIcon
                          name={goal?.iconName || bucket?.iconName || "Category"}
                          size={20}
                          color={bucket ? argbToHex(bucket.color) : "var(--secondary)"}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--primary)",
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {habit.name}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--secondary)", margin: 0, marginTop: 2 }}>
                        {goal?.name ?? bucket?.name ?? "No goal"}
                        {habit.completionType === "counter" && ` · +${habit.counterIncrement} → ${habit.counterGoal}`}
                        {habit.completionType === "timer" && ` · ${Math.floor(habit.timerGoalSeconds / 60)}m goal`}
                      </p>
                      <div className="flex gap-1" style={{ marginTop: 6 }}>
                        {DAY_KEYS.map((key, i) => (
                          <span
                            key={key}
                            className="flex items-center justify-center rounded-full"
                            style={{
                              width: 20,
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              backgroundColor: habit[key] ? "var(--primary)" : "var(--surface-variant)",
                              color: habit[key] ? "var(--background)" : "var(--secondary)",
                            }}
                          >
                            {DAY_LABELS[i]}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      title={isPaused ? "Unpause habit" : "Pause habit"}
                      aria-label={isPaused ? "Unpause habit" : "Pause habit"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleTogglePause(habit);
                      }}
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        color: isPaused ? "#4CAF50" : "var(--secondary)",
                        backgroundColor: isPaused ? "#4CAF5015" : "transparent",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: 12,
                        padding: 8,
                      }}
                    >
                      {isPaused ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      )}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isDeleting) {
                          handleDelete(habit.id);
                        } else {
                          setDeleteConfirm(habit.id);
                          setTimeout(() => setDeleteConfirm(null), 3000);
                        }
                      }}
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        color: isDeleting ? "var(--primary)" : "var(--secondary)",
                        backgroundColor: isDeleting ? "var(--error)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: 12,
                        padding: 8,
                        fontSize: 13,
                        fontWeight: isDeleting ? 600 : 400,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {isDeleting ? "Confirm" : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* History Section */}
      {/* ═══════════════════════════════════════════════════════ */}
      {habits.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h2 style={sectionHeaderStyle}>History (Past 14 Days)</h2>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {historyDays.map((dateStr) => {
              const data = dayDataMap[dateStr];
              const pct = data && data.scheduled > 0
                ? Math.round((data.completed / data.scheduled) * 100)
                : 0;
              const allDone = data && data.scheduled > 0 && data.completed === data.scheduled;
              const isToday = false; // these are past days

              return (
                <div
                  key={dateStr}
                  className="flex items-center gap-4"
                  style={{
                    backgroundColor: allDone ? "#4CAF5008" : "var(--surface)",
                    border: `1px solid ${allDone ? "#4CAF5030" : "var(--border)"}`,
                    borderRadius: 16,
                    padding: "14px 20px",
                  }}
                >
                  {/* Date info */}
                  <div className="flex-1 min-w-0">
                    <p style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--primary)",
                      margin: 0,
                    }}>
                      {formatDateStr(dateStr)}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--secondary)", margin: 0, marginTop: 2 }}>
                      {data?.loading
                        ? "Loading..."
                        : data?.scheduled === 0
                        ? "No habits scheduled"
                        : `${data?.completed ?? 0} of ${data?.scheduled ?? 0} completed`}
                    </p>
                  </div>

                  {/* Percentage badge */}
                  {data && !data.loading && data.scheduled > 0 && (
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        backgroundColor: allDone ? "#4CAF5015" : "var(--surface-variant)",
                        fontSize: 14,
                        fontWeight: 800,
                        color: allDone ? "#4CAF50" : "var(--primary)",
                      }}
                    >
                      {pct}%
                    </div>
                  )}

                  {/* Edit button */}
                  {data && !data.loading && data.scheduled > 0 && (
                    <button
                      onClick={() => openDayEditor(dateStr)}
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--surface-variant)",
                        color: "var(--secondary)",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: 12,
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 16, marginRight: 4 }}>
                        edit
                      </span>
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* Day Edit Modal */}
      {/* ═══════════════════════════════════════════════════════ */}
      {editingDay && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !savingDay) setEditingDay(null); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: 24,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--surface)",
              borderRadius: 24,
              width: "100%",
              maxWidth: 480,
              maxHeight: "80vh",
              overflow: "auto",
              border: "1px solid var(--border)",
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between"
              style={{ padding: "24px 24px 0 24px" }}
            >
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
                  Edit Day
                </h2>
                <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, marginTop: 4 }}>
                  {formatDateStr(editingDay)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!savingDay) setEditingDay(null); }}
                style={{
                  color: "var(--secondary)",
                  background: "var(--surface-variant)",
                  border: "none",
                  cursor: "pointer",
                  padding: 8,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Habit checklist */}
            <div style={{ padding: "20px 24px 24px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
              {editingDayScheduled.map((habit) => {
                const isChecked = editCompletions[habit.id] ?? false;
                const goal = goalMap.get(habit.goalId);
                const bucket = goal ? bucketMap.get(goal.bucketId) : bucketMap.get(habit.bucketId);
                const hex = bucket ? argbToHex(bucket.color) : "var(--secondary)";

                return (
                  <div
                    key={habit.id}
                    className="flex items-center gap-3"
                    onClick={() => setEditCompletions((prev) => ({ ...prev, [habit.id]: !prev[habit.id] }))}
                    style={{
                      backgroundColor: isChecked ? "#4CAF5008" : "var(--surface-variant)",
                      border: `1px solid ${isChecked ? "#4CAF5030" : "var(--border)"}`,
                      borderRadius: 14,
                      padding: "12px 16px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        border: isChecked ? "none" : "2px solid var(--border)",
                        backgroundColor: isChecked ? "#4CAF50" : "transparent",
                        transition: "all 0.15s",
                      }}
                    >
                      {isChecked && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Icon */}
                    <div
                      className="shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 32,
                        height: 32,
                        backgroundColor: typeof hex === "string" && hex.startsWith("#") ? hex + "20" : "var(--surface-variant)",
                      }}
                    >
                      <MaterialIcon
                        name={goal?.iconName || bucket?.iconName || "Category"}
                        size={18}
                        color={hex}
                      />
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isChecked ? "#4CAF50" : "var(--primary)",
                        margin: 0,
                        textDecoration: isChecked ? "line-through" : "none",
                        opacity: isChecked ? 0.7 : 1,
                      }}>
                        {habit.name}
                      </p>
                      {habit.completionType !== "checkbox" && (
                        <p style={{ fontSize: 11, color: "var(--secondary)", margin: 0, marginTop: 2 }}>
                          {habit.completionType === "counter" ? `Counter · goal: ${habit.counterGoal}` : `Timer · ${Math.floor(habit.timerGoalSeconds / 60)}m`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {editingDayScheduled.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--secondary)", textAlign: "center", margin: 0, padding: 20 }}>
                  No habits scheduled for this day.
                </p>
              )}

              {/* Save button */}
              <button
                type="button"
                onClick={handleSaveDay}
                disabled={savingDay}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 16,
                  fontWeight: 700,
                  fontSize: 14,
                  backgroundColor: "var(--primary)",
                  color: "var(--background)",
                  border: "none",
                  cursor: savingDay ? "default" : "pointer",
                  opacity: savingDay ? 0.6 : 1,
                  marginTop: 8,
                  transition: "opacity 0.15s",
                }}
              >
                {savingDay ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
      <HabitEditModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingHabit(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
        habit={editingHabit}
        goals={goals}
        buckets={buckets}
        userId={user?.uid ?? ""}
        nextSortOrder={habits.length}
      />
    </div>
  );
}
