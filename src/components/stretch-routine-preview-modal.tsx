"use client";

import { useMemo, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import stretchCatalogueJson from "@/data/stretching-catalogue.json";
import { StretchDefinition, StretchRoutineDefinition, StretchRoutinePlan } from "@/lib/types";

const catalogue = stretchCatalogueJson as StretchDefinition[];
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ""}` : `${seconds}s`;
}

const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];

export default function StretchRoutinePreviewModal({ routine, onClose, onStart, onSave, onDelete, onScheduleCheckIn, pendingCheckInAt }: { routine: StretchRoutineDefinition; onClose: () => void; onStart: (routine: StretchRoutineDefinition) => void; onSave: (routine: StretchRoutineDefinition) => Promise<void>; onDelete: (routine: StretchRoutineDefinition) => Promise<void>; onScheduleCheckIn: () => void; pendingCheckInAt: number | null }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stretchSearch, setStretchSearch] = useState("");
  const [draft, setDraft] = useState<StretchRoutineDefinition>(() => ({ ...routine, scheduledDays: [...routine.scheduledDays], stretches: routine.stretches.map((plan) => ({ ...plan })) }));
  const stretches = useMemo(() => routine.stretches.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, stretch: catalogue.find((item) => item.id === plan.stretchId) })).filter((entry): entry is { plan: StretchRoutinePlan; stretch: StretchDefinition } => Boolean(entry.stretch)), [routine.stretches]);
  const draftStretches = useMemo(() => draft.stretches.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, stretch: catalogue.find((item) => item.id === plan.stretchId) })).filter((entry): entry is { plan: StretchRoutinePlan; stretch: StretchDefinition } => Boolean(entry.stretch)), [draft.stretches]);
  const addableStretches = useMemo(() => {
    const query = stretchSearch.trim().toLowerCase();
    const selectedIds = new Set(draft.stretches.map((plan) => plan.stretchId));
    return catalogue.filter((stretch) => !selectedIds.has(stretch.id) && (!query || [stretch.name, stretch.summary, ...stretch.primaryMuscleGroups, ...stretch.secondaryMuscleGroups].join(" ").toLowerCase().includes(query)));
  }, [draft.stretches, stretchSearch]);
  const totalSeconds = stretches.reduce((total, { plan }) => total + plan.holdSeconds, 0);
  const days = routine.scheduledDays.map((day) => dayNames[day]).join(" · ");
  const scheduledLabel = pendingCheckInAt ? new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(pendingCheckInAt)) : null;

  function openEditor() {
    setDraft({ ...routine, scheduledDays: [...routine.scheduledDays], stretches: routine.stretches.map((plan) => ({ ...plan })) });
    setStretchSearch("");
    setEditorOpen(true);
  }

  function toggleDay(day: number) {
    setDraft((current) => ({ ...current, scheduledDays: current.scheduledDays.includes(day as StretchRoutineDefinition["scheduledDays"][number]) ? current.scheduledDays.filter((item) => item !== day) : [...current.scheduledDays, day as StretchRoutineDefinition["scheduledDays"][number]] }));
  }

  function updateStretch(stretchId: string, holdSeconds: number) {
    setDraft((current) => ({ ...current, stretches: current.stretches.map((plan) => plan.stretchId === stretchId ? { ...plan, holdSeconds: Math.max(1, holdSeconds) } : plan) }));
  }

  function moveStretch(stretchId: string, direction: -1 | 1) {
    setDraft((current) => {
      const ordered = current.stretches.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      const index = ordered.findIndex((plan) => plan.stretchId === stretchId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= ordered.length) return current;
      [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
      return { ...current, stretches: ordered.map((plan, sortOrder) => ({ ...plan, sortOrder })) };
    });
  }

  function removeStretch(stretchId: string) {
    setDraft((current) => ({ ...current, stretches: current.stretches.filter((plan) => plan.stretchId !== stretchId).map((plan, sortOrder) => ({ ...plan, sortOrder })) }));
  }

  function addStretch(stretch: StretchDefinition) {
    setDraft((current) => ({ ...current, stretches: [...current.stretches, { stretchId: stretch.id, holdSeconds: 20, sortOrder: current.stretches.length }] }));
  }

  async function saveEditor() {
    if (!draft.name.trim() || !draft.stretches.length || !draft.scheduledDays.length || saving) return;
    setSaving(true);
    try {
      await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim(), stretches: draft.stretches.map((plan, sortOrder) => ({ ...plan, sortOrder })), updatedAt: Date.now() });
      setEditorOpen(false);
    } finally { setSaving(false); }
  }

  async function deleteRoutine() {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(routine); } finally { setDeleting(false); }
  }

  return <div role="dialog" aria-modal="true" aria-label={`${routine.name} stretching routine preview`} style={{ position: "fixed", inset: 0, zIndex: 70, overflow: "hidden", background: "var(--background)" }}>
    <div className="workout-preview-sheet">
      <header className="workout-preview-header"><div className="workout-preview-drag-handle" aria-hidden="true" /><div className="flex items-center justify-between" style={{ gap: 12 }}><button type="button" onClick={onClose} aria-label="Close stretching routine preview" className="workout-preview-icon-button"><MaterialIcon name="close" size={22} /></button><span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Routine preview</span><span style={{ width: 42 }} /></div></header>
      <main className="workout-preview-content" style={{ paddingBottom: 104 }}>
        <div className="flex items-center" style={{ gap: 9, marginBottom: 8 }}><p style={{ margin: 0, color: "#2e9a5b", fontSize: 11, fontWeight: 850, letterSpacing: "0.09em", textTransform: "uppercase" }}>{stretches.length} stretches · {formatDuration(totalSeconds)}</p><button type="button" onClick={openEditor} aria-label="Edit stretching routine" className="workout-preview-settings-button"><MaterialIcon name="settings" size={17} /></button></div>
        <h1 style={{ margin: "0 0 12px", color: "var(--primary)", fontSize: 30, fontWeight: 850 }}>{routine.name}</h1>
        {routine.description && <p className="workout-preview-description">{routine.description}</p>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 24px" }}><span className="completed-workout-stat"><MaterialIcon name="schedule" size={15} />{formatDuration(totalSeconds)} total</span><span className="completed-workout-stat"><MaterialIcon name="calendar_today" size={14} />{days}</span>{scheduledLabel && <span className="completed-workout-stat" style={{ color: "#d69e13", borderColor: "#d69e1350" }}><MaterialIcon name="pending_actions" size={15} />Check-in {scheduledLabel}</span>}</div>
        <section><h2 className="workout-preview-section-title">Routine order</h2><div className="flex flex-col" style={{ gap: 10 }}>{stretches.map(({ plan, stretch }, index) => <article key={stretch.id} style={{ padding: "15px 15px 14px", border: "1px solid var(--border)", borderRadius: 17, background: "var(--surface)" }}><div className="flex items-start" style={{ gap: 12 }}><span style={{ width: 30, height: 30, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 9, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{index + 1}</span><div style={{ minWidth: 0, flex: 1 }}><div className="flex items-start justify-between" style={{ gap: 10 }}><h3 style={{ margin: 0, color: "var(--primary)", fontSize: 16, fontWeight: 850 }}>{stretch.name}</h3><span style={{ flexShrink: 0, padding: "6px 8px", borderRadius: 9, background: "#41e9871a", color: "#2e9a5b", fontSize: 12, fontWeight: 850 }}>{formatDuration(plan.holdSeconds)}</span></div><p style={{ margin: "7px 0 0", color: "var(--secondary)", fontSize: 13, lineHeight: 1.45 }}>{stretch.summary}</p><p style={{ margin: "9px 0 0", color: "var(--primary)", fontSize: 12, lineHeight: 1.55 }}>{stretch.instructions}</p></div></div></article>)}</div></section>
      </main>
    </div>
    <footer className="workout-preview-actions"><button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--surface)", color: "var(--primary)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Close</button><button type="button" onClick={onScheduleCheckIn} style={{ border: "1px solid #d69e1350", borderRadius: 14, padding: 14, background: "#d69e1315", color: "#d69e13", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{pendingCheckInAt ? "Reschedule" : "Check in later"}</button><button type="button" onClick={() => onStart(routine)} style={{ border: "none", borderRadius: 14, padding: 14, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 850, cursor: "pointer" }}>Start</button></footer>
    {editorOpen && <div onMouseDown={() => !saving && setEditorOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 74, display: "grid", placeItems: "center", padding: 18, background: "rgba(0, 0, 0, 0.6)" }}><div role="dialog" aria-modal="true" aria-label="Edit stretching routine" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(620px, 100%)", maxHeight: "calc(100dvh - 36px)", overflowY: "auto", padding: 20, border: "1px solid var(--border)", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.4)" }}><div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 18 }}><h2 style={{ color: "var(--primary)", fontSize: 21, margin: 0 }}>Edit stretching routine</h2><button type="button" onClick={() => setEditorOpen(false)} disabled={saving} aria-label="Close stretching routine editor" className="workout-preview-settings-button"><MaterialIcon name="close" size={19} /></button></div><label className="workout-settings-label">Name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="workout-settings-input" /></label><label className="workout-settings-label">Description<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="workout-settings-input" rows={2} /></label><section style={{ marginTop: 21 }}><h3 style={{ color: "var(--primary)", fontSize: 15, margin: "0 0 10px" }}>Routine days</h3><div className="flex justify-between" style={{ gap: 6 }}>{dayLetters.map((letter, index) => { const selected = draft.scheduledDays.includes(index as StretchRoutineDefinition["scheduledDays"][number]); return <button key={`${letter}-${index}`} type="button" onClick={() => toggleDay(index)} aria-label={`${selected ? "Remove" : "Add"} ${dayNames[index]}`} aria-pressed={selected} style={{ width: 34, height: 34, minHeight: 0, display: "grid", placeItems: "center", border: selected ? "1px solid #2e9a5b" : "1px solid var(--border)", borderRadius: "50%", background: selected ? "#41e9871c" : "var(--background)", color: selected ? "#2e9a5b" : "var(--secondary)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{letter}</button>; })}</div></section><section style={{ marginTop: 24 }}><div className="flex items-center justify-between" style={{ marginBottom: 10 }}><h3 style={{ color: "var(--primary)", fontSize: 15, margin: 0 }}>Routine order</h3><span style={{ color: "var(--secondary)", fontSize: 12, fontWeight: 700 }}>{draftStretches.length} added</span></div><div className="flex flex-col" style={{ gap: 9 }}>{draftStretches.map(({ plan, stretch }, index) => <article key={stretch.id} style={{ padding: 13, border: "1px solid var(--border)", borderRadius: 14, background: "var(--background)" }}><div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 11 }}><div className="flex items-center" style={{ minWidth: 0, gap: 8 }}><span style={{ width: 24, height: 24, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 8, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 11, fontWeight: 800 }}>{index + 1}</span><strong style={{ overflow: "hidden", color: "var(--primary)", fontSize: 14, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stretch.name}</strong></div><div className="flex" style={{ gap: 2 }}><button type="button" onClick={() => moveStretch(stretch.id, -1)} disabled={index === 0} aria-label={`Move ${stretch.name} earlier`} className="workout-preview-settings-button" style={{ opacity: index === 0 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_up" size={17} /></button><button type="button" onClick={() => moveStretch(stretch.id, 1)} disabled={index === draftStretches.length - 1} aria-label={`Move ${stretch.name} later`} className="workout-preview-settings-button" style={{ opacity: index === draftStretches.length - 1 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_down" size={17} /></button><button type="button" onClick={() => removeStretch(stretch.id)} aria-label={`Remove ${stretch.name}`} className="workout-preview-settings-button" style={{ color: "#d9534f" }}><MaterialIcon name="close" size={17} /></button></div></div><label style={{ display: "block", color: "var(--secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em" }}>HOLD TIME (SECONDS)<input type="number" min="1" step="5" value={plan.holdSeconds} onChange={(event) => updateStretch(stretch.id, Number(event.target.value))} className="workout-settings-input" style={{ marginTop: 5 }} /></label></article>)}</div></section><section style={{ marginTop: 24 }}><h3 style={{ color: "var(--primary)", fontSize: 15, margin: "0 0 10px" }}>Add stretches</h3><div className="flex items-center" style={{ gap: 8, padding: "0 11px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)" }}><MaterialIcon name="search" size={19} color="var(--secondary)" /><input value={stretchSearch} onChange={(event) => setStretchSearch(event.target.value)} placeholder="Search stretches or muscle groups" style={{ width: "100%", minWidth: 0, padding: "11px 0", border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 14 }} /></div><div className="flex flex-col" style={{ gap: 7, marginTop: 9 }}>{addableStretches.map((stretch) => <button key={stretch.id} type="button" onClick={() => addStretch(stretch)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 11px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}><span><strong style={{ display: "block", fontSize: 13 }}>{stretch.name}</strong><small style={{ color: "var(--secondary)", fontSize: 11 }}>{stretch.primaryMuscleGroups.join(" · ")}</small></span><MaterialIcon name="add" size={19} color="#2e9a5b" /></button>)}</div>{stretchSearch && addableStretches.length === 0 && <p style={{ margin: "10px 0 0", color: "var(--secondary)", fontSize: 13 }}>No unselected stretches match that search.</p>}</section><div className="flex" style={{ gap: 10, marginTop: 24 }}><button type="button" onClick={() => setDeleteConfirmOpen(true)} style={{ border: "1px solid #d9534f66", borderRadius: 12, padding: "12px 13px", background: "#d9534f14", color: "#d9534f", fontWeight: 800, cursor: "pointer" }}>Delete</button><button type="button" onClick={() => void saveEditor()} disabled={!draft.name.trim() || !draft.stretches.length || !draft.scheduledDays.length || saving} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "var(--primary)", color: "var(--background)", fontWeight: 850, cursor: saving ? "not-allowed" : "pointer", opacity: !draft.name.trim() || !draft.stretches.length || !draft.scheduledDays.length || saving ? 0.55 : 1 }}>{saving ? "Saving…" : "Save changes"}</button></div></div></div>}
    {deleteConfirmOpen && <div onMouseDown={() => !deleting && setDeleteConfirmOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 75, display: "grid", placeItems: "center", padding: 22, background: "rgba(0, 0, 0, 0.67)" }}><div role="alertdialog" aria-modal="true" aria-label="Delete stretching routine" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(380px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.4)" }}><h2 style={{ color: "#d9534f", fontSize: 20, margin: "0 0 8px" }}>Delete stretching routine?</h2><p style={{ color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>This removes the saved routine. Your completed stretching history stays saved.</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => void deleteRoutine()} disabled={deleting} style={{ flex: 1, border: "none", borderRadius: 12, padding: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.65 : 1 }}>{deleting ? "Deleting…" : "Delete routine"}</button></div></div></div>}
  </div>;
}
