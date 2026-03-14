"use client";

import { useState, useEffect } from "react";
import { Goal, Task } from "@/lib/types";
import MaterialIcon from "@/components/material-icon";

interface TaskEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  task?: Task | null;
  goals: Goal[];
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

export default function TaskEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  task,
  goals,
  userId,
  nextSortOrder,
}: TaskEditModalProps) {
  const isEditMode = !!task;

  const [type, setType] = useState<"todo" | "task">("todo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notifDate, setNotifDate] = useState("");
  const [notifTime, setNotifTime] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      setValidationError(null);
      if (task) {
        setType(task.type);
        setTitle(task.title);
        setDescription(task.description);
        setGoalId(task.goalId);
        setDueDate(task.dueDate ?? "");
        if (task.notificationDateTime) {
          const [d, t] = task.notificationDateTime.split("T");
          setNotifDate(d ?? "");
          setNotifTime(t ?? "");
        } else {
          setNotifDate("");
          setNotifTime("");
        }
      } else {
        setType("todo");
        setTitle("");
        setDescription("");
        setGoalId("");
        setDueDate("");
        setNotifDate("");
        setNotifTime("");
      }
    }
  }, [isOpen, task]);

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
    if (!title.trim()) {
      setValidationError("Please enter a title.");
      return;
    }
    if (type === "task" && !dueDate) {
      setValidationError("Please set a due date for this task.");
      return;
    }
    // Validate notification: if one part is filled, both must be
    if ((notifDate && !notifTime) || (!notifDate && notifTime)) {
      setValidationError("Please fill in both notification date and time, or leave both empty.");
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
      goalId: type === "task" ? goalId : "",
      dueDate: type === "task" ? (dueDate || null) : null,
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
    { value: "todo", label: "Quick To-Do", icon: "check_circle" },
    { value: "task", label: "Task", icon: "assignment" },
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
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--primary)",
              margin: 0,
            }}
          >
            {isEditMode ? "Edit" : "Create New"}
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
            padding: "24px 28px 28px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
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
                      padding: "10px 14px",
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
          <div>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              placeholder={
                type === "todo" ? "e.g. Buy groceries" : "e.g. Complete project report"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              autoFocus
            />
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
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: 70,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Goal selector */}
              <div>
                <label style={labelStyle}>Goal (optional)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setGoalId("")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 12,
                      border:
                        goalId === ""
                          ? "2px solid var(--primary)"
                          : "1px solid var(--border)",
                      backgroundColor:
                        goalId === ""
                          ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                          : "var(--surface-variant)",
                      color: goalId === "" ? "var(--primary)" : "var(--secondary)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: goalId === "" ? 600 : 500,
                      transition: "all 0.15s",
                    }}
                  >
                    None
                  </button>
                  {goals.map((g) => {
                    const selected = goalId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGoalId(g.id)}
                        className="flex items-center gap-2"
                        style={{
                          padding: "8px 14px",
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
                        }}
                      >
                        <MaterialIcon
                          name={g.iconName}
                          size={18}
                          color={selected ? "var(--primary)" : "var(--secondary)"}
                        />
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due date */}
              <div>
                <label style={labelStyle}>Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    ...inputStyle,
                    colorScheme: "dark",
                  }}
                />
              </div>

              {/* Notification date + time */}
              <div>
                <label style={labelStyle}>Reminder (Mobile)</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="date"
                    value={notifDate}
                    onChange={(e) => setNotifDate(e.target.value)}
                    placeholder="Date"
                    style={{
                      ...inputStyle,
                      flex: 1,
                      colorScheme: "dark",
                    }}
                  />
                  <input
                    type="time"
                    value={notifTime}
                    onChange={(e) => setNotifTime(e.target.value)}
                    placeholder="Time"
                    style={{
                      ...inputStyle,
                      flex: 1,
                      colorScheme: "dark",
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}
          >
            <button
              type="button"
              onClick={handleSave}
              style={{
                width: "100%",
                padding: 16,
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
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Validation error popup */}
        {validationError && (
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
              if (e.target === e.currentTarget) setValidationError(null);
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
                  backgroundColor: "#FF9800",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: 24, color: "#FFF" }}
                >
                  warning
                </span>
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--primary)",
                  margin: "0 0 8px",
                }}
              >
                Missing Information
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--secondary)",
                  margin: "0 0 24px",
                  lineHeight: 1.5,
                }}
              >
                {validationError}
              </p>
              <button
                type="button"
                onClick={() => setValidationError(null)}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 14,
                  fontWeight: 600,
                  fontSize: 14,
                  backgroundColor: "var(--primary)",
                  color: "var(--background)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
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
