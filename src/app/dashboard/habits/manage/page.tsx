"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
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
import { subscribeToBuckets, saveBucket } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { isHabitPausedOnDate, isScheduledForDate } from "@/lib/streak-calculator";
import HabitEditModal from "@/components/habit-edit-modal";
import MaterialIcon from "@/components/material-icon";
import logoPic from "../../../../../public/logo.png";

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

type ManageTab = "bucket" | "list" | "history";
type ListSort = "bucket" | "status" | null;

const MANAGE_TABS: { id: ManageTab; label: string }[] = [
  { id: "bucket", label: "Card" },
  { id: "list", label: "List" },
  { id: "history", label: "History" },
];

function HabitEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className="text-center"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: "40px 24px",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 16px",
          borderRadius: "50%",
          backgroundColor: "var(--surface-variant)",
          overflow: "hidden",
        }}
      >
        <Image src={logoPic} alt="Committed" width={48} height={48} style={{ borderRadius: 14, objectFit: "cover" }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", margin: "0 0 6px" }}>{title}</p>
      <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: 20,
            backgroundColor: "var(--primary)",
            color: "var(--background)",
            border: "none",
            cursor: "pointer",
            borderRadius: 14,
            padding: "11px 18px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

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

function formatCompactDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function completionColorFor(value: number): string {
  if (value < 25) return "#ef4444";
  if (value <= 75) return "#f5b942";
  return "#28b66f";
}

function CompletionRing({ percentage }: { percentage: number }) {
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const visiblePercentage = percentage === 0 ? 100 : percentage;
  const dashOffset = circumference * (1 - visiblePercentage / 100);
  const color = completionColorFor(percentage);

  return (
    <div
      className="shrink-0 flex items-center justify-center"
      style={{ width: 28, height: 28 }}
      title={`${percentage}% complete`}
    >
      <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="15" cy="15" r={radius} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle
          cx="15"
          cy="15"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
    </div>
  );
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
  const searchParams = useSearchParams();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ManageTab>("bucket");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [listDeleteConfirm, setListDeleteConfirm] = useState<string | null>(null);
  const [listSort, setListSort] = useState<ListSort>("bucket");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [cardSort, setCardSort] = useState<ListSort>("bucket");
  const [cardSortMenuOpen, setCardSortMenuOpen] = useState(false);
  const [collapsedListGroups, setCollapsedListGroups] = useState<Record<string, boolean>>({});
  const [draggedBucketId, setDraggedBucketId] = useState<string | null>(null);
  const draggedBucketIdRef = useRef<string | null>(null);
  const [bucketDropTarget, setBucketDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [savingBucketOrder, setSavingBucketOrder] = useState(false);

  const requestedTab = searchParams.get("tab");
  const currentTab: ManageTab = requestedTab === "list" || requestedTab === "history" || requestedTab === "bucket"
    ? requestedTab
    : activeTab;

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

  useEffect(() => {
    if (!draggedBucketId) return;

    const autoScrollNearViewportEdge = (event: DragEvent) => {
      const edgeSize = 88;
      const maxStep = 22;
      if (event.clientY < edgeSize) {
        window.scrollBy(0, -Math.ceil(((edgeSize - event.clientY) / edgeSize) * maxStep));
      } else if (event.clientY > window.innerHeight - edgeSize) {
        window.scrollBy(0, Math.ceil(((event.clientY - (window.innerHeight - edgeSize)) / edgeSize) * maxStep));
      }
    };

    window.addEventListener("dragover", autoScrollNearViewportEdge);
    return () => {
      window.removeEventListener("dragover", autoScrollNearViewportEdge);
    };
  }, [draggedBucketId]);

  // Load history data when habits are available
  useEffect(() => {
    if (!user || habits.length === 0) return;
    const datesToLoad = [dateToString(new Date()), ...historyDays];
    datesToLoad.forEach((dateStr) => {
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

  const cardGroups = (() => {
    if (cardSort === "bucket") {
      const groups = new Map<string, { id: string; label: string; color: string; iconName: string; habits: Habit[] }>();
      buckets.forEach((bucket) => groups.set(bucket.id, { id: bucket.id, label: bucket.name, color: argbToHex(bucket.color), iconName: bucket.iconName || "Category", habits: [] }));
      habits.forEach((habit) => {
        const goal = goalMap.get(habit.goalId);
        const bucket = goal ? bucketMap.get(goal.bucketId) : bucketMap.get(habit.bucketId);
        const id = bucket?.id ?? "unassigned";
        if (!groups.has(id)) groups.set(id, { id, label: bucket?.name ?? "No bucket", color: bucket ? argbToHex(bucket.color) : "var(--secondary)", iconName: bucket?.iconName || "Category", habits: [] });
        groups.get(id)?.habits.push(habit);
      });
      return Array.from(groups.values()).filter((group) => group.habits.length > 0);
    }

    if (cardSort === "status") {
      const today = dateToString(new Date());
      return [
        { id: "active", label: "Active", color: "#28b66f", iconName: "Pause", habits: habits.filter((habit) => !isHabitPausedOnDate(habit, today)) },
        { id: "paused", label: "Paused", color: "#f5b942", iconName: "PlayArrow", habits: habits.filter((habit) => isHabitPausedOnDate(habit, today)) },
      ].filter((group) => group.habits.length > 0);
    }

    return (["checkbox", "counter", "timer"] as const)
      .map((type) => ({ id: type, label: TYPE_LABELS[type], color: "var(--secondary)", iconName: type === "checkbox" ? "CheckBox" : type === "counter" ? "AddCircle" : "Timer", habits: habits.filter((habit) => habit.completionType === type) }))
      .filter((group) => group.habits.length > 0);
  })();

  const historyLoaded = historyDays.every((date) => {
    const data = dayDataMap[date];
    return data && !data.loading;
  });
  const hasTrackingHistory = historyDays.some((date) =>
    dayDataMap[date]?.completions.some((completion) => completion.completed)
  );
  const historyDates = [dateToString(new Date()), ...historyDays];
  const openCreateHabitModal = () => {
    setEditingHabit(null);
    setModalOpen(true);
  };
  const handleBucketDrop = async (targetBucketId: string, event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const sourceBucketId = draggedBucketIdRef.current || event.dataTransfer.getData("text/plain");
    setDraggedBucketId(null);
    draggedBucketIdRef.current = null;
    setBucketDropTarget(null);
    if (!sourceBucketId || sourceBucketId === targetBucketId || savingBucketOrder) return;

    const reordered = [...buckets];
    const sourceIndex = reordered.findIndex((bucket) => bucket.id === sourceBucketId);
    if (sourceIndex < 0 || !reordered.some((bucket) => bucket.id === targetBucketId)) return;
    const [movedBucket] = reordered.splice(sourceIndex, 1);
    const targetIndex = reordered.findIndex((bucket) => bucket.id === targetBucketId);
    const bounds = event.currentTarget.getBoundingClientRect();
    reordered.splice(targetIndex + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0), 0, movedBucket);

    const savedOrder = reordered.map((bucket, index) => ({ ...bucket, sortOrder: index }));
    setBuckets(savedOrder);
    setSavingBucketOrder(true);
    try {
      await Promise.all(savedOrder.map((bucket) => saveBucket(bucket)));
    } catch (error) {
      console.error("Failed to save bucket order:", error);
    } finally {
      setSavingBucketOrder(false);
    }
  };

  const handleBucketDragOver = (bucketId: string, event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!draggedBucketIdRef.current || draggedBucketIdRef.current === bucketId) {
      setBucketDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setBucketDropTarget({ id: bucketId, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
  };

  const listGroups = (() => {
    if (listSort === "bucket") {
      const groups = new Map<string, { id: string; label: string; color: string; iconName: string; habits: Habit[] }>();
      buckets.forEach((bucket) => {
        groups.set(bucket.id, {
          id: bucket.id,
          label: bucket.name,
          color: argbToHex(bucket.color),
          iconName: bucket.iconName || "Category",
          habits: [],
        });
      });
      habits.forEach((habit) => {
        const goal = goalMap.get(habit.goalId);
        const bucket = goal ? bucketMap.get(goal.bucketId) : bucketMap.get(habit.bucketId);
        const id = bucket?.id ?? "unassigned";
        if (!groups.has(id)) {
          groups.set(id, { id, label: bucket?.name ?? "No bucket", color: bucket ? argbToHex(bucket.color) : "var(--secondary)", iconName: bucket?.iconName ?? "Category", habits: [] });
        }
        groups.get(id)?.habits.push(habit);
      });
      return Array.from(groups.values()).sort((first, second) => Number(first.habits.length === 0) - Number(second.habits.length === 0));
    }

    if (listSort === "status") {
      const today = dateToString(new Date());
      return [
        { id: "active", label: "Active", color: "#28b66f", iconName: "", habits: habits.filter((habit) => !isHabitPausedOnDate(habit, today)) },
        { id: "paused", label: "Paused", color: "#f5b942", iconName: "", habits: habits.filter((habit) => isHabitPausedOnDate(habit, today)) },
      ].filter((group) => group.habits.length > 0);
    }

    return [{ id: "all", label: "", color: "var(--secondary)", iconName: "", habits }];
  })();

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
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Habits</h1>
        <button
          onClick={openCreateHabitModal}
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

      <div
        role="tablist"
        aria-label="Habit sections"
        className="flex items-center"
        style={{
          width: "fit-content",
          maxWidth: "100%",
          padding: 4,
          marginBottom: 24,
          borderRadius: 14,
          backgroundColor: "var(--surface-variant)",
          overflowX: "auto",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={false}
          onClick={() => router.push("/dashboard/habits")}
          style={{ padding: "9px 16px", border: "none", borderRadius: 10, backgroundColor: "transparent", color: "var(--secondary)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
        >
          Overview
        </button>
        {MANAGE_TABS.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { setActiveTab(tab.id); router.replace(`/dashboard/habits/manage?tab=${tab.id}`); }}
              style={{
                padding: "9px 16px",
                border: "none",
                borderRadius: 10,
                backgroundColor: isActive ? "var(--surface)" : "transparent",
                boxShadow: isActive ? "0 1px 3px rgba(0, 0, 0, 0.12)" : "none",
                color: isActive ? "var(--primary)" : "var(--secondary)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {currentTab === "bucket" && habits.length === 0 && (
        <HabitEmptyState
          title="Create your first habit"
          description="Small commitments add up. Start with one today."
          actionLabel="Create habit"
          onAction={openCreateHabitModal}
        />
      )}

      {currentTab === "list" && habits.length === 0 && (
        <HabitEmptyState
          title="Create your first habit"
          description="Your habit list will appear here."
          actionLabel="Create habit"
          onAction={openCreateHabitModal}
        />
      )}

      {currentTab === "list" && habits.length > 0 && (
        <div>
          <div className="flex justify-end" style={{ marginBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setSortMenuOpen((isOpen) => !isOpen)}
                aria-expanded={sortMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2"
                style={{ backgroundColor: "var(--surface-variant)", color: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 10px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >
                Sort {listSort ? `by ${listSort}` : ""}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {sortMenuOpen && (
                <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 10, minWidth: 150, padding: 4, backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 28px rgba(0, 0, 0, 0.16)" }}>
                  {([{ id: null, label: "None" }, { id: "bucket", label: "Bucket" }, { id: "status", label: "Status" }] as const).map((option) => (
                    <button key={option.label} type="button" role="menuitem" onClick={() => { setListSort(option.id); setSortMenuOpen(false); }} style={{ width: "100%", padding: "8px 10px", border: "none", borderRadius: 8, backgroundColor: listSort === option.id ? "var(--surface-variant)" : "transparent", color: listSort === option.id ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 13, fontWeight: listSort === option.id ? 700 : 600, textAlign: "left" }}>{option.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
          <div
            style={{
              minWidth: 680,
              padding: "4px 12px",
              backgroundColor: "var(--surface-variant)",
              border: "1px solid var(--border)",
              borderRadius: 16,
            }}
          >
            {listGroups.map((group, groupIndex) => {
              const isBucketGroup = listSort === "bucket";
              const isCollapsed = isBucketGroup && collapsedListGroups[group.id];
              const isEmptyGroup = isBucketGroup && group.habits.length === 0;
              const isFirstEmptyGroup = isEmptyGroup && listGroups[groupIndex - 1]?.habits.length > 0;
              const isDraggableBucket = isBucketGroup && group.id !== "unassigned";

              return (
              <Fragment key={group.id}>
                {isFirstEmptyGroup && <div style={{ height: 1, margin: "8px 4px 5px", backgroundColor: "var(--border)" }} />}
                {group.label && (
                  isBucketGroup ? (
                  <button
                    type="button"
                    onClick={() => setCollapsedListGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                    draggable={isDraggableBucket && !savingBucketOrder}
                    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", group.id); draggedBucketIdRef.current = group.id; setDraggedBucketId(group.id); }}
                    onDragOver={(event) => handleBucketDragOver(group.id, event)}
                    onDragEnd={() => { setDraggedBucketId(null); setBucketDropTarget(null); }}
                    onDrop={(event) => void handleBucketDrop(group.id, event)}
                    aria-expanded={!isCollapsed}
                    className="flex items-center gap-2"
                    style={{ width: "100%", margin: isEmptyGroup ? "1px 0" : "3px 0", padding: isEmptyGroup ? "4px 7px" : "7px 8px", color: group.color, backgroundColor: isEmptyGroup ? "transparent" : group.color.startsWith("#") ? `${group.color}14` : "var(--surface)", border: "none", borderRadius: 9, cursor: isDraggableBucket ? "grab" : "pointer", textAlign: "left", opacity: isEmptyGroup ? 0.62 : 1, boxShadow: bucketDropTarget?.id === group.id ? bucketDropTarget.position === "before" ? "0 -3px 0 #28b66f" : "0 3px 0 #28b66f" : "none" }}
                  >
                      <MaterialIcon name={group.iconName} size={isEmptyGroup ? 13 : 16} color={group.color} />
                    <span style={{ fontSize: isEmptyGroup ? 11 : 14, fontWeight: isEmptyGroup ? 600 : 700 }}>{group.label}</span>
                    <span style={{ fontSize: isEmptyGroup ? 10 : 12, fontWeight: 600, opacity: 0.7 }}>({group.habits.length})</span>
                    <svg width={isEmptyGroup ? "12" : "14"} height={isEmptyGroup ? "12" : "14"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1, transition: "transform 0.18s ease", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  ) : (
                  <div className="flex items-center gap-2" style={{ margin: "2px 0", padding: "5px 7px", color: group.color, backgroundColor: group.color.startsWith("#") ? `${group.color}14` : "var(--surface)", borderRadius: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: group.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{group.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>({group.habits.length})</span>
                  </div>
                  )
                )}
                {!isCollapsed && group.habits.map((habit, index) => {
              const goal = goalMap.get(habit.goalId);
              const bucket = goal ? bucketMap.get(goal.bucketId) : bucketMap.get(habit.bucketId);
              const isPaused = isHabitPausedOnDate(habit, dateToString(new Date()));

              return (
                <div
                  key={habit.id}
                  className="flex items-center gap-2"
                  style={{
                    minHeight: 40,
                    padding: "3px 4px",
                    borderBottom: index === group.habits.length - 1 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <button
                    type="button"
                    title={isPaused ? "Unpause habit" : "Pause habit"}
                    aria-label={isPaused ? "Unpause habit" : "Pause habit"}
                    onClick={() => void handleTogglePause(habit)}
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 20,
                      height: 20,
                      color: isPaused ? "#f5b942" : "#28b66f",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {isPaused ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setEditingHabit(habit); setModalOpen(true); }}
                    className="min-w-0"
                    style={{
                      flex: 1,
                      color: "var(--primary)",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 650,
                      overflow: "hidden",
                      textAlign: "left",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      padding: 0,
                    }}
                  >
                    {habit.name}
                  </button>

                  <div className="flex items-center gap-1 min-w-0" style={{ width: 130, color: "var(--secondary)", fontSize: 12 }}>
                    {bucket && <MaterialIcon name={bucket.iconName || "Category"} size={16} color={argbToHex(bucket.color)} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket?.name ?? "No bucket"}</span>
                  </div>

                  <span className="shrink-0" style={{ width: 62, color: "var(--secondary)", fontSize: 11, fontWeight: 600 }}>
                    {TYPE_LABELS[habit.completionType]}
                  </span>

                  <div className="flex items-center shrink-0" style={{ gap: 2 }}>
                    {DAY_KEYS.map((key, dayIndex) => (
                      <button
                        key={key}
                        type="button"
                        aria-label={`${habit.name}: ${DAY_NAMES[(dayIndex + 1) % 7]}`}
                        aria-pressed={habit[key]}
                        onClick={() => void handleSave({ ...habit, [key]: !habit[key] })}
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 19,
                          height: 19,
                          backgroundColor: habit[key] ? "var(--primary)" : "var(--surface-variant)",
                          color: habit[key] ? "var(--background)" : "var(--secondary)",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 9,
                          fontWeight: 700,
                        }}
                      >
                        {DAY_LABELS[dayIndex]}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    title="Delete habit"
                    aria-label={`Delete ${habit.name}`}
                    onClick={() => setListDeleteConfirm(habit.id)}
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 26,
                      height: 26,
                      color: "var(--secondary)",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 10,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              );
                })}
              </Fragment>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {/* Groups by type */}
      {currentTab === "bucket" && (
        <>
          <div className="flex justify-end" style={{ marginBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <button type="button" onClick={() => setCardSortMenuOpen((isOpen) => !isOpen)} aria-expanded={cardSortMenuOpen} aria-haspopup="menu" className="flex items-center gap-2" style={{ backgroundColor: "var(--surface-variant)", color: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 10px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Sort {cardSort ? `by ${cardSort}` : ""}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></button>
              {cardSortMenuOpen && <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 10, minWidth: 150, padding: 4, backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 28px rgba(0, 0, 0, 0.16)" }}>{([{ id: null, label: "None" }, { id: "bucket", label: "Bucket" }, { id: "status", label: "Status" }] as const).map((option) => <button key={option.label} type="button" role="menuitem" onClick={() => { setCardSort(option.id); setCardSortMenuOpen(false); }} style={{ width: "100%", padding: "8px 10px", border: "none", borderRadius: 8, backgroundColor: cardSort === option.id ? "var(--surface-variant)" : "transparent", color: cardSort === option.id ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 13, fontWeight: cardSort === option.id ? 700 : 600, textAlign: "left" }}>{option.label}</button>)}</div>}
            </div>
          </div>
          {cardGroups.map((group) => {
        const items = group.habits;
        const orderedItems = items;
        const isBucketCardGroup = cardSort === "bucket" && group.id !== "unassigned";

        return (
          <div
            key={group.id}
            onDragOver={isBucketCardGroup ? (event) => handleBucketDragOver(group.id, event) : undefined}
            onDrop={isBucketCardGroup ? (event) => void handleBucketDrop(group.id, event) : undefined}
            style={{ marginBottom: 20, padding: 14, backgroundColor: "var(--surface-variant)", border: "1px solid var(--border)", borderRadius: 20, boxShadow: bucketDropTarget?.id === group.id ? bucketDropTarget.position === "before" ? "0 -4px 0 #28b66f" : "0 4px 0 #28b66f" : "none", transition: "box-shadow 0.12s ease" }}
          >
            <div
              className="flex items-center gap-2"
              draggable={isBucketCardGroup && !savingBucketOrder}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", group.id); draggedBucketIdRef.current = group.id; setDraggedBucketId(group.id); }}
              onDragEnd={() => { setDraggedBucketId(null); setBucketDropTarget(null); }}
              style={{ ...sectionHeaderStyle, color: group.color, cursor: isBucketCardGroup ? "grab" : "default" }}
            >
              <MaterialIcon name={group.iconName} size={16} color={group.color} />
              <span>{group.label}</span>
              <span style={{ opacity: 0.7 }}>({items.length})</span>
            </div>
            <div className="habit-manage-grid">
              {orderedItems.map((habit) => {
                const goal = goalMap.get(habit.goalId);
                const bucket = goal ? bucketMap.get(goal.bucketId) : bucketMap.get(habit.bucketId);
                const isDeleting = deleteConfirm === habit.id;
                const isPaused = isHabitPausedOnDate(habit, dateToString(new Date()));

                return (
                  <Fragment key={habit.id}>
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
                        width: 24,
                        height: 24,
                        color: isPaused ? "#f5b942" : "#28b66f",
                        backgroundColor: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
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
        </>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* History Section */}
      {/* ═══════════════════════════════════════════════════════ */}
      {currentTab === "history" && habits.length === 0 && (
        <HabitEmptyState
          title="Create your first habit"
          description="Your completed habits will build a history here."
          actionLabel="Create habit"
          onAction={openCreateHabitModal}
        />
      )}

      {currentTab === "history" && habits.length > 0 && historyLoaded && !hasTrackingHistory && (
        <HabitEmptyState
          title="Start tracking"
          description="Complete a habit to begin building your history."
        />
      )}

      {currentTab === "history" && habits.length > 0 && (!historyLoaded || hasTrackingHistory) && (
        <div style={{ marginTop: 8 }}>
          <h2 style={sectionHeaderStyle}>History</h2>
          <div
            className="flex flex-col"
            style={{
              padding: "4px 12px",
              border: "1px solid var(--border)",
              borderRadius: 16,
              backgroundColor: "var(--surface-variant)",
            }}
          >
            {historyDates.map((dateStr) => {
              const data = dayDataMap[dateStr];
              const isToday = dateStr === historyDates[0];
              const pct = data && data.scheduled > 0
                ? Math.round((data.completed / data.scheduled) * 100)
                : 0;
              const hasScheduledHabits = Boolean(data && !data.loading && data.scheduled > 0);
              const completionMap = new Map(data?.completions.map((completion) => [completion.habitId, completion]) ?? []);
              const dayHabits = hasScheduledHabits
                ? habits.filter((habit) => isScheduledForDate(habit, dateStr) || completionMap.get(habit.id)?.completed)
                : [];
              const completedHabits = dayHabits.filter((habit) => completionMap.get(habit.id)?.completed);
              const missedHabits = dayHabits.filter((habit) => !completionMap.get(habit.id)?.completed);
              const isExpanded = !isToday && expandedDay === dateStr;

              return (
                <Fragment key={dateStr}>
                  <div
                    className="flex items-center"
                    style={{
                      minHeight: 44,
                      padding: "5px 4px",
                      margin: isToday ? "0 0 3px" : 0,
                      borderRadius: isToday ? 9 : 0,
                      backgroundColor: isToday ? "var(--surface)" : "transparent",
                      borderBottom: isExpanded ? "none" : dateStr === historyDates[historyDates.length - 1] ? "none" : "1px solid var(--border)",
                    }}
                  >
                  <div className="shrink-0 flex items-center justify-center" style={{ width: 36, marginRight: 2 }}>
                    {hasScheduledHabits || (isToday && !data?.loading) ? (
                      <CompletionRing percentage={pct} />
                    ) : (
                      <span style={{ color: "var(--secondary)", fontSize: 13, fontWeight: 700 }}>
                        {data?.loading ? "…" : "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0" style={{ paddingRight: 16 }}>
                    <p style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--primary)",
                      margin: 0,
                    }}>
                      {isToday ? "Today" : formatCompactDateStr(dateStr)}
                    </p>
                  </div>

                  <span
                    className="shrink-0"
                    style={{
                      width: 54,
                      color: hasScheduledHabits || (isToday && !data?.loading) ? completionColorFor(pct) : "var(--secondary)",
                      fontSize: 13,
                      fontWeight: 800,
                      textAlign: "right",
                    }}
                  >
                    {data?.loading ? "…" : hasScheduledHabits || isToday ? `${pct}%` : "—"}
                  </span>

                  <button
                    type="button"
                    onClick={() => openDayEditor(dateStr)}
                    disabled={!hasScheduledHabits}
                    className="shrink-0"
                    style={{
                      marginLeft: 12,
                      color: "var(--secondary)",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: hasScheduledHabits ? "pointer" : "default",
                      padding: "6px 8px",
                      fontSize: 13,
                      fontWeight: 700,
                      opacity: hasScheduledHabits ? 1 : 0.35,
                    }}
                  >
                    Edit
                  </button>
                  {!isToday && (
                    <button
                      type="button"
                      onClick={() => setExpandedDay((current) => current === dateStr ? null : dateStr)}
                      disabled={!hasScheduledHabits}
                      title={isExpanded ? "Collapse day" : "Expand day"}
                      aria-label={isExpanded ? "Collapse day" : "Expand day"}
                      aria-expanded={isExpanded}
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        marginLeft: 4,
                        width: 30,
                        height: 30,
                        color: "var(--secondary)",
                        backgroundColor: "transparent",
                        border: "none",
                        borderRadius: 8,
                        cursor: hasScheduledHabits ? "pointer" : "default",
                        opacity: hasScheduledHabits ? 1 : 0.35,
                        transition: "transform 0.2s ease, background-color 0.15s ease",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                  </div>
                  {!isToday && <div
                    style={{
                      maxHeight: isExpanded ? 720 : 0,
                      opacity: isExpanded ? 1 : 0,
                      overflow: "hidden",
                      transition: "max-height 0.24s ease, opacity 0.18s ease",
                      borderBottom: isExpanded && dateStr !== historyDates[historyDates.length - 1] ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <div className="flex" style={{ gap: 8, padding: "2px 4px 12px 42px" }}>
                      <div
                        className="flex-1 min-w-0"
                        style={{
                          backgroundColor: "#28b66f12",
                          border: "1px solid #28b66f2b",
                          borderRadius: 12,
                          padding: "10px 12px",
                        }}
                      >
                        <div className="flex items-center gap-1" style={{ color: "#28b66f", marginBottom: 8 }}>
                          <span className="flex items-center justify-center" style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "#28b66f22", fontSize: 11, fontWeight: 800 }}>✓</span>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>Completed</span>
                          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>({completedHabits.length})</span>
                        </div>
                        <div className="flex flex-wrap" style={{ gap: 5 }}>
                          {completedHabits.length > 0 ? completedHabits.map((habit) => (
                            <span key={habit.id} style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#28b66f", backgroundColor: "#28b66f18", borderRadius: 6, padding: "4px 7px", fontSize: 12, fontWeight: 650 }}>{habit.name}</span>
                          )) : (
                            <span style={{ color: "#28b66f", fontSize: 12, opacity: 0.7 }}>Nothing completed</span>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex-1 min-w-0"
                        style={{
                          backgroundColor: "#ef444412",
                          border: "1px solid #ef44442b",
                          borderRadius: 12,
                          padding: "10px 12px",
                        }}
                      >
                        <div className="flex items-center gap-1" style={{ color: "#ef4444", marginBottom: 8 }}>
                          <span className="flex items-center justify-center" style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "#ef444422", fontSize: 12, fontWeight: 800 }}>×</span>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>Missed</span>
                          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.75 }}>({missedHabits.length})</span>
                        </div>
                        <div className="flex flex-wrap" style={{ gap: 5 }}>
                          {missedHabits.length > 0 ? missedHabits.map((habit) => (
                            <span key={habit.id} style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#ef4444", backgroundColor: "#ef444418", borderRadius: 6, padding: "4px 7px", fontSize: 12, fontWeight: 650 }}>{habit.name}</span>
                          )) : (
                            <span style={{ color: "#ef4444", fontSize: 12, opacity: 0.7 }}>Nothing missed</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>}
                </Fragment>
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

      {listDeleteConfirm && (() => {
        const habit = habits.find((item) => item.id === listDeleteConfirm);
        if (!habit) return null;

        return (
          <div
            onClick={(event) => { if (event.target === event.currentTarget) setListDeleteConfirm(null); }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              backgroundColor: "rgba(0, 0, 0, 0.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            <div style={{ width: "100%", maxWidth: 380, padding: 24, borderRadius: 20, backgroundColor: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)" }}>
              <h2 style={{ margin: 0, color: "var(--primary)", fontSize: 18, fontWeight: 700 }}>Delete habit?</h2>
              <p style={{ margin: "8px 0 22px", color: "var(--secondary)", fontSize: 14, lineHeight: 1.5 }}>
                This will permanently delete <span style={{ color: "var(--primary)", fontWeight: 700 }}>{habit.name}</span> and its completion history.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setListDeleteConfirm(null)} style={{ border: "none", borderRadius: 12, padding: "10px 14px", cursor: "pointer", backgroundColor: "var(--surface-variant)", color: "var(--primary)", fontSize: 13, fontWeight: 700 }}>Cancel</button>
                <button type="button" onClick={async () => { await handleDelete(habit.id); setListDeleteConfirm(null); }} style={{ border: "none", borderRadius: 12, padding: "10px 14px", cursor: "pointer", backgroundColor: "var(--error)", color: "var(--primary)", fontSize: 13, fontWeight: 700 }}>Delete habit</button>
              </div>
            </div>
          </div>
        );
      })()}

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
