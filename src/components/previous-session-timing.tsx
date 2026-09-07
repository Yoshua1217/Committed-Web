"use client";

import { useState } from "react";
import MaterialIcon from "@/components/material-icon";
import PreviousWorkoutDetailsModal from "@/components/previous-workout-details-modal";
import type { WorkoutSession } from "@/lib/types";

export default function PreviousSessionTiming({ session, onChange, disabled = false }: {
  session: WorkoutSession; onChange: (session: WorkoutSession) => Promise<void>; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const seconds = session.durationSeconds ?? 0;
  return <>
    <button type="button" disabled={disabled} onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 16, marginBottom: 16, border: "1px solid var(--border)", borderRadius: 15, background: "var(--surface)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}>
      <MaterialIcon name="schedule" size={23} color="#2e9a5b" /><span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 14 }}>{seconds ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : "Set date & duration"}</strong><small style={{ display: "block", marginTop: 5, color: "var(--secondary)" }}>{session.performedAt ? new Date(session.performedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "When did you finish?"}</small></span><MaterialIcon name="edit" size={18} />
    </button>
    {open && <PreviousWorkoutDetailsModal session={session} onClose={() => setOpen(false)} onSave={async (next) => { await onChange(next); setOpen(false); }} />}
  </>;
}
