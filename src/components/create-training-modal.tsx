"use client";

import MaterialIcon from "@/components/material-icon";

interface CreateTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChooseWorkout: () => void;
  onChooseStretchRoutine: () => void;
}

export default function CreateTrainingModal({ isOpen, onClose, onChooseWorkout, onChooseStretchRoutine }: CreateTrainingModalProps) {
  if (!isOpen) return null;
  return <div role="dialog" aria-modal="true" aria-label="Create training" onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 62, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.62)" }}>
    <div onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(520px, 100%)", padding: 22, border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", boxShadow: "0 24px 72px rgba(0, 0, 0, 0.35)" }}>
      <div className="flex items-start justify-between" style={{ gap: 16, marginBottom: 18 }}>
        <div><p style={{ margin: "0 0 5px", color: "var(--secondary)", fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase" }}>Build your plan</p><h2 style={{ margin: 0, color: "var(--primary)", fontSize: 23, fontWeight: 850 }}>Create training</h2></div>
        <button type="button" onClick={onClose} aria-label="Close create menu" className="workout-preview-icon-button"><MaterialIcon name="close" size={21} /></button>
      </div>
      <div className="flex flex-col" style={{ gap: 10 }}>
        <button type="button" onClick={onChooseWorkout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "17px 16px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--background)", color: "var(--primary)", cursor: "pointer", textAlign: "left" }}>
          <span style={{ width: 45, height: 45, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 14, background: "var(--surface-variant)" }}><MaterialIcon name="fitness_center" size={24} /></span>
          <span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 16, fontWeight: 850 }}>Workout</strong><small style={{ display: "block", marginTop: 3, color: "var(--secondary)", fontSize: 13, fontWeight: 650 }}>Build an ordered plan with exercises, sets, and reps.</small></span><MaterialIcon name="chevron_right" size={21} color="var(--secondary)" />
        </button>
        <button type="button" onClick={onChooseStretchRoutine} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "17px 16px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--background)", color: "var(--primary)", cursor: "pointer", textAlign: "left" }}>
          <span style={{ width: 45, height: 45, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 14, background: "var(--surface-variant)", color: "#41e987" }}><MaterialIcon name="self_improvement" size={25} /></span>
          <span style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 16, fontWeight: 850 }}>Stretching routine</strong><small style={{ display: "block", marginTop: 3, color: "var(--secondary)", fontSize: 13, fontWeight: 650 }}>Choose stretches, their order, and how long to hold each one.</small></span><MaterialIcon name="chevron_right" size={21} color="var(--secondary)" />
        </button>
      </div>
    </div>
  </div>;
}
