"use client";

import { Habit, HabitCompletion, Bucket, Goal, StreakInfo } from "@/lib/types";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

interface HabitCardProps {
  habit: Habit;
  completion: HabitCompletion | null;
  bucket: Bucket | null;
  goal: Goal | null;
  streak: StreakInfo | null;
  onToggleCheckbox: () => void;
  onIncrementCounter: () => void;
  onAddTimerSeconds: (seconds: number) => void;
  onScheduleCheckIn?: () => void;
  pendingCheckInAt?: number | null;
  completed: boolean;
  completionAnimation?: "confirming" | "settled";
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatTimerGoal(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export default function HabitCard({
  habit,
  completion,
  bucket,
  goal,
  streak,
  onToggleCheckbox,
  onIncrementCounter,
  onAddTimerSeconds,
  onScheduleCheckIn,
  pendingCheckInAt,
  completed,
  completionAnimation,
}: HabitCardProps) {
  const bucketColor = bucket ? argbToHex(bucket.color) : "var(--accent)";
  const displayIcon = goal?.iconName || bucket?.iconName || "Category";
  const displayedStreak = completed
    ? (streak?.currentStreak ?? 0) + 1
    : (streak?.currentStreak ?? 0);
  const displayedAntiStreak = completed ? 0 : (streak?.currentAntiStreak ?? 0);
  const pendingCheckInLabel = pendingCheckInAt ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(pendingCheckInAt)) : null;

  // Progress for counter/timer
  let progress = 0;
  if (habit.completionType === "counter" && habit.counterGoal > 0) {
    progress = Math.min((completion?.counterValue ?? 0) / habit.counterGoal, 1);
  } else if (habit.completionType === "timer" && habit.timerGoalSeconds > 0) {
    progress = Math.min((completion?.timerSeconds ?? 0) / habit.timerGoalSeconds, 1);
  }

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "14px 16px",
        opacity: completionAnimation === "confirming" ? 1 : completed ? 0.55 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Bucket icon circle */}
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: 40,
            height: 40,
            backgroundColor: bucketColor + "20",
          }}
        >
          <MaterialIcon name={displayIcon} size={22} color={bucketColor} />
        </div>

        {/* Name + streak */}
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--primary)",
              textDecoration: completed && completionAnimation !== "confirming" ? "line-through" : "none",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            className={completionAnimation === "confirming" ? "habit-name-completing" : undefined}
          >
            {habit.name}
          </p>
          {streak && (displayedStreak > 0 || displayedAntiStreak > 0) && (
            <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
              {displayedStreak > 0 && (
                <span style={{ fontSize: 12, color: "#FF9800", fontWeight: 500 }}>
                  🔥 {displayedStreak} day{displayedStreak !== 1 ? "s" : ""}
                </span>
              )}
              {displayedAntiStreak > 0 && (
                <span style={{ fontSize: 12, color: "#9C27B0", fontWeight: 500 }}>
                  💔 {displayedAntiStreak} day{displayedAntiStreak !== 1 ? "s" : ""} off
                </span>
              )}
            </div>
          )}
          {pendingCheckInLabel && <p style={{ margin: "3px 0 0", color: "#d69e13", fontSize: 11, fontWeight: 700 }}>Check-in scheduled for {pendingCheckInLabel}</p>}
        </div>

        {!completed && onScheduleCheckIn && (
          <button type="button" onClick={(event) => { event.stopPropagation(); onScheduleCheckIn(); }} aria-label={`Schedule a check-in for ${habit.name}`} title="Schedule check-in" style={{ width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0, padding: 0, border: pendingCheckInAt ? "1px solid #f5c84c77" : "1px solid var(--border)", borderRadius: 10, background: pendingCheckInAt ? "#f5c84c16" : "var(--surface-variant)", color: pendingCheckInAt ? "#d69e13" : "var(--secondary)", cursor: "pointer" }}><MaterialIcon name="schedule" size={18} /></button>
        )}

        {/* Completion widget */}
        {habit.completionType === "checkbox" && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleCheckbox(); }}
            className={`shrink-0 flex items-center justify-center rounded-full${completionAnimation === "confirming" ? " habit-checkbox-completing" : ""}`}
            style={{
              width: 36,
              height: 36,
              border: completed ? "none" : "2px solid var(--border)",
              backgroundColor: completed ? "#4CAF50" : "transparent",
              cursor: "pointer",
              transition: "all 0.2s ease",
              padding: 0,
            }}
          >
            {completed && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline className={completionAnimation === "confirming" ? "habit-check-draw" : undefined} pathLength="1" points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}

        {habit.completionType === "counter" && (
          <div className="flex items-center gap-2 shrink-0">
            <span style={{ fontSize: 13, fontWeight: 500, color: completed ? "#4CAF50" : "var(--secondary)" }}>
              {completion?.counterValue ?? 0}/{habit.counterGoal}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onIncrementCounter(); }}
              className="flex items-center justify-center"
              style={{
                minWidth: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: completed ? "#4CAF50" : bucketColor + "20",
                color: completed ? "#FFF" : bucketColor,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                paddingLeft: 10,
                paddingRight: 10,
                transition: "all 0.2s ease",
              }}
            >
              +{habit.counterIncrement}
            </button>
          </div>
        )}

        {habit.completionType === "timer" && (
          <div className="flex items-center gap-2 shrink-0">
            <span style={{ fontSize: 13, fontWeight: 500, color: completed ? "#4CAF50" : "var(--secondary)" }}>
              {formatTimer(completion?.timerSeconds ?? 0)}/{formatTimerGoal(habit.timerGoalSeconds)}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddTimerSeconds(60); }}
              className="flex items-center justify-center"
              style={{
                minWidth: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: completed ? "#4CAF50" : bucketColor + "20",
                color: completed ? "#FFF" : bucketColor,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                paddingLeft: 10,
                paddingRight: 10,
                transition: "all 0.2s ease",
              }}
            >
              +60s
            </button>
          </div>
        )}
      </div>

      {/* Progress bar for counter/timer */}
      {(habit.completionType === "counter" || habit.completionType === "timer") && (
        <div
          style={{
            height: 4,
            borderRadius: 9999,
            backgroundColor: "var(--surface-variant)",
            marginTop: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 9999,
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: completed ? "#4CAF50" : bucketColor,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}
