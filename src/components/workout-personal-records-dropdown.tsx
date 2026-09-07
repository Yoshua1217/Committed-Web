"use client";

import { useId, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import type { WorkoutPersonalRecordEvent } from "@/lib/types";

export default function WorkoutPersonalRecordsDropdown({ records }: { records: WorkoutPersonalRecordEvent[] }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  if (!records.length) return null;

  return <section style={{ width: "100%", margin: "15px 0 19px", border: "1px solid #f5c84c40", borderRadius: 12, background: "var(--surface, #111)", overflow: "hidden", textAlign: "left" }}>
    <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", minHeight: 48, padding: "12px 14px", border: 0, background: "#f5c84c08", color: "#d69e13", font: "inherit", fontSize: 13, fontWeight: 800, textAlign: "left", cursor: "pointer" }}>
      <MaterialIcon name="emoji_events" size={19} color="#d69e13" />
      <span>{records.length === 1 ? "PR set" : "PRs set"}</span>
      <span aria-hidden="true" style={{ display: "flex", marginLeft: "auto", transform: open ? "rotate(180deg)" : undefined }}><MaterialIcon name="expand_more" size={19} color="#d69e13" /></span>
    </button>
    <div id={contentId} hidden={!open} style={{ display: open ? "grid" : "none", gap: 8, padding: "2px 14px 14px" }}>
      {records.map((record) => <div key={record.exerciseId} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "3px 14px", padding: "9px 11px", borderRadius: 8, background: "#f5c84c0d", fontSize: 12, lineHeight: 1.5 }}>
        <span style={{ color: "var(--primary, #fff)", fontWeight: 650 }}>{record.exerciseNameSnapshot}</span>
        <span style={{ color: "#d69e13", fontWeight: 750, whiteSpace: "nowrap" }}>{record.weightLbs} lbs{record.reps !== null ? ` × ${record.reps} reps` : ""}</span>
      </div>)}
    </div>
  </section>;
}
