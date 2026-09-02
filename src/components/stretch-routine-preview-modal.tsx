"use client";

import { useMemo } from "react";
import MaterialIcon from "@/components/material-icon";
import stretchCatalogueJson from "@/data/stretching-catalogue.json";
import { StretchDefinition, StretchRoutineDefinition, StretchRoutinePlan } from "@/lib/types";

const catalogue = stretchCatalogueJson as StretchDefinition[];
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}` : `${seconds}s`;
}

export default function StretchRoutinePreviewModal({ routine, onClose, onStart, onScheduleCheckIn, pendingCheckInAt }: { routine: StretchRoutineDefinition; onClose: () => void; onStart: (routine: StretchRoutineDefinition) => void; onScheduleCheckIn: () => void; pendingCheckInAt: number | null }) {
  const stretches = useMemo(() => routine.stretches.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, stretch: catalogue.find((item) => item.id === plan.stretchId) })).filter((entry): entry is { plan: StretchRoutinePlan; stretch: StretchDefinition } => Boolean(entry.stretch)), [routine.stretches]);
  const totalSeconds = stretches.reduce((total, { plan }) => total + plan.holdSeconds, 0);
  const days = routine.scheduledDays.map((day) => dayNames[day]).join(" · ");
  const scheduledLabel = pendingCheckInAt ? new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(pendingCheckInAt)) : null;

  return <div role="dialog" aria-modal="true" aria-label={`${routine.name} stretching routine preview`} style={{ position: "fixed", inset: 0, zIndex: 70, overflow: "hidden", background: "var(--background)" }}>
    <div className="workout-preview-sheet">
      <header className="workout-preview-header"><div className="workout-preview-drag-handle" aria-hidden="true" /><div className="flex items-center justify-between" style={{ gap: 12 }}><button type="button" onClick={onClose} aria-label="Close stretching routine preview" className="workout-preview-icon-button"><MaterialIcon name="close" size={22} /></button><span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Routine preview</span><span style={{ width: 42 }} /></div></header>
      <main className="workout-preview-content" style={{ paddingBottom: 104 }}>
        <p style={{ margin: "0 0 8px", color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.09em", textTransform: "uppercase" }}>{stretches.length} stretches · {formatDuration(totalSeconds)}</p>
        <h1 style={{ margin: "0 0 12px", color: "var(--primary)", fontSize: 30, fontWeight: 850 }}>{routine.name}</h1>
        {routine.description && <p className="workout-preview-description">{routine.description}</p>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 24px" }}><span className="completed-workout-stat"><MaterialIcon name="schedule" size={15} />{formatDuration(totalSeconds)} total</span><span className="completed-workout-stat"><MaterialIcon name="calendar_today" size={14} />{days}</span>{scheduledLabel && <span className="completed-workout-stat" style={{ color: "#d69e13", borderColor: "#d69e1350" }}><MaterialIcon name="pending_actions" size={15} />Check-in {scheduledLabel}</span>}</div>
        <section><h2 className="workout-preview-section-title">Routine order</h2><div className="flex flex-col" style={{ gap: 10 }}>{stretches.map(({ plan, stretch }, index) => <article key={stretch.id} style={{ padding: "15px 15px 14px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><div className="flex items-start" style={{ gap: 12 }}><span style={{ width: 30, height: 30, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 9, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{index + 1}</span><div style={{ minWidth: 0, flex: 1 }}><div className="flex items-start justify-between" style={{ gap: 10 }}><h3 style={{ margin: 0, color: "var(--primary)", fontSize: 16, fontWeight: 850 }}>{stretch.name}</h3><span style={{ flexShrink: 0, padding: "6px 8px", borderRadius: 9, background: "#41e9871a", color: "#2e9a5b", fontSize: 12, fontWeight: 850 }}>{formatDuration(plan.holdSeconds)}</span></div><p style={{ margin: "7px 0 0", color: "var(--secondary)", fontSize: 13, lineHeight: 1.45 }}>{stretch.summary}</p><p style={{ margin: "9px 0 0", color: "var(--primary)", fontSize: 12, lineHeight: 1.55 }}>{stretch.instructions}</p></div></div></article>)}</div></section>
      </main>
    </div>
    <footer className="workout-preview-actions"><button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--surface)", color: "var(--primary)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Close</button><button type="button" onClick={onScheduleCheckIn} style={{ border: "1px solid #d69e1350", borderRadius: 14, padding: 14, background: "#d69e1315", color: "#d69e13", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{pendingCheckInAt ? "Reschedule" : "Check in later"}</button><button type="button" onClick={() => onStart(routine)} style={{ border: "none", borderRadius: 14, padding: 14, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: "pointer" }}>Start</button></footer>
  </div>;
}
