"use client";

import { useState } from "react";
import MaterialIcon from "@/components/material-icon";
import { activityIntensities } from "@/lib/activity-intensity";
import { ActivityIntensity, WorkoutSession } from "@/lib/types";

interface ActiveActivityScreenProps {
  session: WorkoutSession;
  onFinish: (session: WorkoutSession, intensity: ActivityIntensity) => Promise<void>;
  onAbandon: (session: WorkoutSession) => Promise<void>;
}

function formatStartedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

export default function ActiveActivityScreen({ session, onFinish, onAbandon }: ActiveActivityScreenProps) {
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [selectedIntensity, setSelectedIntensity] = useState<ActivityIntensity | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const icon = session.activityIconSnapshot ?? "directions_run";
  const category = session.activityCategorySnapshot ?? "Activity";
  const description = session.activityDescriptionSnapshot ?? "An activity you chose to log.";

  async function finishActivity() {
    if (!selectedIntensity || finishing) return;
    setFinishing(true);
    setError("");
    try {
      await onFinish(session, selectedIntensity);
    } catch (finishError) {
      console.error("Could not finish activity:", finishError);
      setError("Couldn’t save this activity. Your start time is safe—please try again.");
    } finally {
      setFinishing(false);
    }
  }

  async function abandonActivity() {
    if (quitting) return;
    setQuitting(true);
    try {
      await onAbandon(session);
    } finally {
      setQuitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Active activity" className="active-activity-screen" style={{ position: "fixed", inset: 0, zIndex: 80, overflow: "hidden", background: "var(--background)" }}>
      <header className="active-activity-header">
        <p style={{ color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 5px" }}>Active activity</p>
        <div className="flex items-center justify-between" style={{ gap: 15 }}><h1 style={{ minWidth: 0, overflow: "hidden", color: "var(--primary)", fontSize: 23, lineHeight: 1.08, fontWeight: 850, letterSpacing: "-0.03em", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{session.workoutNameSnapshot}</h1><span className="active-activity-start-time"><MaterialIcon name="schedule" size={15} />Started {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(session.startedAt))}</span></div>
      </header>

      <main className="active-activity-content">
        <section className="active-activity-hero">
          <span className="active-activity-icon"><MaterialIcon name={icon} size={34} /></span>
          <p style={{ color: "#8eebaf", fontSize: 11, fontWeight: 850, letterSpacing: "0.09em", textTransform: "uppercase", margin: "0 0 7px" }}>{category}</p>
          <h2 style={{ color: "var(--primary)", fontSize: 28, lineHeight: 1.08, fontWeight: 850, letterSpacing: "-0.035em", margin: "0 0 11px" }}>{session.workoutNameSnapshot}</h2>
          <p style={{ color: "var(--primary)", fontSize: 14, lineHeight: 1.58, margin: 0 }}>{description}</p>
        </section>
        <section className="active-activity-start-card"><span style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 12, background: "var(--background)", color: "#41e987" }}><MaterialIcon name="play_circle" size={22} /></span><div><p style={{ color: "var(--secondary)", fontSize: 11, fontWeight: 850, letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 3px" }}>Started</p><strong style={{ color: "var(--primary)", fontSize: 15 }}>{formatStartedAt(session.startedAt)}</strong></div></section>
        <section style={{ padding: "17px 18px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><div className="flex items-center" style={{ gap: 8, marginBottom: 7, color: "var(--primary)" }}><MaterialIcon name="cloud_done" size={19} color="#41e987" /><h3 style={{ fontSize: 15, fontWeight: 850, margin: 0 }}>You&apos;re being logged</h3></div><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>Your activity is safely active in your account. Come back whenever you&apos;re done and we&apos;ll keep this original start time.</p></section>
        <div aria-hidden="true" style={{ height: 112 }} />
      </main>

      <footer className="active-activity-actions">{error && <p role="alert" style={{ margin: "0 0 9px", color: "#d9534f", fontSize: 12, fontWeight: 700, textAlign: "center" }}>{error}</p>}<div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setQuitConfirmOpen(true)} disabled={finishing} aria-label="Discard activity" style={{ width: 52, minHeight: 50, display: "grid", placeItems: "center", flexShrink: 0, padding: 0, border: "1px solid #d9534f66", borderRadius: 14, background: "#d9534f18", color: "#d9534f", cursor: finishing ? "not-allowed" : "pointer" }}><MaterialIcon name="close" size={22} /></button><button type="button" onClick={() => setIntensityOpen(true)} disabled={finishing} style={{ flex: 1, minHeight: 50, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: finishing ? "not-allowed" : "pointer" }}>Finish activity</button></div></footer>

      {intensityOpen && <div onMouseDown={() => !finishing && setIntensityOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 82, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.63)" }}><section role="dialog" aria-modal="true" aria-label="Choose activity intensity" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(455px, 100%)", padding: 21, border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", boxShadow: "0 24px 70px rgba(0, 0, 0, 0.42)" }}><div className="flex items-center" style={{ gap: 10, marginBottom: 6, color: "#41e987" }}><MaterialIcon name="tune" size={23} /><p style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Finish activity</p></div><h2 style={{ color: "var(--primary)", fontSize: 23, lineHeight: 1.1, fontWeight: 850, letterSpacing: "-0.03em", margin: "0 0 7px" }}>How did that feel?</h2><p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 17px" }}>Choose the effort that best fits this {session.workoutNameSnapshot.toLowerCase()}.</p><div className="flex flex-col" style={{ gap: 8 }}>{activityIntensities.map((intensity) => { const selected = selectedIntensity === intensity.value; return <button key={intensity.value} type="button" onClick={() => setSelectedIntensity(intensity.value)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 13px", border: selected ? "1px solid var(--primary)" : "1px solid var(--border)", borderRadius: 14, background: selected ? "var(--surface-variant)" : "var(--background)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}><span style={{ width: 35, height: 35, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 11, background: selected ? "#41e987" : "var(--surface-variant)", color: selected ? "#073019" : "var(--secondary)" }}><MaterialIcon name={intensity.icon} size={19} /></span><span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", fontSize: 14, fontWeight: 850 }}>{intensity.label}</strong><small style={{ display: "block", marginTop: 2, color: "var(--secondary)", fontSize: 11, lineHeight: 1.3, fontWeight: 600 }}>{intensity.description}</small></span>{selected && <MaterialIcon name="check_circle" size={20} color="#41e987" />}</button>; })}</div><div className="flex" style={{ gap: 10, marginTop: 18 }}><button type="button" onClick={() => setIntensityOpen(false)} disabled={finishing} style={{ flex: 1, minHeight: 48, border: "1px solid var(--border)", borderRadius: 13, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: finishing ? "not-allowed" : "pointer" }}>Back</button><button type="button" onClick={() => void finishActivity()} disabled={!selectedIntensity || finishing} style={{ flex: 1.2, minHeight: 48, border: "none", borderRadius: 13, background: "var(--primary)", color: "var(--background)", fontWeight: 850, cursor: !selectedIntensity || finishing ? "not-allowed" : "pointer", opacity: !selectedIntensity || finishing ? 0.48 : 1 }}>{finishing ? "Saving…" : "Save activity"}</button></div></section></div>}

      {quitConfirmOpen && <div onMouseDown={() => !quitting && setQuitConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 83, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.63)" }}><section role="alertdialog" aria-modal="true" aria-label="Discard activity" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(370px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.38)" }}><div style={{ width: 40, height: 40, display: "grid", placeItems: "center", marginBottom: 13, borderRadius: 12, background: "#d9534f1c", color: "#d9534f" }}><MaterialIcon name="delete" size={22} /></div><h2 style={{ color: "#d9534f", fontSize: 20, fontWeight: 850, margin: "0 0 8px" }}>Discard this activity?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>Its saved start time will be permanently removed and nothing will be added to your history.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setQuitConfirmOpen(false)} disabled={quitting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: quitting ? "not-allowed" : "pointer" }}>Keep activity</button><button type="button" onClick={() => void abandonActivity()} disabled={quitting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: quitting ? "not-allowed" : "pointer", opacity: quitting ? 0.65 : 1 }}>{quitting ? "Discarding…" : "Discard"}</button></div></section></div>}
    </div>
  );
}
