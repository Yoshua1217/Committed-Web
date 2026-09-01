"use client";

import { useState } from "react";
import MaterialIcon from "@/components/material-icon";
import { activityIntensityMeta } from "@/lib/activity-intensity";
import { WorkoutSession } from "@/lib/types";

interface CompletedActivityDetailModalProps {
  session: WorkoutSession;
  onClose: () => void;
  onDelete: (session: WorkoutSession) => Promise<void>;
}

function formatDuration(session: WorkoutSession) {
  const seconds = session.durationSeconds ?? (session.completedAt ? Math.max(0, Math.floor((session.completedAt - session.startedAt) / 1000)) : 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

export default function CompletedActivityDetailModal({ session, onClose, onDelete }: CompletedActivityDetailModalProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const intensity = activityIntensityMeta(session.activityIntensity);
  const date = session.completedAt ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(session.completedAt)) : "Completed activity";

  async function deleteRecord() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(session);
      onClose();
    } catch (error) {
      console.error("Could not delete activity record:", error);
      setDeleting(false);
    }
  }

  return <div role="dialog" aria-modal="true" aria-label={`${session.workoutNameSnapshot} activity history`} style={{ position: "fixed", inset: 0, zIndex: 71, overflow: "hidden", background: "var(--background)" }}>
    <div className="completed-workout-detail-sheet">
      <header className="completed-workout-detail-header"><div className="flex items-center justify-between" style={{ gap: 12 }}><button type="button" onClick={onClose} aria-label="Close activity history" className="workout-preview-icon-button"><MaterialIcon name="close" size={22} /></button><p style={{ color: "var(--secondary)", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Activity history</p><button type="button" onClick={() => setOptionsOpen(true)} aria-label="Activity record settings" className="workout-preview-icon-button"><MaterialIcon name="settings" size={21} /></button></div></header>
      <main className="completed-workout-detail-content" style={{ paddingBottom: "calc(32px + var(--app-safe-bottom))" }}>
      <p style={{ color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 9px" }}>Completed activity</p>
      <section style={{ padding: "21px 19px", marginBottom: 18, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)" }}><span style={{ width: 48, height: 48, display: "grid", placeItems: "center", marginBottom: 15, borderRadius: 15, background: "#41e987", color: "#073019" }}><MaterialIcon name={session.activityIconSnapshot ?? "directions_run"} size={27} /></span><p style={{ color: "var(--secondary)", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" }}>{session.activityCategorySnapshot ?? "Activity"}</p><h1 style={{ color: "var(--primary)", fontSize: 31, fontWeight: 850, letterSpacing: "-0.035em", lineHeight: 1.08, margin: "0 0 12px" }}>{session.workoutNameSnapshot}</h1><p style={{ color: "var(--primary)", fontSize: 14, lineHeight: 1.52, margin: 0 }}>{session.activityDescriptionSnapshot ?? "An activity you chose to log."}</p></section>
      <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 18 }}><span className="completed-workout-stat"><MaterialIcon name="calendar_month" size={16} />{date}</span><span className="completed-workout-stat"><MaterialIcon name="schedule" size={16} />{formatDuration(session)}</span></div>
      <section style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 16px", marginBottom: 18, border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><span style={{ width: 43, height: 43, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 14, background: "var(--surface-variant)", color: "#41e987" }}><MaterialIcon name={intensity?.icon ?? "tune"} size={23} /></span><div><p style={{ color: "var(--secondary)", fontSize: 10, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 3px" }}>Intensity</p><h2 style={{ color: "var(--primary)", fontSize: 16, fontWeight: 850, margin: "0 0 2px" }}>{intensity?.label ?? "Not rated"}</h2><p style={{ color: "var(--secondary)", fontSize: 12, lineHeight: 1.35, margin: 0 }}>{intensity?.description ?? "No intensity was selected for this activity."}</p></div></section>
      <section style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><div className="flex items-center" style={{ gap: 7, marginBottom: 7, color: "var(--primary)" }}><MaterialIcon name="event_available" size={18} color="#41e987" /><h2 style={{ fontSize: 15, fontWeight: 850, margin: 0 }}>Activity timing</h2></div><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>Started at {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(session.startedAt))} and finished at {session.completedAt ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(session.completedAt)) : "—"}.</p></section>
      </main>
    </div>
    {optionsOpen && <div onMouseDown={() => setOptionsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 73, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.58)" }}><section role="dialog" aria-modal="true" aria-label="Activity record settings" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(360px, 100%)", padding: 20, border: "1px solid var(--border)", borderRadius: 18, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><h2 style={{ color: "var(--primary)", fontSize: 20, margin: "0 0 7px" }}>Activity record</h2><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 18px" }}>Manage this completed activity.</p><button type="button" onClick={() => { setOptionsOpen(false); setDeleteConfirmOpen(true); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px solid #d9534f88", borderRadius: 12, padding: 12, background: "#d9534f16", color: "#d9534f", fontSize: 14, fontWeight: 800, cursor: "pointer" }}><MaterialIcon name="delete" size={18} />Delete activity record</button><button type="button" onClick={() => setOptionsOpen(false)} style={{ width: "100%", marginTop: 9, border: "none", padding: 10, background: "transparent", color: "var(--secondary)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Close</button></section></div>}
    {deleteConfirmOpen && <div onMouseDown={() => !deleting && setDeleteConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 74, display: "grid", placeItems: "center", padding: 24, background: "rgba(0, 0, 0, 0.62)" }}><section role="alertdialog" aria-modal="true" aria-label="Delete activity record" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(370px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><div style={{ width: 40, height: 40, display: "grid", placeItems: "center", marginBottom: 13, borderRadius: 12, background: "#d9534f1c", color: "#d9534f" }}><MaterialIcon name="delete" size={22} /></div><h2 style={{ color: "#d9534f", fontSize: 20, margin: "0 0 8px" }}>Delete this activity?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>This permanently removes the activity, its timing, and its intensity from your history.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}>Keep record</button><button type="button" onClick={() => void deleteRecord()} disabled={deleting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.65 : 1 }}>{deleting ? "Deleting…" : "Delete"}</button></div></section></div>}
  </div>;
}
