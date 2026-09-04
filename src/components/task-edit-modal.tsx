"use client";

import { useState, useEffect } from "react";
import { Bucket, Goal, Task } from "@/lib/types";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  return `#${(argb & 0x00ffffff).toString(16).padStart(6, "0")}`;
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateTimeValue(date: Date, time = "09:00"): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

function parseDateTime(value: string): Date {
  const [datePart, timePart = "09:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function formatScheduleValue(value: string, emptyLabel: string): string {
  if (!value) return emptyLabel;
  const date = parseDateTime(value);
  if (!value.split("T")[1]) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDateOnly(value: string): string {
  return parseDateTime(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hasCompleteDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

interface TaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  task?: Task | null;
  goals: Goal[];
  buckets: Bucket[];
  defaultType?: "todo" | "task";
  userId: string;
  nextSortOrder: number;
}

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
  padding: "10px 12px",
  borderRadius: 12,
  backgroundColor: "var(--surface-variant)",
  color: "var(--primary)",
  border: "1px solid var(--border)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const priorityOptions: { value: Task["priority"]; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#36a269" },
  { value: "medium", label: "Medium", color: "#4f8cff" },
  { value: "high", label: "High", color: "#e69b25" },
  { value: "critical", label: "Critical", color: "#dd5252" },
];

export default function TaskEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  task,
  goals,
  buckets,
  defaultType = "task",
  userId,
  nextSortOrder,
}: TaskEditModalProps) {
  const isEditMode = !!task;

  const [type, setType] = useState<"todo" | "task">("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [goalId, setGoalId] = useState("");
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduleField, setScheduleField] = useState<"start" | "due" | "reminder">("start");
  const [draftStartDateTime, setDraftStartDateTime] = useState("");
  const [draftDueDateTime, setDraftDueDateTime] = useState("");
  const [draftReminderDateTime, setDraftReminderDateTime] = useState("");
  const [scheduleMonth, setScheduleMonth] = useState(() => new Date());
  const [startDateTime, setStartDateTime] = useState("");
  const [dueDateTime, setDueDateTime] = useState("");
  const [startAllDay, setStartAllDay] = useState(false);
  const [dueAllDay, setDueAllDay] = useState(false);
  const [draftStartAllDay, setDraftStartAllDay] = useState(false);
  const [draftDueAllDay, setDraftDueAllDay] = useState(false);
  const [timeHourText, setTimeHourText] = useState("");
  const [timeMinuteText, setTimeMinuteText] = useState("");
  const [scheduleValidationError, setScheduleValidationError] = useState<string | null>(null);
  const [notifDate, setNotifDate] = useState("");
  const [notifTime, setNotifTime] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const selectedGoal = goals.find((goal) => goal.id === goalId);
  const selectedGoalBucket = buckets.find((bucket) => bucket.id === selectedGoal?.bucketId);
  const selectedPriority = priorityOptions.find((option) => option.value === priority) ?? priorityOptions[1];
  const bucketsWithGoals = buckets
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((bucket) => ({ bucket, goals: goals.filter((goal) => goal.bucketId === bucket.id) }))
    .filter((group) => group.goals.length > 0);
  const activeDraftValue = scheduleField === "start" ? draftStartDateTime : scheduleField === "due" ? draftDueDateTime : draftReminderDateTime;
  const activeDraftAllDay = scheduleField === "start" ? draftStartAllDay : scheduleField === "due" ? draftDueAllDay : false;
  const activeDraftDate = activeDraftValue
    ? parseDateTime(activeDraftValue)
    : (() => {
        const date = new Date();
        if (scheduleField === "due") date.setHours(0, 0, 0, 0);
        return date;
      })();
  const calendarStart = new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth(), 1);
  calendarStart.setDate(1 - calendarStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
  const selectedTimeSummaries = [
    { label: "Due", value: hasCompleteDateTime(dueDateTime) ? (dueAllDay ? `${formatDateOnly(dueDateTime)} · All day` : formatScheduleValue(dueDateTime, "")) : null },
    { label: "Start", value: hasCompleteDateTime(startDateTime) ? (startAllDay ? `${formatDateOnly(startDateTime)} · All day` : formatScheduleValue(startDateTime, "")) : null },
    { label: "Reminder", value: notifDate && notifTime ? formatScheduleValue(`${notifDate}T${notifTime}`, "") : null },
  ].filter((summary): summary is { label: string; value: string } => Boolean(summary.value));

  const openSchedulePicker = (field: "start" | "due" | "reminder") => {
    const today = new Date();
    const start = startDateTime;
    const due = dueDateTime;
    const reminder = notifDate && notifTime ? `${notifDate}T${notifTime}` : "";
    setDraftStartDateTime(start);
    setDraftDueDateTime(due);
    setDraftReminderDateTime(reminder);
    setDraftStartAllDay(startAllDay);
    setDraftDueAllDay(dueAllDay);
    setScheduleField(field);
    const selectedValue = field === "start" ? start : field === "due" ? due : reminder;
    const selected = selectedValue ? parseDateTime(selectedValue) : today;
    setScheduleMonth(selected);
    const selectedTime = selectedValue.split("T")[1] || (field === "due" ? "00:00" : "");
    const selectedTimeDate = selectedTime ? parseDateTime(`${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}T${selectedTime}`) : selected;
    setTimeHourText(selectedTime ? String(((selectedTimeDate.getHours() + 11) % 12) + 1) : "");
    setTimeMinuteText(selectedTime ? pad(selectedTimeDate.getMinutes()) : "");
    setScheduleValidationError(null);
    setSchedulePickerOpen(true);
  };

  const updateActiveDraft = (date: Date) => {
    const isPm = activeDraftDate.getHours() >= 12;
    const time = hasValidTimeText()
      ? `${pad((Number(timeHourText) % 12) + (isPm ? 12 : 0))}:${pad(Number(timeMinuteText))}`
      : scheduleField === "due" ? "00:00" : "12:00";
    const value = dateTimeValue(date, time);
    setActiveDraftValue(value);
    const selected = parseDateTime(value);
    syncTimeText(selected);
  };

  const setActiveDraftValue = (value: string) => {
    if (scheduleField === "start") setDraftStartDateTime(value);
    else if (scheduleField === "due") setDraftDueDateTime(value);
    else setDraftReminderDateTime(value);
  };

  const hasValidTimeText = (hour = timeHourText, minute = timeMinuteText) => {
    const parsedHour = Number(hour);
    const parsedMinute = Number(minute);
    return hour !== "" && minute !== "" && Number.isInteger(parsedHour) && Number.isInteger(parsedMinute) && parsedHour >= 1 && parsedHour <= 12 && parsedMinute >= 0 && parsedMinute <= 59;
  };

  const commitTypedTime = (hour: string, minute: string) => {
    if (!hasValidTimeText(hour, minute)) return;
    if (!activeDraftValue.split("T")[0]) return;
    const next = new Date(activeDraftDate);
    const isPm = next.getHours() >= 12;
    next.setHours((Number(hour) % 12) + (isPm ? 12 : 0), Number(minute));
    setActiveDraftValue(dateTimeValue(next, `${pad(next.getHours())}:${pad(next.getMinutes())}`));
    setScheduleValidationError(null);
  };

  const syncTimeText = (date: Date) => {
    setTimeHourText(String(((date.getHours() + 11) % 12) + 1));
    setTimeMinuteText(pad(date.getMinutes()));
  };

  const closeSchedulePicker = () => {
    const hasDate = Boolean(activeDraftValue.split("T")[0]);
    if (!hasDate) {
      setSchedulePickerOpen(false);
      return;
    }
    if (!hasDate || (!activeDraftAllDay && !hasValidTimeText())) {
      setScheduleValidationError("Enter a valid hour and minute before closing the picker.");
      return;
    }
    setSchedulePickerOpen(false);
  };

  const changePriority = (direction: 1 | -1) => {
    const currentIndex = priorityOptions.findIndex((option) => option.value === priority);
    const nextIndex = (currentIndex + direction + priorityOptions.length) % priorityOptions.length;
    setPriority(priorityOptions[nextIndex].value);
  };

  const adjustActiveTime = (hours: number, minutes: number) => {
    const next = new Date(activeDraftDate);
    next.setHours(next.getHours() + hours, next.getMinutes() + minutes);
    setActiveDraftValue(dateTimeValue(next, `${pad(next.getHours())}:${pad(next.getMinutes())}`));
    syncTimeText(next);
  };

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      setGoalPickerOpen(false);
      setValidationError(null);
      if (task) {
        setType(task.type);
        setTitle(task.title);
        setDescription(task.description);
        setPriority(task.priority ?? "medium");
        setGoalId(task.goalId);
        setStartDateTime(task.startDateTime ?? "");
        setDueDateTime(task.dueDateTime ?? (task.dueDate ? `${task.dueDate}T00:00` : ""));
        setStartAllDay(task.startAllDay ?? false);
        setDueAllDay(task.dueAllDay ?? false);
        if (task.notificationDateTime) {
          const [d, t] = task.notificationDateTime.split("T");
          setNotifDate(d ?? "");
          setNotifTime(t ?? "");
        } else {
          setNotifDate("");
          setNotifTime("");
        }
      } else {
        setType(defaultType);
        setTitle("");
        setDescription("");
        setPriority("medium");
        setGoalId("");
        setStartDateTime("");
        setDueDateTime("");
        setStartAllDay(false);
        setDueAllDay(false);
        setNotifDate("");
        setNotifTime("");
      }
    }
  }, [isOpen, task, defaultType]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const errors: string[] = [];
    if (!title.trim()) {
      errors.push("Enter a title.");
    }
    if (type === "task" && !hasCompleteDateTime(dueDateTime)) {
      errors.push("Set a due date and time.");
    }
    if (type === "task" && hasCompleteDateTime(startDateTime) && hasCompleteDateTime(dueDateTime) && startDateTime > dueDateTime) {
      errors.push("Set the start date and time before the due date and time.");
    }
    // Validate notification: if one part is filled, both must be
    if ((notifDate && !notifTime) || (!notifDate && notifTime)) {
      errors.push("Complete both reminder date and time, or leave both empty.");
    }
    if (errors.length > 0) {
      setValidationError(errors.join(" "));
      return;
    }

    let notificationDateTime: string | null = null;
    if (notifDate && notifTime) {
      notificationDateTime = `${notifDate}T${notifTime}`;
    }

    const saved: Task = {
      id: task?.id ?? crypto.randomUUID(),
      userId: task?.userId ?? userId,
      type,
      title: title.trim(),
      description: type === "task" ? description.trim() : "",
      priority,
      goalId: type === "task" ? goalId : "",
      // Keep the legacy date-only field in sync for existing clients and sorting.
      dueDate: type === "task" ? (dueDateTime.split("T")[0] || null) : null,
      startDateTime: type === "task" ? (startDateTime || null) : null,
      dueDateTime: type === "task" ? (dueDateTime || null) : null,
      startAllDay: type === "task" ? startAllDay : false,
      dueAllDay: type === "task" ? dueAllDay : false,
      notificationDateTime: type === "task" ? notificationDateTime : null,
      completed: task?.completed ?? false,
      completedAt: task?.completedAt ?? null,
      archived: task?.archived ?? false,
      sortOrder: task?.sortOrder ?? nextSortOrder,
      createdAt: task?.createdAt ?? Date.now(),
    };
    onSave(saved);
    onClose();
  };

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.id);
      setConfirmingDelete(false);
      onClose();
    }
  };

  const typePills: { value: "todo" | "task"; label: string; icon: string }[] = [
    { value: "task", label: "Task", icon: "assignment" },
    { value: "todo", label: "Quick To-Do", icon: "check_circle" },
  ];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
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
        padding: 12,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--surface)",
          borderRadius: 24,
          width: "100%",
          maxWidth: 820,
          maxHeight: "calc(100dvh - 24px)",
          overflow: "auto",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "20px 24px 0" }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--primary)",
              margin: 0,
            }}
          >
            {isEditMode ? "Edit" : "Create New Task"}
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
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "16px 24px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Type toggle */}
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {typePills.map((p) => {
                const selected = type === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setType(p.value)}
                    className="flex items-center gap-2"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: selected
                        ? "2px solid var(--primary)"
                        : "1px solid var(--border)",
                      backgroundColor: selected
                        ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                        : "var(--surface-variant)",
                      color: selected ? "var(--primary)" : "var(--secondary)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: selected ? 600 : 500,
                      transition: "all 0.15s",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      className="material-symbols-rounded"
                      style={{ fontSize: 18 }}
                    >
                      {p.icon}
                    </span>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input
                type="text"
                placeholder={
                  type === "todo" ? "e.g. Buy groceries" : "e.g. Complete project report"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ ...inputStyle, border: validationError && !title.trim() ? "1px solid var(--error)" : inputStyle.border }}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: "flex", gap: 7, height: 44 }}>
                <div className="flex items-center gap-2" style={{ flex: 1, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-variant)", color: "var(--primary)", fontSize: 13, fontWeight: 700 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedPriority.color, flexShrink: 0 }} />
                  {selectedPriority.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <button type="button" onClick={() => changePriority(1)} aria-label="Increase priority" style={{ width: 31, flex: 1, padding: 0, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", display: "grid", placeItems: "center" }}><MaterialIcon name="keyboard_arrow_up" size={17} /></button>
                  <button type="button" onClick={() => changePriority(-1)} aria-label="Decrease priority" style={{ width: 31, flex: 1, padding: 0, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", display: "grid", placeItems: "center" }}><MaterialIcon name="keyboard_arrow_down" size={17} /></button>
                </div>
              </div>
            </div>
          </div>

          {/* Task-only fields */}
          {type === "task" && (
            <>
              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  placeholder="Add details about this task..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: 56,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Goal selector */}
              <div>
                <label style={labelStyle}>Goal (optional)</label>
                <button
                  type="button"
                  onClick={() => setGoalPickerOpen(true)}
                  className="flex items-center justify-between"
                  style={{ ...inputStyle, cursor: "pointer", textAlign: "left" }}
                >
                  <span className="flex items-center gap-2">
                    {goalId ? (
                      <>
                        <MaterialIcon name={selectedGoal?.iconName ?? "flag"} size={20} color={selectedGoalBucket ? argbToHex(selectedGoalBucket.color) : "var(--primary)"} />
                        {selectedGoal?.name ?? "Choose a goal"}
                      </>
                    ) : "No goal selected"}
                  </span>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>chevron_right</span>
                </button>
              </div>

              {/* Schedule and reminder picker */}
              <div>
                <label style={labelStyle}>Timing</label>
                <button type="button" onClick={() => openSchedulePicker("due")} className="flex items-center justify-between" style={{ ...inputStyle, minHeight: 48, cursor: "pointer", textAlign: "left", border: validationError && !hasCompleteDateTime(dueDateTime) ? "1px solid var(--error)" : inputStyle.border }}>
                  <span className="flex items-center gap-3">
                    <MaterialIcon name="schedule" size={20} color="var(--primary)" />
                    <span>
                      <strong style={{ display: "block", color: "var(--primary)", fontSize: 14 }}>Set times</strong>
                      <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "3px 8px", marginTop: 3, color: "var(--secondary)", fontSize: 12 }}>
                        {selectedTimeSummaries.length > 0
                          ? selectedTimeSummaries.map((summary, index) => (
                            <span key={summary.label} className="flex items-center" style={{ gap: 8 }}>
                              {index > 0 && <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--secondary)", opacity: 0.65 }} />}
                              <span><strong style={{ color: "var(--primary)", fontWeight: 650 }}>{summary.label}:</strong> {summary.value}</span>
                            </span>
                          ))
                          : <span>Add start, due, and reminder times</span>}
                      </span>
                    </span>
                  </span>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>chevron_right</span>
                </button>
              </div>
            </>
          )}

          {/* Actions */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}
          >
            <p style={{ minHeight: 18, margin: 0, color: "var(--error)", fontSize: 13, fontWeight: 600, textAlign: "center", visibility: validationError ? "visible" : "hidden" }}>
              {validationError || "Validation message"}
            </p>
            <button
              type="button"
              onClick={handleSave}
              style={{
                width: "100%",
                padding: 13,
                borderRadius: 16,
                fontWeight: 700,
                fontSize: 14,
                backgroundColor: "var(--primary)",
                color: "var(--background)",
                border: "none",
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
            >
              {isEditMode ? "Save Changes" : type === "todo" ? "Add To-Do" : "Create Task"}
            </button>

            {isEditMode && onDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                style={{
                  width: "100%",
                  padding: 12,
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
                Delete
              </button>
            )}
          </div>
          </div>

          {goalPickerOpen && (
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) setGoalPickerOpen(false);
              }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                backgroundColor: "rgba(0, 0, 0, 0.55)",
                backdropFilter: "blur(5px)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 560,
                  maxHeight: "75vh",
                  overflow: "auto",
                  padding: 28,
                  borderRadius: 20,
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "var(--primary)", fontSize: 18, fontWeight: 700 }}>Choose a goal</h3>
                    <p style={{ margin: "5px 0 0", color: "var(--secondary)", fontSize: 13 }}>Link this task to one of your goals.</p>
                  </div>
                  <button type="button" onClick={() => setGoalPickerOpen(false)} aria-label="Close goal picker" style={{ border: "none", background: "var(--surface-variant)", color: "var(--secondary)", borderRadius: 10, cursor: "pointer", padding: 7, display: "flex" }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setGoalId(""); setGoalPickerOpen(false); }}
                    className="flex items-center justify-between"
                    style={{ padding: "14px 16px", borderRadius: 14, border: goalId === "" ? "2px solid var(--primary)" : "1px solid var(--border)", background: goalId === "" ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", textAlign: "left", fontSize: 14 }}
                  >
                    <span className="flex items-center gap-3"><MaterialIcon name="flag" size={20} color="var(--secondary)" />No goal</span>
                    {goalId === "" && <span className="material-symbols-rounded" style={{ fontSize: 20 }}>check</span>}
                  </button>
                  {bucketsWithGoals.map(({ bucket, goals: bucketGoals }) => {
                    const bucketColor = argbToHex(bucket.color);
                    return (
                      <div key={bucket.id} style={{ marginTop: 10 }}>
                        <div className="flex items-center gap-2" style={{ padding: "0 4px", marginBottom: 7, color: "var(--secondary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          <MaterialIcon name={bucket.iconName} size={15} color={bucketColor} />
                          {bucket.name}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {bucketGoals.map((goal) => {
                            const selected = goalId === goal.id;
                            return (
                              <button
                                key={goal.id}
                                type="button"
                                onClick={() => { setGoalId(goal.id); setGoalPickerOpen(false); }}
                                className="flex items-center justify-between"
                                style={{ padding: "14px 16px", borderRadius: 14, border: selected ? `2px solid ${bucketColor}` : "1px solid var(--border)", background: selected ? `${bucketColor}18` : "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: selected ? 600 : 500 }}
                              >
                                <span className="flex items-center gap-3"><MaterialIcon name={goal.iconName} size={20} color={bucketColor} />{goal.name}</span>
                                {selected && <span className="material-symbols-rounded" style={{ fontSize: 20, color: bucketColor }}>check</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {schedulePickerOpen && (
            <div
              onClick={(e) => { if (e.target === e.currentTarget) closeSchedulePicker(); }}
              style={{ position: "fixed", inset: 0, zIndex: 61, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0, 0, 0, 0.55)", backdropFilter: "blur(5px)" }}
            >
              <div style={{ width: "100%", maxWidth: 680, padding: 28, borderRadius: 22, backgroundColor: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "var(--primary)", fontSize: 18, fontWeight: 700 }}>Set schedule</h3>
                    <p style={{ margin: "5px 0 0", color: "var(--secondary)", fontSize: 13 }}>Choose the start, due, and reminder date and time.</p>
                  </div>
                  <button type="button" onClick={closeSchedulePicker} aria-label="Close schedule picker" style={{ border: "none", background: "var(--surface-variant)", color: "var(--secondary)", borderRadius: 10, cursor: "pointer", padding: 7, display: "flex" }}><MaterialIcon name="close" size={20} /></button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {(["due", "start", "reminder"] as const).map((field) => {
                    const selected = scheduleField === field;
                    const value = field === "start" ? draftStartDateTime : field === "due" ? draftDueDateTime : draftReminderDateTime;
                    const label = field === "start" ? "Start" : field === "due" ? "Due" : "Reminder";
                    return <button key={field} type="button" onClick={() => { const hasActiveDate = Boolean(activeDraftValue.split("T")[0]); if (!activeDraftAllDay && (hasActiveDate || timeHourText || timeMinuteText) && !hasValidTimeText()) { setScheduleValidationError("Enter a valid hour and minute before changing fields."); return; } const next = value ? parseDateTime(value) : new Date(); setScheduleField(field); setScheduleMonth(next); if (value.split("T")[1]) syncTimeText(next); else { setTimeHourText(""); setTimeMinuteText(""); } setScheduleValidationError(null); }} style={{ flex: 1, padding: "11px 10px", borderRadius: 12, border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", background: selected ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface-variant)", color: selected ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 600 }}>{label} · {formatScheduleValue(value, "Select")}</button>;
                  })}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
                  <section style={{ padding: 16, borderRadius: 16, background: "var(--surface-variant)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 15 }}>
                      <button type="button" onClick={() => setScheduleMonth(new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() - 1, 1))} aria-label="Previous month" style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="chevron_left" size={19} /></button>
                      <strong style={{ color: "var(--primary)", fontSize: 14 }}>{scheduleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
                      <button type="button" onClick={() => setScheduleMonth(new Date(scheduleMonth.getFullYear(), scheduleMonth.getMonth() + 1, 1))} aria-label="Next month" style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="chevron_right" size={19} /></button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 5 }}>{weekDays.map((day) => <span key={day} style={{ color: "var(--secondary)", fontSize: 10, fontWeight: 700 }}>{day}</span>)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                      {calendarDays.map((date) => {
                        const selected = date.toDateString() === activeDraftDate.toDateString();
                        const inMonth = date.getMonth() === scheduleMonth.getMonth();
                        return <button key={date.toISOString()} type="button" onClick={() => updateActiveDraft(date)} style={{ aspectRatio: "1", border: "none", borderRadius: 10, background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--background)" : inMonth ? "var(--primary)" : "var(--secondary)", cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 500 }}>{date.getDate()}</button>;
                      })}
                    </div>
                  </section>

                  <section style={{ padding: 16, borderRadius: 16, background: "var(--surface-variant)", border: "1px solid var(--border)" }}>
                    <div style={{ padding: 8, margin: -8, borderRadius: 12, background: activeDraftAllDay ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent", opacity: activeDraftAllDay ? 0.45 : 1, pointerEvents: activeDraftAllDay ? "none" : "auto", transition: "all 0.15s" }}>
                      <p style={{ textAlign: "center", color: "var(--primary)", fontSize: 14, fontWeight: 700, margin: "1px 0 15px" }}>Time</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, textAlign: "center" }}>
                      {([["hour", activeDraftDate.getHours(), () => adjustActiveTime(-1, 0), () => adjustActiveTime(1, 0)], ["minute", activeDraftDate.getMinutes(), () => adjustActiveTime(0, -5), () => adjustActiveTime(0, 5)]] as const).map(([label, , earlier, later]) => <div key={label}>
                        <button type="button" onClick={earlier} aria-label={`Move ${label} earlier`} style={{ width: 36, height: 32, border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_up" size={18} /></button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={label}
                          value={label === "hour" ? timeHourText : timeMinuteText}
                          onChange={(event) => {
                            const nextText = event.target.value.replace(/\D/g, "").slice(0, 2);
                            if (label === "hour") {
                              setTimeHourText(nextText);
                              commitTypedTime(nextText, timeMinuteText);
                            } else {
                              setTimeMinuteText(nextText);
                              commitTypedTime(timeHourText, nextText);
                            }
                          }}
                          style={{ display: "block", width: 50, margin: "9px auto 2px", padding: 0, border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 18, fontWeight: 700, textAlign: "center" }}
                        />
                        <span style={{ color: "var(--secondary)", fontSize: 10 }}>{label}</span>
                        <button type="button" onClick={later} aria-label={`Move ${label} later`} style={{ display: "block", width: 36, height: 32, margin: "9px auto 0", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_down" size={18} /></button>
                      </div>)}
                      </div>
                      <div style={{ display: "flex", gap: 5, margin: "17px auto 0", width: "fit-content", padding: 3, borderRadius: 10, background: "var(--surface)" }}>
                        {["AM", "PM"].map((period) => { const selected = period === (activeDraftDate.getHours() >= 12 ? "PM" : "AM"); return <button key={period} type="button" onClick={() => { if (!hasValidTimeText()) { setScheduleValidationError("Enter a valid hour and minute before changing AM or PM."); return; } const next = new Date(activeDraftDate); const hours = next.getHours(); next.setHours(period === "AM" ? hours % 12 : (hours % 12) + 12); setActiveDraftValue(dateTimeValue(next, `${pad(next.getHours())}:${pad(next.getMinutes())}`)); syncTimeText(next); }} style={{ padding: "7px 12px", border: "none", borderRadius: 7, background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--background)" : "var(--secondary)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{period}</button>; })}
                      </div>
                    </div>
                    {scheduleField !== "reminder" && <button type="button" onClick={() => { if (scheduleField === "start") setDraftStartAllDay((current) => !current); else setDraftDueAllDay((current) => !current); }} className="flex items-center justify-between" style={{ width: "100%", marginTop: 16, padding: "10px 11px", border: activeDraftAllDay ? "1px solid var(--primary)" : "1px solid var(--border)", borderRadius: 10, background: activeDraftAllDay ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)", color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      {scheduleField === "start" ? "Start all day" : "Due all day"}
                      <span style={{ width: 32, height: 18, padding: 2, borderRadius: 999, background: activeDraftAllDay ? "var(--primary)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: activeDraftAllDay ? "flex-end" : "flex-start" }}><span style={{ width: 14, height: 14, borderRadius: "50%", background: activeDraftAllDay ? "var(--background)" : "var(--secondary)" }} /></span>
                    </button>}
                  </section>
                </div>

                {scheduleValidationError && <p style={{ margin: "16px 0 -4px", color: "var(--error)", fontSize: 12, fontWeight: 600, textAlign: "center" }}>{scheduleValidationError}</p>}
                <button type="button" onClick={() => { const hasDate = Boolean(activeDraftValue.split("T")[0]); if (hasDate && (!activeDraftAllDay && !hasValidTimeText())) { setScheduleValidationError("Enter a valid hour and minute before saving."); return; } setStartDateTime(draftStartAllDay ? `${draftStartDateTime.split("T")[0]}T00:00` : draftStartDateTime); setDueDateTime(draftDueAllDay ? `${draftDueDateTime.split("T")[0]}T23:59` : draftDueDateTime); const [reminderDate, reminderTime] = draftReminderDateTime.split("T"); setNotifDate(reminderDate ?? ""); setNotifTime(reminderTime ?? ""); setStartAllDay(draftStartAllDay); setDueAllDay(draftDueAllDay); setSchedulePickerOpen(false); }} style={{ width: "100%", marginTop: 20, padding: 14, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Save & Close</button>
              </div>
            </div>
          )}

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
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmingDelete(false);
            }}
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
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--primary)",
                  margin: "0 0 8px",
                }}
              >
                Delete &ldquo;{task?.title}&rdquo;?
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--secondary)",
                  margin: "0 0 24px",
                  lineHeight: 1.5,
                }}
              >
                This will permanently remove this {task?.type === "todo" ? "to-do" : "task"} and cannot be undone.
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
