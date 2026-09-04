"use client";

import { useEffect } from "react";
import MaterialIcon from "@/components/material-icon";
import { Bucket, Goal, Task } from "@/lib/types";

const priorityMeta: Record<Task["priority"], { label: string; color: string }> = {
  low: { label: "Low", color: "#36a269" },
  medium: { label: "Medium", color: "#4f8cff" },
  high: { label: "High", color: "#e69b25" },
  critical: { label: "Critical", color: "#dd5252" },
};

function argbToHex(argb: number) {
  return `#${(argb & 0x00ffffff).toString(16).padStart(6, "0")}`;
}

function formatDateTime(value: string | number | null, allDay = false) {
  if (!value) return "Not set";
  if (typeof value === "number") {
    return new Date(value).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = (timePart ?? "00:00").split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  const dateLabel = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return allDay ? `${dateLabel} · All day` : `${dateLabel} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function Detail({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div style={{ gridColumn: wide ? "1 / -1" : undefined, minWidth: 0, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-variant)" }}><p style={{ margin: "0 0 4px", color: "var(--secondary)", fontSize: 10, fontWeight: 750, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</p><div style={{ color: "var(--primary)", fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{children}</div></div>;
}

interface TaskDetailsModalProps {
  isOpen: boolean;
  task: Task | null;
  goals: Goal[];
  buckets: Bucket[];
  onClose: () => void;
  onEdit: () => void;
}

export default function TaskDetailsModal({ isOpen, task, goals, buckets, onClose, onEdit }: TaskDetailsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const goal = goals.find((item) => item.id === task.goalId);
  const bucket = goal ? buckets.find((item) => item.id === goal.bucketId) : undefined;
  const priority = priorityMeta[task.priority ?? "medium"];
  const dueValue = task.dueDateTime ?? task.dueDate;

  return <div onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, background: "rgba(0, 0, 0, .6)", backdropFilter: "blur(8px)" }}>
    <section role="dialog" aria-modal="true" aria-label="Task details" style={{ width: "100%", maxWidth: 760, maxHeight: "calc(100dvh - 24px)", overflow: "hidden", border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", boxShadow: "0 24px 80px rgba(0, 0, 0, .4)" }}>
      <header className="flex items-start justify-between" style={{ gap: 16, padding: "20px 22px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ minWidth: 0 }}><div className="flex items-center" style={{ gap: 8, marginBottom: 6, color: "var(--secondary)", fontSize: 12, fontWeight: 700 }}><span className="material-symbols-rounded" style={{ fontSize: 17 }}>{task.type === "todo" ? "check_circle" : "assignment"}</span>{task.type === "todo" ? "Quick To-Do" : "Task"}{task.completed && <span style={{ color: "#36a269" }}>Completed</span>}</div><h2 style={{ margin: 0, overflowWrap: "anywhere", color: "var(--primary)", fontSize: 22, fontWeight: 750, lineHeight: 1.15 }}>{task.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close task details" style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: 11, background: "var(--surface-variant)", color: "var(--secondary)", cursor: "pointer" }}><span className="material-symbols-rounded">close</span></button>
      </header>
      <div style={{ padding: "14px 22px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <Detail label="Priority"><span className="flex items-center" style={{ gap: 7, color: priority.color }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: priority.color }} />{priority.label}</span></Detail>
        <Detail label="Goal">{goal ? <span className="flex items-center" style={{ gap: 7 }}><MaterialIcon name={goal.iconName} size={16} color={bucket ? argbToHex(bucket.color) : "var(--secondary)"} />{goal.name}</span> : <span style={{ color: "var(--secondary)" }}>No goal selected</span>}</Detail>
        {task.type === "task" && <><Detail label="Start">{formatDateTime(task.startDateTime, task.startAllDay)}</Detail><Detail label="Due">{formatDateTime(dueValue, task.dueAllDay)}</Detail><Detail label="Mobile reminder">{formatDateTime(task.notificationDateTime)}</Detail><Detail label="Completed">{task.completedAt ? formatDateTime(task.completedAt) : "Not completed"}</Detail></>}
        {task.description && <Detail label="Description" wide><p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--secondary)", fontWeight: 500 }}>{task.description}</p></Detail>}
        {task.type === "todo" && <Detail label="Completed" wide>{task.completedAt ? formatDateTime(task.completedAt) : "Not completed"}</Detail>}
      </div>
      <footer className="flex justify-end" style={{ gap: 8, padding: "12px 22px 18px", borderTop: "1px solid var(--border)" }}><button type="button" onClick={onClose} style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 11, background: "transparent", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Close</button><button type="button" onClick={onEdit} style={{ padding: "10px 15px", border: "none", borderRadius: 11, background: "var(--primary)", color: "var(--background)", cursor: "pointer", fontSize: 13, fontWeight: 750 }}>Edit {task.type === "todo" ? "to-do" : "task"}</button></footer>
    </section>
  </div>;
}
