"use client";

import { useState } from "react";
import type { Project, Task } from "@/lib/types";
import { effortMinutes, formatEffort, isUnscheduledTask, localDateTime } from "@/lib/task-planning";
import TaskSchedulePicker, { formatScheduleValue } from "@/components/task-schedule-picker";
import MaterialIcon from "@/components/material-icon";
import { TASK_DRAG_TYPE } from "@/lib/task-calendar-drop";

export default function CalendarTaskPlanner({ tasks, projects, onEdit, onSchedule, onTaskDrag, draggedTaskId, savingTaskId }: { tasks: Task[]; projects: Project[]; onEdit: (task: Task) => void; onSchedule: (task: Task) => void; onTaskDrag?: (task: Task | null) => void; draggedTaskId?: string | null; savingTaskId?: string | null }) {
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const unassigned = tasks.filter(isUnscheduledTask).filter((task) => (!projectId || task.projectId === projectId) && task.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const unestimated = tasks.filter((task) => !task.deleted && !task.completed && !task.archived && task.type === "task" && !effortMinutes(task));
  return <section className="calendar-task-planner">
    <h3>Unscheduled work</h3><p>Drag a card onto the day or week calendar to preview and set its time. In month view, drop onto a date to choose a time.</p>
    <input className="planning-search" aria-label="Search unscheduled tasks" placeholder="Find a task…" value={search} onChange={(event) => setSearch(event.target.value)} />
    <label className="planning-field">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <p>{unassigned.length} tasks · {formatEffort(unassigned.reduce((sum, task) => sum + effortMinutes(task), 0))}</p>
    {unassigned.map((task) => <article className={`unscheduled-task${draggedTaskId === task.id ? " is-dragging" : ""}`} key={task.id} draggable={!!onTaskDrag && !savingTaskId} aria-busy={savingTaskId === task.id} onDragStart={(event) => { if (!onTaskDrag || savingTaskId) { event.preventDefault(); return; } event.dataTransfer.setData(TASK_DRAG_TYPE, task.id); event.dataTransfer.effectAllowed = "move"; onTaskDrag(task); }} onDragEnd={() => onTaskDrag?.(null)}>
      <span className="task-drag-hint"><MaterialIcon name="drag_indicator" size={16} />Drag to calendar</span>
      <button className="project-task-title" disabled={savingTaskId === task.id} onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{projects.find((project) => project.id === task.projectId)?.name ?? "No project"}</small></button>
      <div><span>{formatEffort(effortMinutes(task))}</span>{task.dueDate && <small>Due {task.dueDate}</small>}</div>
      <button className="planning-primary" disabled={savingTaskId === task.id} onClick={() => onSchedule(task)}>{savingTaskId === task.id ? "Saving…" : "Choose time"}</button>
    </article>)}
    {unassigned.length === 0 && <p className="planning-empty">No estimated tasks waiting for time.</p>}
    {unestimated.length > 0 && <details className="unestimated-tasks"><summary>Needs an estimate ({unestimated.length})</summary>{unestimated.map((task) => <button key={task.id} className="planning-text-button" onClick={() => onEdit(task)}>{task.title} · Add estimate</button>)}</details>}
  </section>;
}

export function TaskTimeBlockDialog({ task, date, onClose, onSave, onEdit }: { task: Task; date: Date; onClose: () => void; onSave: (task: Task) => Promise<void>; onEdit: () => void }) {
  const initial = new Date(date); initial.setHours(9, 0, 0, 0);
  const [start, setStart] = useState(task.startDateTime && !task.startAllDay ? task.startDateTime : localDateTime(initial));
  const [minutes, setMinutes] = useState(String(effortMinutes(task) || 30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const end = new Date(new Date(start).getTime() + Number(minutes) * 60_000);
  const deadline = task.dueDateTime ? new Date(task.dueDateTime) : task.dueDate ? new Date(`${task.dueDate}T23:59:59`) : null;
  return <div className="planning-overlay"><form className="planning-dialog" role="dialog" aria-modal="true" aria-label="Schedule task" onSubmit={async (event) => { event.preventDefault(); if (saving) return; if (!Number.isFinite(end.getTime()) || !Number.isInteger(Number(minutes)) || Number(minutes) <= 0) { setError("Choose a valid start and a positive duration."); return; } setSaving(true); setError(null); try { await onSave({ ...task, startDateTime: start, startAllDay: false, estimatedMinutes: Number(minutes) }); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "Could not schedule task."); } finally { setSaving(false); } }}>
    <div className="planning-toolbar"><h2>Make time for this task</h2><button className="planning-text-button" type="button" disabled={saving} onClick={onClose} aria-label="Close scheduling">×</button></div>
    <p>{task.title}</p><button type="button" className="planning-text-button" disabled={saving} onClick={onEdit}>Edit task details</button>
    <div className="planning-field">
      <span id="task-block-start-label">Start</span>
      <button type="button" autoFocus aria-labelledby="task-block-start-label task-block-start-value" aria-haspopup="dialog" disabled={saving} onClick={() => setPickerOpen(true)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-variant)", color: "var(--primary)", textAlign: "left", cursor: "pointer", fontSize: 13 }}>
        <MaterialIcon name="schedule" size={20} />
        <span id="task-block-start-value" style={{ flex: 1 }}>{formatScheduleValue(start, "Choose start date and time")}</span>
        <MaterialIcon name="chevron_right" size={20} />
      </button>
    </div>
    <label className="planning-field">Duration (minutes)<input type="number" min="1" step="1" required value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
    {Number.isFinite(end.getTime()) && <p className="planning-muted">Ends {end.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. The task deadline stays the same.</p>}
    {deadline && end > deadline && <p className="planning-error">This block ends after the task deadline.</p>}
    {error && <p className="planning-error" role="alert">{error}</p>}
    <button type="submit" className="planning-primary" disabled={saving}>{saving ? "Saving…" : "Schedule task"}</button>
    {task.startDateTime && !task.startAllDay && <button type="button" className="planning-text-button" disabled={saving} onClick={async () => { setSaving(true); try { await onSave({ ...task, startDateTime: null, startAllDay: false }); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "Could not remove block."); setSaving(false); } }}>Remove block · keep task and estimate</button>}
    {pickerOpen && <TaskSchedulePicker
      values={{ start, due: "", reminder: "", startAllDay: false, dueAllDay: false }}
      initialField="start"
      fields={["start"]}
      allowAllDay={false}
      requireDateTime
      title="Set start time"
      description="Choose the date and time for this task’s work block."
      onClose={() => setPickerOpen(false)}
      onSave={(values) => { setStart(values.start); setError(null); setPickerOpen(false); }}
    />}
  </form></div>;
}
