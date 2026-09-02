"use client";

import MaterialIcon from "@/components/material-icon";
import { WorkoutSession } from "@/lib/types";

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}` : `${seconds}s`;
}

export default function ActiveStretchRoutineScreen({ session, onFinish, onAbandon }: { session: WorkoutSession; onFinish: (session: WorkoutSession) => void; onAbandon: (session: WorkoutSession) => void }) {
  const stretches = (session.stretches ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const totalSeconds = stretches.reduce((total, stretch) => total + stretch.holdSeconds, 0);

  return <div role="dialog" aria-modal="true" aria-label="Active stretching routine" style={{ position: "fixed", inset: 0, zIndex: 80, overflow: "hidden", background: "var(--background)" }}>
    <header className="active-activity-header"><div className="flex items-center justify-between" style={{ gap: 14 }}><div><p style={{ margin: "0 0 5px", color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase" }}>Stretching routine</p><h1 style={{ margin: 0, color: "var(--primary)", fontSize: 22, fontWeight: 850 }}>{session.workoutNameSnapshot}</h1></div><span className="active-activity-start-time"><MaterialIcon name="self_improvement" size={16} />{formatDuration(totalSeconds)}</span></div></header>
    <main className="active-activity-content" style={{ paddingBottom: 110 }}>
      <section className="active-activity-hero"><span className="active-activity-icon"><MaterialIcon name="self_improvement" size={30} /></span><h2 style={{ margin: "0 0 8px", color: "var(--primary)", fontSize: 22, fontWeight: 850 }}>Take your time.</h2><p style={{ margin: 0, color: "var(--secondary)", fontSize: 14, lineHeight: 1.55 }}>{session.stretchRoutineDescriptionSnapshot || "Move through each stretch at your own pace, then mark the routine complete when you’re done."}</p></section>
      <p style={{ margin: "0 0 10px", color: "var(--primary)", fontSize: 14, fontWeight: 850 }}>Your routine</p>
      <div className="flex flex-col" style={{ gap: 10 }}>{stretches.map((stretch, index) => <article key={stretch.stretchId} style={{ padding: "15px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><div className="flex items-start" style={{ gap: 12 }}><span style={{ width: 30, height: 30, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 9, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{index + 1}</span><div style={{ minWidth: 0, flex: 1 }}><div className="flex items-start justify-between" style={{ gap: 10 }}><h2 style={{ margin: 0, color: "var(--primary)", fontSize: 16, fontWeight: 850 }}>{stretch.stretchNameSnapshot}</h2><span style={{ flexShrink: 0, padding: "6px 8px", borderRadius: 9, background: "#41e9871a", color: "#2e9a5b", fontSize: 12, fontWeight: 850 }}>{formatDuration(stretch.holdSeconds)}</span></div><p style={{ margin: "7px 0 0", color: "var(--secondary)", fontSize: 13, lineHeight: 1.45 }}>{stretch.summarySnapshot}</p><p style={{ margin: "9px 0 0", color: "var(--primary)", fontSize: 12, lineHeight: 1.55 }}>{stretch.instructionsSnapshot}</p></div></div></article>)}</div>
    </main>
    <footer className="active-activity-actions"><div className="flex" style={{ gap: 10, maxWidth: 672, margin: "0 auto" }}><button type="button" onClick={() => onAbandon(session)} aria-label="Quit stretching routine" style={{ width: 54, minHeight: 52, display: "grid", placeItems: "center", padding: 0, border: "1px solid #d9534f66", borderRadius: 14, background: "#d9534f14", color: "#d9534f", cursor: "pointer" }}><MaterialIcon name="close" size={23} /></button><button type="button" onClick={() => onFinish(session)} style={{ flex: 1, minHeight: 52, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", fontSize: 16, fontWeight: 850, cursor: "pointer" }}>Finish stretching routine</button></div></footer>
  </div>;
}
