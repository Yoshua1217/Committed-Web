"use client";

import { useRef, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import AddSessionStretchModal from "@/components/add-session-stretch-modal";
import PreviousSessionTiming from "@/components/previous-session-timing";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { addStretchToSession, hasValidPreviousWorkoutTiming } from "@/lib/workout-session";
import type { WorkoutSession } from "@/lib/types";

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}` : `${seconds}s`;
}

export default function ActiveStretchRoutineScreen({ session: initialSession, onChange, onFinish, onAbandon }: {
  session: WorkoutSession; onChange: (session: WorkoutSession) => Promise<void>;
  onFinish: (session: WorkoutSession) => Promise<void>; onAbandon: (session: WorkoutSession) => Promise<void>;
}) {
  const [session, setSession] = useState(initialSession);
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const previous = session.entryMode === "previous";
  const stretches = (session.stretches ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const totalSeconds = stretches.reduce((total, stretch) => total + stretch.holdSeconds, 0);
  const canFinish = stretches.length > 0 && (!previous || hasValidPreviousWorkoutTiming(session));
  async function change(next: WorkoutSession) {
    await onChange(next);
    setSession(next);
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); }
    catch { setError("Couldn’t save your changes. Your session is still here. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div role="dialog" aria-modal="true" aria-label={previous ? "Log previous stretching" : "Active stretching routine"} style={{ position: "fixed", inset: 0, zIndex: 80, overflow: "hidden", background: "var(--background)" }}>
    <header className="active-activity-header"><div className="flex items-center justify-between" style={{ gap: 14 }}><div><p style={{ margin: "0 0 5px", color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase" }}>{previous ? "Log previous stretching" : "Stretching routine"}</p><h1 style={{ margin: 0, color: "var(--primary)", fontSize: 22, fontWeight: 850 }}>{session.workoutNameSnapshot}</h1></div><span className="active-activity-start-time"><MaterialIcon name="self_improvement" size={16} />{formatDuration(totalSeconds)} of stretches</span></div></header>
    <main className="active-activity-content" style={{ paddingBottom: 160 }}>
      {previous && <PreviousSessionTiming session={session} onChange={change} disabled={busy} />}
      <section className="active-activity-hero"><span className="active-activity-icon"><MaterialIcon name="self_improvement" size={30} /></span><h2 style={{ margin: "0 0 8px", color: "var(--primary)", fontSize: 22, fontWeight: 850 }}>{previous ? "Record your stretches." : "Take your time."}</h2><p style={{ margin: 0, color: "var(--secondary)", fontSize: 14, lineHeight: 1.55 }}>{session.stretchRoutineDescriptionSnapshot || (previous ? "Add the stretches you completed and enter your total session time." : "Add stretches and move through your routine at your own pace.")}</p></section>
      <p style={{ margin: "0 0 10px", color: "var(--primary)", fontSize: 14, fontWeight: 850 }}>Your routine</p>
      <div className="flex flex-col" style={{ gap: 12 }}>{stretches.map((stretch, index) => <article key={stretch.stretchId} style={{ padding: 15, border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}>
        <div className="flex items-start" style={{ gap: 12 }}><span style={{ width: 30, height: 30, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 9, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{index + 1}</span><div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-start justify-between" style={{ gap: 10 }}><h2 style={{ margin: 0, color: "var(--primary)", fontSize: 16, fontWeight: 850 }}>{stretch.stretchNameSnapshot}</h2><button type="button" disabled={busy} aria-label={`Remove ${stretch.stretchNameSnapshot}`} className="workout-preview-settings-button" onClick={() => void run(() => change({ ...session, stretches: stretches.filter((item) => item.stretchId !== stretch.stretchId), updatedAt: Date.now() }))}><MaterialIcon name="close" size={18} /></button></div>
          <span style={{ display: "inline-block", marginTop: 7, padding: "6px 8px", borderRadius: 9, background: "#41e9871a", color: "#2e9a5b", fontSize: 12, fontWeight: 850 }}>{formatDuration(stretch.holdSeconds)}</span>
          <p style={{ margin: "7px 0 0", color: "var(--secondary)", fontSize: 13, lineHeight: 1.45 }}>{stretch.summarySnapshot}</p><p style={{ margin: "9px 0 0", color: "var(--primary)", fontSize: 12, lineHeight: 1.55 }}>{stretch.instructionsSnapshot}</p>
        </div></div>
      </article>)}</div>
      <button type="button" disabled={busy} onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "min(220px, 100%)", margin: "18px auto", padding: "10px 18px", border: 0, borderRadius: 999, background: "#fff", color: "#111", fontSize: 13, fontWeight: 800, cursor: "pointer" }}><MaterialIcon name="add" size={18} />Add stretch</button>
    </main>
    <footer className="active-activity-actions">
      {error && <p role="alert" style={{ color: "#d9534f", fontSize: 13, textAlign: "center" }}>{error}</p>}
      {!canFinish && <p style={{ color: "var(--secondary)", fontSize: 12, textAlign: "center", margin: "0 0 10px" }}>{!stretches.length ? "Add at least one stretch to save this session." : "Set the date and duration before saving."}</p>}
      <div className="flex" style={{ gap: 10, maxWidth: 672, margin: "0 auto" }}><button type="button" disabled={busy} onClick={() => setDiscarding(true)} aria-label="Quit stretching routine" style={{ width: 54, minHeight: 52, display: "grid", placeItems: "center", padding: 0, border: "1px solid #d9534f66", borderRadius: 14, background: "#d9534f14", color: "#d9534f", cursor: "pointer" }}><MaterialIcon name="close" size={23} /></button><button type="button" disabled={busy || !canFinish} onClick={() => void run(() => onFinish(session))} style={{ flex: 1, minHeight: 52, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", fontSize: 16, fontWeight: 850, cursor: "pointer", opacity: busy || !canFinish ? .5 : 1 }}>{busy ? "Saving…" : previous ? "Save stretching" : "Finish stretching routine"}</button></div>
    </footer>
    {adding && <AddSessionStretchModal existingIds={stretches.map((item) => item.stretchId)} onClose={() => setAdding(false)} onAdd={(stretch, seconds) => change(addStretchToSession(session, stretch, seconds))} />}
    {discarding && <WorkoutFlowDialog title="Discard stretching session?" description="This session won’t be added to your history." busy={busy} onClose={() => setDiscarding(false)}><button type="button" disabled={busy} onClick={() => void run(() => onAbandon(session))} style={{ width: "100%", padding: 14, border: 0, borderRadius: 12, background: "#d9534f", color: "#fff", fontWeight: 800 }}>Discard session</button>{error && <p role="alert" style={{ color: "#d9534f" }}>{error}</p>}</WorkoutFlowDialog>}
  </div>;
}
