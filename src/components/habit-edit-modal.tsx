"use client";

import { useState, useEffect } from "react";
import DayPicker from "@/components/day-picker";
import MaterialIcon from "@/components/material-icon";
import { Bucket, Goal, Habit } from "@/lib/types";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

interface HabitEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (habit: Habit) => void;
  onDelete?: (habitId: string) => void;
  habit?: Habit | null;
  goals: Goal[];
  buckets: Bucket[];
  userId: string;
  nextSortOrder: number;
}

const COMPLETION_TYPES: { value: Habit["completionType"]; label: string; icon: string }[] = [
  { value: "checkbox", label: "Checkbox", icon: "check_circle" },
  { value: "counter", label: "Counter", icon: "add_circle" },
  { value: "timer", label: "Timer", icon: "timer" },
];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--secondary)",
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  backgroundColor: "var(--surface-variant)",
  color: "var(--primary)",
  border: "1px solid var(--border)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

export default function HabitEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  habit,
  goals,
  buckets,
  userId,
  nextSortOrder,
}: HabitEditModalProps) {
  const isEditMode = !!habit;

  const [name, setName] = useState("");
  const [goalId, setGoalId] = useState("");
  const [completionType, setCompletionType] = useState<Habit["completionType"]>("checkbox");
  const [counterIncrement, setCounterIncrement] = useState(1);
  const [counterGoal, setCounterGoal] = useState(10);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [days, setDays] = useState({
    monday: true, tuesday: true, wednesday: true, thursday: true,
    friday: true, saturday: true, sunday: true,
  });
  const [reminderHour, setReminderHour] = useState("");
  const [reminderMinute, setReminderMinute] = useState("");
  const [reminderAmPm, setReminderAmPm] = useState<"AM" | "PM">("AM");
  const [timeError, setTimeError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      if (habit) {
        setName(habit.name);
        setGoalId(habit.goalId || "");
        setCompletionType(habit.completionType);
        setCounterIncrement(habit.counterIncrement);
        setCounterGoal(habit.counterGoal);
        setTimerMinutes(Math.round(habit.timerGoalSeconds / 60));
        setDays({
          monday: habit.monday, tuesday: habit.tuesday, wednesday: habit.wednesday,
          thursday: habit.thursday, friday: habit.friday, saturday: habit.saturday,
          sunday: habit.sunday,
        });
        if (habit.reminderTime) {
          const [h24, m] = habit.reminderTime.split(":").map(Number);
          setReminderAmPm(h24 < 12 ? "AM" : "PM");
          const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
          setReminderHour(h12.toString());
          setReminderMinute(m.toString().padStart(2, "0"));
        } else {
          setReminderHour("");
          setReminderMinute("");
          setReminderAmPm("AM");
        }
      } else {
        setName("");
        setGoalId(goals.length > 0 ? goals[0].id : "");
        setCompletionType("checkbox");
        setCounterIncrement(1);
        setCounterGoal(10);
        setTimerMinutes(5);
        setDays({
          monday: true, tuesday: true, wednesday: true, thursday: true,
          friday: true, saturday: true, sunday: true,
        });
        setReminderHour("");
        setReminderMinute("");
        setReminderAmPm("AM");
      }
    }
  }, [isOpen, habit, goals]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Derive bucket from selected goal
  const selectedGoal = goals.find(g => g.id === goalId);
  const selectedBucket = buckets.find(b => b.id === selectedGoal?.bucketId);
  const accentColor = selectedBucket ? argbToHex(selectedBucket.color) : "var(--primary)";

  // Group goals by bucket for the selector
  const bucketMap = new Map(buckets.map(b => [b.id, b]));
  const goalsByBucket = new Map<string, Goal[]>();
  for (const g of goals) {
    const list = goalsByBucket.get(g.bucketId) || [];
    list.push(g);
    goalsByBucket.set(g.bucketId, list);
  }

  // Validate reminder time: returns error message or null if valid
  const validateReminderTime = (): string | null => {
    const hasHour = reminderHour.trim() !== "";
    const hasMinute = reminderMinute.trim() !== "";
    // Both empty = no reminder, totally fine
    if (!hasHour && !hasMinute) return null;
    // Partial entry
    if (hasHour && !hasMinute) return "Please enter the minutes too.";
    if (!hasHour && hasMinute) return "Please enter the hour too.";
    const h = parseInt(reminderHour, 10);
    const m = parseInt(reminderMinute, 10);
    if (isNaN(h) || h < 1 || h > 12) return "Hour must be between 1 and 12.";
    if (isNaN(m) || m < 0 || m > 59) return "Minutes must be between 00 and 59.";
    return null;
  };

  const handleSave = () => {
    if (!name.trim()) return;
    // Validate reminder time first
    const tErr = validateReminderTime();
    if (tErr) {
      setTimeError(tErr);
      return;
    }
    setTimeError(null);
    // Build reminderTime from hour/minute/ampm
    let reminderTime: string | null = null;
    const hNum = parseInt(reminderHour, 10);
    const mNum = parseInt(reminderMinute, 10);
    if (!isNaN(hNum) && hNum >= 1 && hNum <= 12 && !isNaN(mNum) && mNum >= 0 && mNum <= 59) {
      let h24 = hNum;
      if (reminderAmPm === "AM" && h24 === 12) h24 = 0;
      else if (reminderAmPm === "PM" && h24 !== 12) h24 += 12;
      reminderTime = `${h24.toString().padStart(2, "0")}:${mNum.toString().padStart(2, "0")}`;
    }
    // Derive bucketId from selected goal for backward compat with Android
    const derivedBucketId = selectedGoal?.bucketId ?? "";
    const saved: Habit = {
      id: habit?.id ?? crypto.randomUUID(),
      bucketId: derivedBucketId,
      goalId: goalId,
      name: name.trim(),
      iconName: habit?.iconName ?? "CheckCircle",
      completionType,
      counterIncrement,
      counterGoal,
      timerGoalSeconds: timerMinutes * 60,
      ...days,
      reminderTime,
      sortOrder: habit?.sortOrder ?? nextSortOrder,
      createdAt: habit?.createdAt ?? Date.now(),
      userId: habit?.userId ?? userId,
      pausePeriods: habit?.pausePeriods ?? [],
    };
    onSave(saved);
    onClose();
  };

  const handleDelete = () => {
    if (habit && onDelete) {
      onDelete(habit.id);
      setConfirmingDelete(false);
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
          maxWidth: 520,
          maxHeight: "85vh",
          overflow: "auto",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "28px 28px 0 28px" }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
            {isEditMode ? "Edit Habit" : "New Habit"}
          </h2>
          <button
            type="button"
            onClick={onClose}
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
              transition: "opacity 0.15s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px 28px 28px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              placeholder="e.g. Morning Run"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Goal selector (grouped by bucket) */}
          <div>
            <label style={labelStyle}>Goal</label>
            {goals.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>
                No goals created yet. Create a goal first.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from(goalsByBucket.entries()).map(([bucketId, bucketGoals]) => {
                  const bucket = bucketMap.get(bucketId);
                  const bHex = bucket ? argbToHex(bucket.color) : "var(--secondary)";
                  return (
                    <div key={bucketId}>
                      {/* Bucket group label */}
                      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                        {bucket && (
                          <div
                            className="flex items-center justify-center"
                            style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: bHex + "20" }}
                          >
                            <MaterialIcon name={bucket.iconName} size={12} color={bHex} />
                          </div>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {bucket?.name ?? "Unknown"}
                        </span>
                      </div>
                      {/* Goals in this bucket */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {bucketGoals.map((g) => {
                          const isSelected = goalId === g.id;
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setGoalId(g.id)}
                              className="flex items-center gap-2"
                              style={{
                                padding: "8px 14px",
                                borderRadius: 12,
                                border: isSelected ? `2px solid ${bHex}` : "1px solid var(--border)",
                                backgroundColor: isSelected ? bHex + "15" : "var(--surface-variant)",
                                color: isSelected ? bHex : "var(--secondary)",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: isSelected ? 600 : 500,
                                transition: "all 0.15s",
                              }}
                            >
                              <MaterialIcon name={g.iconName} size={18} color={isSelected ? bHex : "var(--secondary)"} />
                              {g.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goal description (if a goal is selected) */}
          {selectedGoal && selectedGoal.description && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 14,
                backgroundColor: accentColor.startsWith("#") ? accentColor + "08" : "var(--surface-variant)",
                border: `1px solid ${accentColor.startsWith("#") ? accentColor + "20" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                <MaterialIcon name={selectedGoal.iconName} size={16} color={accentColor} />
                <span style={{ fontSize: 12, fontWeight: 600, color: accentColor }}>
                  {selectedGoal.name}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, lineHeight: 1.5 }}>
                {selectedGoal.description}
              </p>
            </div>
          )}

          {/* Completion Type */}
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {COMPLETION_TYPES.map((t) => {
                const isSelected = completionType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setCompletionType(t.value)}
                    className="flex-1 flex items-center justify-center gap-2"
                    style={{
                      padding: "12px 8px",
                      borderRadius: 14,
                      border: isSelected ? `2px solid ${accentColor}` : "1px solid var(--border)",
                      backgroundColor: isSelected ? (typeof accentColor === "string" && accentColor.startsWith("#") ? accentColor + "15" : "var(--surface-variant)") : "var(--surface-variant)",
                      color: isSelected ? "var(--primary)" : "var(--secondary)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 500,
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      className="material-symbols-rounded"
                      style={{ fontSize: 18, color: isSelected ? accentColor : "var(--secondary)" }}
                    >
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Counter fields */}
          {completionType === "counter" && (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Step (+)</label>
                <input
                  type="number" min={0.1} step={0.1} value={counterIncrement}
                  onChange={(e) => setCounterIncrement(Number(e.target.value) || 1)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Goal</label>
                <input
                  type="number" min={1} step={1} value={counterGoal}
                  onChange={(e) => setCounterGoal(Number(e.target.value) || 10)}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Timer field */}
          {completionType === "timer" && (
            <div>
              <label style={labelStyle}>Goal (minutes)</label>
              <input
                type="number" min={1} step={1} value={timerMinutes}
                onChange={(e) => setTimerMinutes(Number(e.target.value) || 5)}
                style={inputStyle}
              />
            </div>
          )}

          {/* Schedule */}
          <div>
            <label style={labelStyle}>Schedule</label>
            <DayPicker days={days} onChange={setDays} />
          </div>

          {/* Reminder Time */}
          <div>
            <label style={labelStyle}>Reminder Time (optional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH"
                maxLength={2}
                value={reminderHour}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setReminderHour(v);
                  setTimeError(null);
                }}
                style={{ ...inputStyle, width: 64, textAlign: "center", flex: "none" }}
              />
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)" }}>:</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="MM"
                maxLength={2}
                value={reminderMinute}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setReminderMinute(v);
                  setTimeError(null);
                }}
                style={{ ...inputStyle, width: 64, textAlign: "center", flex: "none" }}
              />
              <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
                {(["AM", "PM"] as const).map((v) => {
                  const isActive = reminderAmPm === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setReminderAmPm(v)}
                      style={{
                        padding: "10px 14px",
                        border: "none",
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        backgroundColor: isActive
                          ? (typeof accentColor === "string" && accentColor.startsWith("#") ? accentColor + "20" : "var(--surface-variant)")
                          : "var(--surface-variant)",
                        color: isActive ? accentColor : "var(--secondary)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              {(reminderHour || reminderMinute) && (
                <button
                  type="button"
                  onClick={() => { setReminderHour(""); setReminderMinute(""); setReminderAmPm("AM"); setTimeError(null); }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface-variant)",
                    color: "var(--secondary)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {timeError && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 12,
                  backgroundColor: "var(--error, #D32F2F)" + "15",
                  border: "1px solid var(--error, #D32F2F)" + "40",
                }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 18, color: "var(--error, #D32F2F)" }}>error</span>
                <span style={{ fontSize: 13, color: "var(--error, #D32F2F)", fontWeight: 500 }}>{timeError}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                width: "100%",
                padding: 16,
                borderRadius: 16,
                fontWeight: 700,
                fontSize: 14,
                backgroundColor: accentColor,
                color: "#FFF",
                border: "none",
                cursor: name.trim() ? "pointer" : "default",
                opacity: name.trim() ? 1 : 0.4,
                transition: "opacity 0.15s",
              }}
            >
              {isEditMode ? "Save Changes" : "Create Habit"}
            </button>

            {isEditMode && onDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 16,
                  fontWeight: 600,
                  fontSize: 14,
                  backgroundColor: "transparent",
                  color: "var(--error)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                Delete Habit
              </button>
            )}
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {confirmingDelete && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              borderRadius: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmingDelete(false); }}
          >
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: 20,
                padding: 28,
                width: "85%",
                maxWidth: 340,
                border: "1px solid var(--border)",
                boxShadow: "0 16px 48px rgba(0, 0, 0, 0.3)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "var(--error)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", margin: "0 0 8px" }}>
                Delete &ldquo;{habit?.name}&rdquo;?
              </h3>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: "0 0 24px", lineHeight: 1.5 }}>
                This will permanently remove this habit and cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 14,
                    fontWeight: 600,
                    fontSize: 14,
                    backgroundColor: "var(--surface-variant)",
                    color: "var(--primary)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 14,
                    fontWeight: 600,
                    fontSize: 14,
                    backgroundColor: "var(--error)",
                    color: "#FFF",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
