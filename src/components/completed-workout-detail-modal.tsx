"use client";

import { useState } from "react";
import MaterialIcon from "@/components/material-icon";
import { WorkoutSession } from "@/lib/types";

interface CompletedWorkoutDetailModalProps { session: WorkoutSession; onClose: () => void; onDelete: (session: WorkoutSession) => Promise<void>; }

function formatDuration(session: WorkoutSession): string {
  const total = session.durationSeconds ?? (session.completedAt ? Math.max(0, Math.floor((session.completedAt - session.startedAt) / 1000)) : 0);
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function CompletedWorkoutDetailModal({ session, onClose, onDelete }: CompletedWorkoutDetailModalProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const date = session.completedAt ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(session.completedAt)) : session.completedDate ?? "Completed workout";
  async function deleteRecord() {
    setDeleting(true);
    try {
      await onDelete(session);
      onClose();
    } finally {
      setDeleting(false);
    }
  }
  return <div role="dialog" aria-modal="true" aria-label={`${session.workoutNameSnapshot} history`} style={{ position: "fixed", inset: 0, zIndex: 71, overflow: "hidden", background: "var(--background)" }}>
    <div className="completed-workout-detail-sheet">
      <header className="completed-workout-detail-header"><div className="flex items-center justify-between" style={{ gap: 12 }}><button type="button" onClick={onClose} aria-label="Close workout history" className="workout-preview-icon-button"><MaterialIcon name="close" size={22} /></button><span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase" }}>Workout history</span><button type="button" onClick={() => setOptionsOpen(true)} aria-label="Workout record settings" className="workout-preview-icon-button"><MaterialIcon name="settings" size={21} /></button></div></header>
      <main className="completed-workout-detail-content">
        <p style={{ color: "#2e9a5b", fontSize: 12, fontWeight: 850, letterSpacing: "0.08em", margin: "0 0 9px", textTransform: "uppercase" }}>Completed</p>
        <h1 style={{ color: "var(--primary)", fontSize: 31, fontWeight: 850, letterSpacing: "-0.035em", lineHeight: 1.1, margin: "0 0 10px" }}>{session.workoutNameSnapshot}</h1>
        <div className="flex" style={{ gap: 9, marginBottom: 16 }}><span className="completed-workout-stat"><MaterialIcon name="calendar_month" size={16} />{date}</span><span className="completed-workout-stat"><MaterialIcon name="schedule" size={16} />{formatDuration(session)}</span></div>
        {session.personalRecords.length > 0 && <section style={{ marginBottom: 19, padding: "10px 11px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-variant)" }}><div className="flex items-center" style={{ gap: 5, marginBottom: 7, color: "#d69e13" }}><MaterialIcon name="emoji_events" size={17} /><h2 style={{ fontSize: 13, fontWeight: 850, margin: 0 }}>Personal records</h2></div><div className="flex flex-wrap" style={{ gap: 5 }}>{session.personalRecords.map((record) => <span key={record.exerciseId} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "5px 7px", borderRadius: 7, background: "#f5c84c20", color: "#d69e13", fontSize: 11, fontWeight: 850 }}><MaterialIcon name="emoji_events" size={12} />{record.exerciseNameSnapshot} · {record.reps} reps PR</span>)}</div></section>}
        <h2 style={{ color: "var(--primary)", fontSize: 16, fontWeight: 850, margin: "0 0 12px" }}>Logged sets</h2>
        <div className="flex flex-col" style={{ gap: 14 }}>{session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((exercise, exerciseIndex) => <section key={exercise.exerciseId} style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><div className="flex items-center" style={{ gap: 10, marginBottom: 14 }}><span style={{ width: 27, height: 27, display: "grid", placeItems: "center", borderRadius: 9, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{exerciseIndex + 1}</span><h3 style={{ color: "var(--primary)", fontSize: 16, fontWeight: 850, margin: 0 }}>{exercise.exerciseNameSnapshot}</h3></div><div className="completed-set-grid completed-set-heading"><span>Set</span><span>Weight</span><span>Reps</span><span>Status</span></div>{exercise.sets.map((set, setIndex) => { const record = session.personalRecords.find((item) => item.exerciseId === exercise.exerciseId && ((item.setIds?.includes(set.id) ?? false) || (!item.setIds && set.completed && set.reps === item.reps))); return <div key={set.id} className="completed-set-grid completed-set-row" style={{ opacity: set.completed ? 1 : 0.6, border: record ? "2px solid #f5c84c" : undefined, background: record ? "#f5c84c16" : undefined }}><span>{setIndex + 1}</span><span>{exercise.loadType === "bodyweight" ? "BW" : set.weightLbs ?? "—"}</span><span>{set.reps ?? "—"}</span><span style={{ color: record ? "#d69e13" : set.completed ? "#2e9a5b" : "var(--secondary)", fontWeight: 850 }}>{record ? <span className="flex items-center justify-center" style={{ gap: 3 }}><MaterialIcon name="emoji_events" size={16} />PR</span> : set.completed ? "Done" : "Skipped"}</span></div>; })}</section>)}</div>
        <div aria-hidden="true" style={{ height: 30 }} />
      </main>
    </div>
    {optionsOpen && <div onMouseDown={() => setOptionsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 73, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.58)" }}><div role="dialog" aria-modal="true" aria-label="Workout record settings" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(360px, 100%)", padding: 20, border: "1px solid var(--border)", borderRadius: 18, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><h2 style={{ color: "var(--primary)", fontSize: 20, margin: "0 0 7px" }}>Workout record</h2><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 18px" }}>Manage this completed workout.</p><button type="button" onClick={() => { setOptionsOpen(false); setDeleteConfirmOpen(true); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px solid #d9534f88", borderRadius: 12, padding: 12, background: "#d9534f16", color: "#d9534f", fontSize: 14, fontWeight: 800, cursor: "pointer" }}><MaterialIcon name="delete" size={18} />Delete workout record</button><button type="button" onClick={() => setOptionsOpen(false)} style={{ width: "100%", marginTop: 9, border: "none", padding: 10, background: "transparent", color: "var(--secondary)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Close</button></div></div>}
    {deleteConfirmOpen && <div onMouseDown={() => !deleting && setDeleteConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 74, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.62)" }}><div role="alertdialog" aria-modal="true" aria-label="Delete workout record" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(370px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><div style={{ width: 40, height: 40, display: "grid", placeItems: "center", marginBottom: 13, borderRadius: 12, background: "#d9534f1c", color: "#d9534f" }}><MaterialIcon name="delete" size={22} /></div><h2 style={{ color: "#d9534f", fontSize: 20, margin: "0 0 8px" }}>Delete this workout?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>This permanently removes the completed workout, its sets, and its time from your history.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}>Keep record</button><button type="button" onClick={() => void deleteRecord()} disabled={deleting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.65 : 1 }}>{deleting ? "Deleting…" : "Delete"}</button></div></div></div>}
  </div>;
}
