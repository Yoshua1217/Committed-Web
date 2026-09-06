"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import type { Bucket, Goal, Project, Task } from "@/lib/types";
import { saveProject, subscribeToProjects } from "@/lib/projects-service";
import { completeTask, saveTask, subscribeToTasks, uncompleteTask } from "@/lib/tasks-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { effortMinutes, formatEffort, projectProgress, taskBlock } from "@/lib/task-planning";
import TaskEditModal from "@/components/task-edit-modal";

export default function ProjectsPanel() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Project | "new" | null>(null);
  const [taskEditor, setTaskEditor] = useState<Task | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    const unsubs = [
      subscribeToProjects(user.uid, (items) => { setProjects(items); setLoading(false); }, (err) => { setError(err.message); setLoading(false); }),
      subscribeToTasks(user.uid, setTasks), subscribeToGoals(user.uid, setGoals), subscribeToBuckets(user.uid, setBuckets),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);
  const selected = projects.find((project) => project.id === selectedId);
  const members = tasks.filter((task) => task.projectId === selectedId);
  const progress = projectProgress(members);
  const available = tasks.filter((task) => task.type === "task" && !task.projectId && !task.archived);
  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Could not save. Please try again."); } finally { setBusy(false); }
  };
  return <section className="projects-panel" role="tabpanel" aria-label="Projects">
    {error && <p role="alert" className="planning-error">{error}</p>}
    <div className="planning-toolbar">
      <div><h2>{selected ? selected.name : "Finish something meaningful"}</h2><p>{selected ? selected.outcome : "A finite group of tasks, one finished outcome, and a deadline."}</p></div>
      <button className="planning-primary" onClick={() => setEditor(selected ?? "new")}>{selected ? "Edit project" : "+ New project"}</button>
    </div>
    {selected ? <>
      <button className="planning-text-button" onClick={() => setSelectedId(null)}>← All projects</button>
      <div className="project-summary">
        <div><small>Deadline</small><strong>{new Date(`${selected.deadline}T12:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</strong></div>
        <div><small>Goal</small><strong>{goals.find((goal) => goal.id === selected.goalId)?.name ?? "No linked goal"}</strong></div>
        <div><small>Estimated effort completed</small><strong>{formatEffort(progress.completedMinutes)} / {formatEffort(progress.totalMinutes)}</strong></div>
        <div><small>{progress.finished ? "Outcome ready" : "Effort progress"}</small><strong>{progress.percent}%</strong></div>
      </div>
      <ProgressBar percent={progress.percent} />
      {progress.unestimated > 0 && <p className="planning-muted">{progress.unestimated} task{progress.unestimated === 1 ? " needs" : "s need"} an estimate. Progress covers estimated work only.</p>}
      <div className="planning-toolbar" style={{ marginTop: 24 }}><h3>Tasks contributing to this outcome</h3><button className="planning-primary" onClick={() => setTaskEditor("new")}>+ New task</button></div>
      <label className="planning-field">Add an existing task
        <select aria-label="Add an existing task" value="" disabled={busy} onChange={(event) => { const task = available.find((item) => item.id === event.target.value); if (task) void act(() => saveTask({ ...task, projectId: selected.id })); }}>
          <option value="">{available.length ? "Choose an ungrouped task…" : "No ungrouped tasks available"}</option>
          {available.map((task) => <option key={task.id} value={task.id}>{task.title} · {(effortMinutes(task) ? formatEffort(effortMinutes(task)) : "No estimate")}</option>)}
        </select>
      </label>
      <div className="project-task-list">
        {members.length === 0 && <p className="planning-empty">Add existing tasks or create the first step toward this outcome.</p>}
        {members.map((task) => {
          const share = progress.totalMinutes ? Math.round(effortMinutes(task) / progress.totalMinutes * 100) : 0;
          return <div key={task.id} className={`project-task-row${task.completed ? " is-completed" : ""}`}>
            <input aria-label={`Complete ${task.title}`} type="checkbox" checked={task.completed} disabled={busy} onChange={() => void act(() => task.completed ? uncompleteTask(task) : completeTask(task))} />
            <button className="project-task-title" onClick={() => setTaskEditor(task)}><strong>{task.title}</strong><small>{task.completed ? "Completed" : taskBlock(task) ? "Scheduled" : "Unscheduled"}{task.dueDate ? ` · Due ${task.dueDate}` : ""}</small></button>
            <span className="project-task-effort">{(effortMinutes(task) ? formatEffort(effortMinutes(task)) : "No estimate")}<small>{effortMinutes(task) ? `${share}% of project effort` : "Add an estimate"}</small></span>
            <button className="planning-text-button" disabled={busy} aria-label={`Remove ${task.title} from project`} title="Remove from project" onClick={() => void act(() => saveTask({ ...task, projectId: "" }))}>×</button>
          </div>;
        })}
      </div>
      <div className="planning-toolbar" style={{ marginTop: 20 }}><Link className="planning-text-button" href="/dashboard/calendar">Plan time in Calendar →</Link><button className="planning-text-button" disabled={busy} onClick={() => void act(async () => { await saveProject({ ...selected, archived: !selected.archived }); setSelectedId(null); })}>{selected.archived ? "Restore project" : "Archive project"}</button></div>
    </> : <>
      <label className="planning-muted"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived projects</label>
      {loading ? <p className="planning-empty">Loading projects…</p> : <div className="project-grid">
        {projects.filter((project) => showArchived || !project.archived).map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          const stats = projectProgress(projectTasks);
          const overdue = !stats.finished && new Date(`${project.deadline}T23:59:59`) < new Date();
          return <button className="project-card" key={project.id} onClick={() => setSelectedId(project.id)}>
            <div className="project-card-top"><span>{project.archived ? "Archived" : stats.finished ? "Complete" : "In progress"}</span><span className={overdue ? "planning-error" : ""}>{overdue ? "Overdue · " : "Due "}{new Date(`${project.deadline}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
            <h3>{project.name}</h3><p>{project.outcome}</p>
            <div className="project-card-progress"><strong>{stats.percent}%</strong><span>{formatEffort(stats.completedMinutes)} / {formatEffort(stats.totalMinutes)}</span></div>
            <ProgressBar percent={stats.percent} />
            <div className="project-card-footer"><span>{projectTasks.length} tasks{stats.unestimated ? ` · ${stats.unestimated} unestimated` : ""}</span><span>{goals.find((goal) => goal.id === project.goalId)?.name ?? "No goal"}</span></div>
          </button>;
        })}
      </div>}
      {!loading && !projects.some((project) => showArchived || !project.archived) && <div className="planning-empty"><span className="material-symbols-rounded" style={{ fontSize: 36 }}>account_tree</span><h3>Your next finished outcome starts here</h3><p>Create a project, connect its tasks, and plan the time to get it done.</p><button className="planning-primary" onClick={() => setEditor("new")}>Create project</button></div>}
    </>}
    {editor && user && <ProjectEditor key={typeof editor === "string" ? "new" : editor.id} project={editor === "new" ? null : editor} userId={user.uid} goals={goals} onClose={() => setEditor(null)} onSave={async (project) => { await saveProject(project); setSelectedId(project.id); setEditor(null); }} />}
    <TaskEditModal isOpen={taskEditor !== null} task={taskEditor === "new" ? null : taskEditor} defaultProjectId={selectedId ?? ""} onClose={() => setTaskEditor(null)} onSave={saveTask} goals={goals} buckets={buckets} userId={user?.uid ?? ""} nextSortOrder={tasks.length} />
  </section>;
}

function ProgressBar({ percent }: { percent: number }) {
  return <div className="project-progress-track" role="progressbar" aria-label="Estimated effort completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>;
}

function ProjectEditor({ project, userId, goals, onClose, onSave }: { project: Project | null; userId: string; goals: Goal[]; onClose: () => void; onSave: (project: Project) => Promise<void> }) {
  const [name, setName] = useState(project?.name ?? "");
  const [outcome, setOutcome] = useState(project?.outcome ?? "");
  const [deadline, setDeadline] = useState(project?.deadline ?? "");
  const [goalId, setGoalId] = useState(project?.goalId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []);
  return <div className="planning-overlay" onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-label={project ? "Edit project" : "New project"} className="planning-dialog" onSubmit={async (event) => { event.preventDefault(); if (saving) return; setSaving(true); setError(null); try { await onSave({ id: project?.id ?? crypto.randomUUID(), userId, name: name.trim(), outcome: outcome.trim(), deadline, goalId, archived: project?.archived ?? false, createdAt: project?.createdAt ?? Date.now() }); } catch (err) { setError(err instanceof Error ? err.message : "Project could not save."); setSaving(false); } }}>
      <div className="planning-toolbar"><h2>{project ? "Edit project" : "New project"}</h2><button type="button" className="planning-text-button" aria-label="Close project" disabled={saving} onClick={onClose}>×</button></div>
      <label className="planning-field">Project name<input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Launch the new website" /></label>
      <label className="planning-field">Finished outcome<textarea required rows={3} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="What will be finished when this project is done?" /></label>
      <div className="planning-form-grid"><label className="planning-field">Deadline<input required type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><label className="planning-field">Goal (optional)<select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">No linked goal</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label></div>
      {error && <p role="alert" className="planning-error">{error}</p>}
      <button type="submit" className="planning-primary" disabled={saving}>{saving ? "Saving…" : project ? "Save changes" : "Create project"}</button>
    </form>
  </div>;
}
