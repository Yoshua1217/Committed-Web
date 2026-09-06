"use client";

import { useState, useEffect } from "react";
import { Bucket, Goal, Project, Task } from "@/lib/types";
import { subscribeToProjects } from "@/lib/projects-service";
import { formatEffort, taskGoalId } from "@/lib/task-planning";
import MaterialIcon from "@/components/material-icon";
import TaskSchedulePicker, { formatDateOnly, formatScheduleValue, hasCompleteDateTime } from "@/components/task-schedule-picker";

function argbToHex(argb: number): string {
  return `#${(argb & 0x00ffffff).toString(16).padStart(6, "0")}`;
}

interface TaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void | Promise<void>;
  onDelete?: (taskId: string) => void | Promise<void>;
  task?: Task | null;
  goals: Goal[];
  buckets: Bucket[];
  defaultType?: "todo" | "task";
  userId: string;
  nextSortOrder: number;
  defaultProjectId?: string;
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
  defaultProjectId = "",
}: TaskEditModalProps) {
  const isEditMode = !!task;

  const [type, setType] = useState<"todo" | "task">("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [goalId, setGoalId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    return subscribeToProjects(userId, setProjects, () => setProjectError("Projects could not load. Try reopening this task."));
  }, [isOpen, userId]);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [startDateTime, setStartDateTime] = useState("");
  const [dueDateTime, setDueDateTime] = useState("");
  const [startAllDay, setStartAllDay] = useState(false);
  const [dueAllDay, setDueAllDay] = useState(false);
  const [notifDate, setNotifDate] = useState("");
  const [notifTime, setNotifTime] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const selectedProject = projects.find((project) => project.id === projectId);
  const effectiveGoalId = taskGoalId({ projectId, goalId }, projects);
  const selectedGoal = goals.find((goal) => goal.id === effectiveGoalId);
  const selectedGoalBucket = buckets.find((bucket) => bucket.id === selectedGoal?.bucketId);
  const selectedPriority = priorityOptions.find((option) => option.value === priority) ?? priorityOptions[1];
  const bucketsWithGoals = buckets
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((bucket) => ({ bucket, goals: goals.filter((goal) => goal.bucketId === bucket.id) }))
    .filter((group) => group.goals.length > 0);
  const selectedTimeSummaries = [
    { label: "Due", value: hasCompleteDateTime(dueDateTime) ? (dueAllDay ? `${formatDateOnly(dueDateTime)} · All day` : formatScheduleValue(dueDateTime, "")) : null },
    { label: "Start", value: hasCompleteDateTime(startDateTime) ? (startAllDay ? `${formatDateOnly(startDateTime)} · All day` : formatScheduleValue(startDateTime, "")) : null },
    { label: "Reminder", value: notifDate && notifTime ? formatScheduleValue(`${notifDate}T${notifTime}`, "") : null },
  ].filter((summary): summary is { label: string; value: string } => Boolean(summary.value));

  const changePriority = (direction: 1 | -1) => {
    const currentIndex = priorityOptions.findIndex((option) => option.value === priority);
    const nextIndex = (currentIndex + direction + priorityOptions.length) % priorityOptions.length;
    setPriority(priorityOptions[nextIndex].value);
  };

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      setGoalPickerOpen(false);
      setSchedulePickerOpen(false);
      setValidationError(null);
      setSaving(false);
      setProjectError(null);
      setProjectId(task?.projectId ?? defaultProjectId);
      setEstimatedMinutes(task?.estimatedMinutes ? String(task.estimatedMinutes) : "");
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
  }, [isOpen, task, defaultType, defaultProjectId]);

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

  const handleSave = async () => {
    if (saving) return;
    const errors: string[] = [];
    if (!title.trim()) {
      errors.push("Enter a title.");
    }
    if (type === "task" && estimatedMinutes && (!Number.isInteger(Number(estimatedMinutes)) || Number(estimatedMinutes) <= 0)) errors.push("Enter a positive whole number of minutes.");
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
      goalId: type === "task" ? effectiveGoalId : "",
      projectId: type === "task" ? projectId : "",
      estimatedMinutes: type === "task" && estimatedMinutes ? Number(estimatedMinutes) : null,
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
    setSaving(true);
    try {
      await onSave(saved);
      onClose();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Task could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (task && onDelete && !saving) {
      setSaving(true);
      try { await onDelete(task.id); onClose(); }
      catch (error) { setValidationError(error instanceof Error ? error.message : "Task could not be deleted."); }
      finally { setConfirmingDelete(false); setSaving(false); }
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

              <div className="planning-form-grid">
                <label style={labelStyle}>Project (optional)
                  <select aria-label="Project" value={projectId} onChange={(event) => { setGoalId(effectiveGoalId); setProjectId(event.target.value); setGoalPickerOpen(false); }} style={{ ...inputStyle, marginTop: 8 }}>
                    <option value="">No project</option>
                    {projects.filter((project) => !project.archived || project.id === projectId).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    {projectId && !projects.some((project) => project.id === projectId) && <option value={projectId}>Current project</option>}
                  </select>
                </label>
                <label style={labelStyle}>Estimated effort (minutes)
                  <input aria-label="Estimated effort in minutes" type="number" min="1" step="1" placeholder="e.g. 90" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
                </label>
              </div>
              {projectError && <p role="alert" style={{ color: "var(--error)", fontSize: 12 }}>{projectError}</p>}
              <p style={{ color: "var(--secondary)", fontSize: 12, margin: 0 }}>
                {estimatedMinutes && startDateTime && !startAllDay
                  ? `${formatEffort(Number(estimatedMinutes))} work block from ${formatScheduleValue(startDateTime, "")}. Your due date remains the deadline.`
                  : "Add an effort estimate to plan this task in Calendar → Unscheduled. An all-day date reserves no specific time."}
              </p>
              {!!projectId && <p style={{ color: "var(--secondary)", fontSize: 12, margin: 0 }}>This task contributes its estimated effort to project progress.</p>}

              {/* Goal selector */}
              <div>
                <label style={labelStyle}>{projectId ? "Goal · inherited from project" : "Goal (optional)"}</label>
                <button
                  type="button"
                  disabled={!!projectId}
                  onClick={() => setGoalPickerOpen(true)}
                  className="flex items-center justify-between"
                  style={{ ...inputStyle, cursor: projectId ? "default" : "pointer", textAlign: "left" }}
                >
                  <span className="flex items-center gap-2">
                    {effectiveGoalId ? (
                      <>
                        <MaterialIcon name={selectedGoal?.iconName ?? "flag"} size={20} color={selectedGoalBucket ? argbToHex(selectedGoalBucket.color) : "var(--primary)"} />
                        {selectedGoal?.name ?? "Choose a goal"}
                      </>
                    ) : "No goal selected"}
                  </span>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>{projectId ? "link" : "chevron_right"}</span>
                </button>
                {!!projectId && <p style={{ color: "var(--secondary)", fontSize: 12, margin: "8px 0 0" }}>{selectedProject ? `Follows ${selectedProject.name}. Change the goal in the project to update its tasks.` : "The goal will be inherited from the selected project when saved."}</p>}
              </div>

              {/* Schedule and reminder picker */}
              <div>
                <label style={labelStyle}>Timing</label>
                <button type="button" onClick={() => setSchedulePickerOpen(true)} className="flex items-center justify-between" style={{ ...inputStyle, minHeight: 48, cursor: "pointer", textAlign: "left", border: validationError && !hasCompleteDateTime(dueDateTime) ? "1px solid var(--error)" : inputStyle.border }}>
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
              onClick={() => void handleSave()}
              disabled={saving}
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
              {saving ? "Saving…" : isEditMode ? "Save Changes" : type === "todo" ? "Add To-Do" : "Create Task"}
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

          {schedulePickerOpen && <TaskSchedulePicker
            values={{ start: startDateTime, due: dueDateTime, reminder: notifDate && notifTime ? `${notifDate}T${notifTime}` : "", startAllDay, dueAllDay }}
            onClose={() => setSchedulePickerOpen(false)}
            onSave={(values) => {
              setStartDateTime(values.start);
              setDueDateTime(values.due);
              const [reminderDate, reminderTime] = values.reminder.split("T");
              setNotifDate(reminderDate ?? "");
              setNotifTime(reminderTime ?? "");
              setStartAllDay(values.startAllDay);
              setDueAllDay(values.dueAllDay);
              setSchedulePickerOpen(false);
            }}
          />}

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
                  onClick={() => void handleDelete()}
                  disabled={saving}
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
