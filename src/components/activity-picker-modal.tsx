"use client";

import { useMemo, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import activityCatalogueJson from "@/data/activity-catalogue.json";
import { ActivityDefinition } from "@/lib/types";

const activities = activityCatalogueJson as ActivityDefinition[];

interface ActivityPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (activity: ActivityDefinition) => Promise<void>;
}

export default function ActivityPickerModal({ isOpen, onClose, onStart }: ActivityPickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<ActivityDefinition | null>(null);
  const [starting, setStarting] = useState(false);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return activities;
    return activities.filter((activity) => [activity.name, activity.category, activity.description].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [query]);

  if (!isOpen) return null;

  async function startSelectedActivity() {
    if (!selectedActivity || starting) return;
    setStarting(true);
    try {
      await onStart(selectedActivity);
      setSelectedActivity(null);
      setQuery("");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.63)" }}>
      <section role="dialog" aria-modal="true" aria-label={selectedActivity ? `${selectedActivity.name} preview` : "Log a new activity"} onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(610px, 100%)", maxHeight: "min(760px, 100%)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: 24, background: "var(--surface)", boxShadow: "0 26px 80px rgba(0, 0, 0, 0.48)" }}>
        {selectedActivity ? (
          <div style={{ padding: "22px 22px 20px" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
              <button type="button" onClick={() => setSelectedActivity(null)} aria-label="Back to activity list" style={{ width: 40, height: 40, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--border)", borderRadius: "50%", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="arrow_back" size={21} /></button>
              <p style={{ color: "var(--secondary)", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Activity preview</p>
              <button type="button" onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--border)", borderRadius: "50%", background: "transparent", color: "var(--secondary)", cursor: "pointer" }}><MaterialIcon name="close" size={21} /></button>
            </div>
            <div style={{ padding: "23px 20px", border: "1px solid var(--border)", borderRadius: 20, background: "var(--background)" }}>
              <span style={{ width: 52, height: 52, display: "grid", placeItems: "center", marginBottom: 17, borderRadius: 17, background: "#41e987", color: "#073019" }}><MaterialIcon name={selectedActivity.icon} size={28} /></span>
              <p style={{ color: "#8eebaf", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" }}>{selectedActivity.category}</p>
              <h2 style={{ color: "var(--primary)", fontSize: 28, lineHeight: 1.08, fontWeight: 850, letterSpacing: "-0.035em", margin: "0 0 12px" }}>{selectedActivity.name}</h2>
              <p style={{ color: "var(--primary)", fontSize: 14, lineHeight: 1.56, margin: 0 }}>{selectedActivity.description}</p>
            </div>
            <p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.5, margin: "18px 2px 20px" }}>Starting saves the exact time now. You can leave the app and finish it whenever you&apos;re done.</p>
            <div className="flex" style={{ gap: 10 }}>
              <button type="button" onClick={() => setSelectedActivity(null)} disabled={starting} style={{ flex: 1, minHeight: 50, border: "1px solid var(--border)", borderRadius: 14, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: starting ? "not-allowed" : "pointer" }}>Back</button>
              <button type="button" onClick={() => void startSelectedActivity()} disabled={starting} style={{ flex: 1.25, minHeight: 50, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", fontWeight: 850, cursor: starting ? "not-allowed" : "pointer", opacity: starting ? 0.65 : 1 }}>{starting ? "Starting…" : "Start activity"}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "22px 22px 20px" }}>
            <div className="flex items-start justify-between" style={{ gap: 16, marginBottom: 20 }}>
              <div><p style={{ color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" }}>Activities</p><h2 style={{ color: "var(--primary)", fontSize: 25, lineHeight: 1.08, fontWeight: 850, letterSpacing: "-0.03em", margin: 0 }}>What are you doing?</h2></div>
              <button type="button" onClick={onClose} aria-label="Close activity picker" style={{ width: 40, height: 40, display: "grid", placeItems: "center", flexShrink: 0, padding: 0, border: "1px solid var(--border)", borderRadius: "50%", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="close" size={21} /></button>
            </div>
            <p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 17px" }}>Pick an activity, start it now, and set the effort level when you&apos;re finished.</p>
            <label className="flex items-center" style={{ gap: 10, minHeight: 48, padding: "0 13px", marginBottom: 17, border: "1px solid var(--border)", borderRadius: 14, background: "var(--background)", color: "var(--secondary)" }}><MaterialIcon name="search" size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activities" style={{ minWidth: 0, flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 14, fontWeight: 650 }} /></label>
            <div className="flex flex-col" style={{ gap: 9 }}>
              {matches.map((activity) => <button key={activity.id} type="button" onClick={() => setSelectedActivity(activity)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "13px 14px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--background)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}><span style={{ width: 40, height: 40, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 13, background: "var(--surface-variant)", color: "#41e987" }}><MaterialIcon name={activity.icon} size={22} /></span><span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", overflow: "hidden", fontSize: 15, fontWeight: 850, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activity.name}</strong><small style={{ display: "block", marginTop: 3, color: "var(--secondary)", fontSize: 12, fontWeight: 650 }}>{activity.category}</small></span><MaterialIcon name="chevron_right" size={21} color="var(--secondary)" /></button>)}
              {!matches.length && <div style={{ padding: "27px 12px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 15, color: "var(--secondary)" }}><MaterialIcon name="search_off" size={26} /><p style={{ margin: "9px 0 0", fontSize: 13, fontWeight: 700 }}>No activities match that search.</p></div>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
