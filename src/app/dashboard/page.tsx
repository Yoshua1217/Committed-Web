"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Habit, HabitCompletion, Bucket, Goal, ScheduledCheckIn, Task } from "@/lib/types";
import { subscribeToHabits, subscribeToCompletionsForDate } from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { subscribeToTasks, completeTask, uncompleteTask, saveTask } from "@/lib/tasks-service";
import { generateNotesId, saveMarkdownNote, saveNoteFolder, subscribeToMarkdownNotes, subscribeToNoteFolders, type MarkdownNote, type NoteFolder } from "@/lib/notes-service";
import { homeTasks, recentHomeNotes } from "@/lib/home-dashboard";
import { habitDay } from "@/lib/habit-history";
import { useToday } from "@/lib/use-today";
import { formatEffort } from "@/lib/task-planning";
import { resolveScheduledCheckIn, subscribeToScheduledCheckIns } from "@/lib/scheduled-checkins-service";
import TodayHabitsSidebar from "@/components/today-habits-sidebar";
import HomeWorkout from "@/components/home-workout";
import HomeTrainingWeekCard from "@/components/home-training-week-card";
import HomeEvents from "@/components/home-events";
import IdeaCapture from "@/components/idea-capture";
import ProgressCard from "@/components/progress-card";
import MaterialIcon from "@/components/material-icon";
import ScheduledCheckInPopup from "@/components/scheduled-checkin-popup";
import TaskEditModal from "@/components/task-edit-modal";
import TaskDetailsModal from "@/components/task-details-modal";
import styles from "./home.module.css";

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const today = useToday();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<MarkdownNote[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [loaded, setLoaded] = useState({ habits: false, completions: false, tasks: false, notes: false, folders: false });
  const [taskError, setTaskError] = useState("");
  const [noteError, setNoteError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busyTasks, setBusyTasks] = useState<Set<string>>(new Set());
  const pendingTasks = useRef(new Set<string>());
  const [lastCompleted, setLastCompleted] = useState<Task | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const noteCreating = useRef(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [scheduledCheckIns, setScheduledCheckIns] = useState<ScheduledCheckIn[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [workoutSchedule, setWorkoutSchedule] = useState({ today: "", empty: false });

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      subscribeToHabits(user.uid, (items) => { setHabits(items); setLoaded((state) => ({ ...state, habits: true })); }),
      subscribeToBuckets(user.uid, setBuckets), subscribeToGoals(user.uid, setGoals),
      subscribeToMarkdownNotes(user.uid, (items) => { setNotes(items); setLoaded((state) => ({ ...state, notes: true })); }),
      subscribeToNoteFolders(user.uid, (items) => { setFolders(items); setLoaded((state) => ({ ...state, folders: true })); }),
      subscribeToScheduledCheckIns(user.uid, setScheduledCheckIns),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user]);
  useEffect(() => {
    if (!user) return;
    return subscribeToCompletionsForDate(user.uid, today, (items) => { setCompletions(items); setLoaded((state) => ({ ...state, completions: true })); });
  }, [user, today]);
  useEffect(() => {
    if (!user) return;
    return subscribeToTasks(user.uid, (items) => { setTasks(items); setTaskError(""); setLoaded((state) => ({ ...state, tasks: true })); }, false, () => setTaskError("Tasks couldn’t load. Please try again."));
  }, [user, retry]);
  useEffect(() => {
    const refresh = () => setClock(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const grouped = homeTasks(tasks, today);
  const recentNotes = recentHomeNotes(notes);
  const day = habitDay(habits, completions, today);
  const habitsReady = loaded.habits && loaded.completions;
  const dueCheckIns = scheduledCheckIns.filter((item) => item.status === "pending" && item.dueAt <= clock);
  const displayName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  async function toggleTask(task: Task, undo = false) {
    if (pendingTasks.current.has(task.id)) return;
    pendingTasks.current.add(task.id); setBusyTasks(new Set(pendingTasks.current)); setTaskError("");
    try {
      if (undo) { await uncompleteTask(task); setLastCompleted(null); }
      else { await completeTask(task); setLastCompleted(task); }
    } catch { setTaskError("Couldn’t update that task. Please try again."); }
    finally { pendingTasks.current.delete(task.id); setBusyTasks(new Set(pendingTasks.current)); }
  }

  async function newNote() {
    if (!user || noteCreating.current || !loaded.notes || !loaded.folders) return;
    noteCreating.current = true; setCreatingNote(true); setNoteError("");
    try {
      const now = Date.now();
      let destination = folders.find((folder) => folder.id === recentNotes[0]?.folderId) ?? folders.find((folder) => folder.kind === "notebook");
      if (!destination) {
        const id = generateNotesId();
        destination = { id, userId: user.uid, name: "Personal", kind: "notebook", parentId: null, notebookId: id, calendarId: null, sortOrder: now, createdAt: now, updatedAt: now };
        await saveNoteFolder(destination);
      }
      const note: MarkdownNote = { id: generateNotesId(), userId: user.uid, folderId: destination.id, notebookId: destination.notebookId, title: "Untitled note", content: "", sortOrder: now, createdAt: now, updatedAt: now };
      await saveMarkdownNote(note);
      router.push(`/dashboard/notes?note=${encodeURIComponent(note.id)}&edit=1`);
    } catch { setNoteError("Couldn’t create your note. Please try again."); noteCreating.current = false; setCreatingNote(false); }
  }

  return <div className={`dashboard-home ${styles.page}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p><h1>Your day, {displayName}.</h1></div></header>
    <div className={styles.layout}>
      <div className={styles.main}>
        {habitsReady ? <ProgressCard totalScheduled={day.scheduled} progressValue={day.progress} /> : <p className={styles.empty} role="status">Loading today’s progress…</p>}
        {user && <HomeWorkout key={`workout-${user.uid}`} userId={user.uid} today={today} onScheduleChange={setWorkoutSchedule} />}
        {workoutSchedule.today === today && workoutSchedule.empty && <div className={styles.restDay}><MaterialIcon name="event_busy" size={20} /><span>No scheduled workouts today.</span></div>}
        <section className={styles.section} aria-labelledby="home-tasks-title">
          <div className={styles.sectionHeader}><h2 id="home-tasks-title">Today’s tasks {loaded.tasks && <span className={styles.badge}>{grouped.overdue.length + grouped.today.length}</span>}</h2><div className="flex gap-3"><button className={styles.link} onClick={() => { setEditingTask(null); setTaskModal(true); }}>+ New task</button><Link className={styles.link} href="/dashboard/tasks">All tasks<MaterialIcon name="chevron_right" size={16} /></Link></div></div>
          <div className={styles.panel}>
            {taskError && <p className={styles.error} role="alert">{taskError} <button className={styles.link} onClick={() => { setTaskError(""); setRetry((value) => value + 1); }}>Retry</button></p>}
            {!loaded.tasks && !taskError ? <p className={styles.empty} role="status">Loading your tasks…</p> : loaded.tasks && <>
              {([{ label: "Overdue", items: grouped.overdue, late: true }, { label: "Today", items: grouped.today, late: false }]).map((group) => group.items.length > 0 && <div key={group.label}><h3 className={`${styles.groupLabel} ${group.late ? styles.overdue : ""}`}>{group.label} · {group.items.length}</h3>{group.items.map((task) => <div className={styles.row} key={task.id}>
                <button className={styles.check} aria-label={`Complete ${task.title}`} disabled={busyTasks.has(task.id)} onClick={() => void toggleTask(task)}><MaterialIcon name={busyTasks.has(task.id) ? "hourglass_empty" : "check"} size={17} /></button>
                <button className={styles.rowButton} onClick={() => setSelectedTask(task)}><span className={styles.title}>{task.title}</span><span className={`${styles.meta} ${group.late ? styles.overdue : ""}`}>{taskDateLabel(task, today)}{task.estimatedMinutes ? ` · ${formatEffort(task.estimatedMinutes)}` : ""}</span></button>
                {(task.priority === "critical" || task.priority === "high") && <span className={styles.badge}>{task.priority === "critical" ? "Critical" : "High"}</span>}
              </div>)}</div>)}
              {!grouped.overdue.length && !grouped.today.length && <p className={styles.empty}><strong>You’re caught up.</strong>No overdue tasks or tasks planned for today.</p>}
            </>}
            {lastCompleted && <div className={styles.footer} role="status"><span className={styles.meta}>Completed “{lastCompleted.title}”</span><button className={styles.link} disabled={busyTasks.has(lastCompleted.id)} onClick={() => void toggleTask(lastCompleted, true)}>Undo</button></div>}
          </div>
        </section>
        {user && <HomeEvents key={`events-${user.uid}`} userId={user.uid} today={today} />}
        <section className={styles.section} aria-labelledby="home-notes-title">
          <div className={styles.sectionHeader}><h2 id="home-notes-title">Recent notes</h2><Link className={styles.link} href="/dashboard/notes">All notes<MaterialIcon name="chevron_right" size={16} /></Link></div>
          <div className={styles.panel}>
            <div className={styles.row}><span className={styles.noteIcon}><MaterialIcon name="edit_note" size={26} /></span><div style={{ flex: 1 }}><span className={styles.title}>Open new note</span><span className={styles.meta}>A fresh page in your latest notebook.</span></div><button className={styles.primary} disabled={creatingNote || !loaded.notes || !loaded.folders} onClick={() => void newNote()}>{creatingNote ? "Creating…" : "+ New note"}</button></div>
            {noteError && <p className={styles.error} role="alert">{noteError}</p>}
            {!loaded.notes ? <p className={styles.empty} role="status">Loading your notes…</p> : recentNotes.length ? recentNotes.map((note) => <div className={styles.row} key={note.id}><span className={styles.noteIcon}><MaterialIcon name="description" size={18} /></span><Link href={`/dashboard/notes?note=${encodeURIComponent(note.id)}`} className={styles.rowButton}><span className={styles.title}>{note.title || "Untitled note"}</span><span className={styles.meta}>{folders.find((folder) => folder.id === note.notebookId)?.name || "Notebook"}</span></Link><time className={styles.noteDate} dateTime={new Date(note.updatedAt).toISOString()} title={`Edited ${new Date(note.updatedAt).toLocaleString()}`}>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></div>) : <p className={styles.empty}>Your five most recently edited notes will appear here.</p>}
          </div>
        </section>
      </div>
      <div className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          {user && <IdeaCapture userId={user.uid} showToast compact />}
          {user && <HomeTrainingWeekCard key={`training-week-${user.uid}`} userId={user.uid} today={today} />}
        </div>
        {habitsReady && user ? <TodayHabitsSidebar key={`${user.uid}-${today}`} habits={habits} completions={completions} buckets={buckets} goals={goals} today={today} userId={user.uid} onReorder={setHabits} /> : <p className={styles.meta} role="status">Loading today’s habits…</p>}
        <Link href="/dashboard/habits" className={styles.link}>Open habits<MaterialIcon name="arrow_forward" size={16} /></Link>
      </div>
    </div>
    <TaskDetailsModal isOpen={!!selectedTask} task={tasks.find((task) => task.id === selectedTask?.id) ?? selectedTask} goals={goals} buckets={buckets} onClose={() => setSelectedTask(null)} onEdit={() => { setEditingTask(tasks.find((task) => task.id === selectedTask?.id) ?? selectedTask); setSelectedTask(null); setTaskModal(true); }} />
    <TaskEditModal isOpen={taskModal} task={editingTask} goals={goals} buckets={buckets} userId={user?.uid ?? ""} nextSortOrder={tasks.length} onClose={() => setTaskModal(false)} onSave={saveTask} />
    {dueCheckIns.length > 0 && <ScheduledCheckInPopup checkIns={dueCheckIns} onResolve={resolveScheduledCheckIn} />}
  </div>;
}

function taskDateLabel(task: Task, today: string) {
  const value = task.dueDateTime || task.dueDate;
  const startsToday = task.startDateTime?.slice(0, 10) === today;
  const label = (date: string, allDay: boolean) => {
    const parsed = new Date(date.length === 10 ? `${date}T12:00:00` : date);
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(!allDay && date.includes("T") ? { hour: "numeric", minute: "2-digit" } as const : {}) });
  };
  return [startsToday ? `Planned ${label(task.startDateTime!, task.startAllDay)}` : "", value ? `Due ${label(value, task.dueAllDay)}` : ""].filter(Boolean).join(" · ");
}
