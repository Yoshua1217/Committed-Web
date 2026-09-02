"use client";

import { useMemo, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import { nextDueAt } from "@/lib/scheduled-checkins-service";

function formatDueTime(time: string): string {
  const due = new Date(nextDueAt(time));
  return new Intl.DateTimeFormat(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }).format(due);
}

export default function ScheduleCheckInModal({ title, detail, onClose, onSchedule }: { title: string; detail: string; onClose: () => void; onSchedule: (time: string) => Promise<void> }) {
  const [time, setTime] = useState("20:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dueLabel = useMemo(() => formatDueTime(time), [time]);

  async function schedule() {
    if (saving) return;
    setSaving(true); setError("");
    try { await onSchedule(time); onClose(); } catch (scheduleError) { console.error("Failed to schedule check-in:", scheduleError); setError("Couldn’t schedule this check-in. Please try again."); } finally { setSaving(false); }
  }

  return <div role="presentation" onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 75, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.62)" }}><section role="dialog" aria-modal="true" aria-labelledby="schedule-checkin-title" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(440px, 100%)", padding: 22, border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", boxShadow: "0 24px 72px rgba(0, 0, 0, 0.38)" }}><div className="flex items-start justify-between" style={{ gap: 16, marginBottom: 18 }}><div><p style={{ margin: "0 0 5px", color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase" }}>Check in later</p><h2 id="schedule-checkin-title" style={{ margin: 0, color: "var(--primary)", fontSize: 21, fontWeight: 850 }}>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close schedule check-in" className="workout-preview-icon-button"><MaterialIcon name="close" size={21} /></button></div><p style={{ margin: "0 0 20px", color: "var(--secondary)", fontSize: 14, lineHeight: 1.5 }}>{detail}</p><label style={{ display: "block", marginBottom: 10, color: "var(--primary)", fontSize: 13, fontWeight: 800 }}>When should we ask?</label><input type="time" value={time} onChange={(event) => setTime(event.target.value)} style={{ width: "100%", minHeight: 52, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 13, outline: "none", background: "var(--background)", color: "var(--primary)", fontSize: 16, fontWeight: 750 }} /><div className="flex items-center" style={{ gap: 8, marginTop: 12, padding: "11px 12px", borderRadius: 12, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 13, lineHeight: 1.4 }}><MaterialIcon name="schedule" size={17} color="#2e9a5b" />We&apos;ll ask you in the app after <strong style={{ color: "var(--primary)" }}>{dueLabel}</strong>.</div>{error && <p role="alert" style={{ margin: "12px 0 0", color: "#d9534f", fontSize: 13 }}>{error}</p>}<div className="flex" style={{ gap: 10, marginTop: 21 }}><button type="button" onClick={onClose} disabled={saving} style={{ flex: 1, padding: 13, border: "1px solid var(--border)", borderRadius: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => void schedule()} disabled={saving} style={{ flex: 1.25, padding: 13, border: "none", borderRadius: 12, background: "var(--primary)", color: "var(--background)", fontWeight: 850, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Scheduling…" : "Schedule check-in"}</button></div></section></div>;
}
