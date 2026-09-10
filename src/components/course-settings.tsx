"use client";
import { useEffect, useState } from "react";
import { Course, DEFAULT_PAPER, uid } from "@/lib/ink-model";
import { coursesPath, deleteCourse, listenInk, saveInk } from "@/lib/ink-service";
import { NoteFolder, subscribeToNoteFolders } from "@/lib/notes-service";
import { readLocalCalendarSyncCache, subscribeToCalendarSync, SyncedGoogleCalendar } from "@/lib/calendar-sync-service";
import { PaperSettings } from "./ink-settings";
import "./note-workspace.css";

export default function CourseSettings({ userId }: { userId: string }) {
  const [courses, setCourses] = useState<Course[]>([]), [notebooks, setNotebooks] = useState<NoteFolder[]>([]), [calendars, setCalendars] = useState<SyncedGoogleCalendar[]>([]);
  const [draft, setDraft] = useState<Course | null>(null), [message, setMessage] = useState("");
  useEffect(() => {
    const stop = listenInk<Course>(coursesPath(userId), setCourses, e => setMessage(e.message));
    const stopFolders = subscribeToNoteFolders(userId, folders => setNotebooks(folders.filter(f => f.kind === "notebook")));
    const stopCalendar = subscribeToCalendarSync(userId, (_, cache) => setCalendars(cache?.calendars ?? readLocalCalendarSyncCache(userId)?.calendars ?? []));
    return () => { stop(); stopFolders(); stopCalendar(); };
  }, [userId]);
  const save = async () => {
    if (!draft?.name.trim()) return;
    try {
      // A notebook has one course; layers may be shared across courses.
      for (const course of courses.filter(c => c.id !== draft.id && c.notebookIds.some(id => draft.notebookIds.includes(id)))) await saveInk(coursesPath(userId), { ...course, notebookIds: course.notebookIds.filter(id => !draft.notebookIds.includes(id)) });
      await saveInk(coursesPath(userId), { ...draft, name: draft.name.trim() }); setDraft(null); setMessage("Course saved across your devices.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save course."); }
  };
  return <section className="course-settings ink-ui"><h2>Courses</h2><p>Create your classes here. Attach notebooks and calendar layers, then choose the paper new handwritten pages should use.</p>
    {courses.map(c => <button key={c.id} className="course-row" onClick={() => setDraft(structuredClone(c))}><span style={{ background: c.color }} /><strong>{c.name}</strong><small>{c.notebookIds.length} notebooks · {c.calendarIds.length} layers</small><span>Edit</span></button>)}
    <button onClick={() => setDraft({ id: uid(), name: "", color: "#6366f1", notebookIds: [], calendarIds: [], paper: { ...DEFAULT_PAPER } })}>+ Add course</button>
    {message && <p role="status">{message}</p>}
    {draft && <div className="ink-modal-scrim"><section className="ink-dialog" role="dialog" aria-modal="true" aria-label="Course settings">
      <div className="ink-dialog-title"><h2>{draft.name || "New course"}</h2><button onClick={() => setDraft(null)} aria-label="Close">×</button></div>
      <div className="ink-settings-grid"><label>Course name<input autoFocus placeholder="CHEM 101" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Course colour<input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} /></label></div>
      <h3>Notebooks</h3>{!notebooks.length && <p>Create a notebook in Notes to attach it here.</p>}{notebooks.map(n => <label className="ink-check" key={n.id}><input type="checkbox" checked={draft.notebookIds.includes(n.id)} onChange={e => setDraft({ ...draft, notebookIds: e.target.checked ? [...draft.notebookIds, n.id] : draft.notebookIds.filter(id => id !== n.id) })} />{n.name}</label>)}
      <h3>Calendar layers</h3>{!calendars.length && <p>Connect Google Calendar to choose layers.</p>}{calendars.map(c => <label className="ink-check" key={c.id}><input type="checkbox" checked={draft.calendarIds.includes(c.id)} onChange={e => setDraft({ ...draft, calendarIds: e.target.checked ? [...draft.calendarIds, c.id] : draft.calendarIds.filter(id => id !== c.id) })} />{c.summary}</label>)}
      <h3>Default paper</h3><PaperSettings paper={draft.paper} onChange={paper => setDraft({ ...draft, paper })} />
      <div className="ink-actions"><button className="ink-primary" disabled={!draft.name.trim()} onClick={() => void save()}>Save course</button>{courses.some(c => c.id === draft.id) && <button onClick={() => { void deleteCourse(userId, draft.id).then(() => setDraft(null)).catch(e => setMessage(e.message)); }}>Remove course</button>}<button onClick={() => setDraft(null)}>Cancel</button></div>
    </section></div>}
  </section>;
}
