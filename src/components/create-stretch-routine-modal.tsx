"use client";

import { useMemo, useState } from "react";
import DayPicker from "@/components/day-picker";
import MaterialIcon from "@/components/material-icon";
import stretchCatalogueJson from "@/data/stretching-catalogue.json";
import { StretchDefinition, StretchRoutineDefinition, StretchRoutinePlan } from "@/lib/types";

const catalogue = stretchCatalogueJson as StretchDefinition[];
const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type Days = Record<(typeof dayKeys)[number], boolean>;
const blankDays: Days = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };

function HoldStepper({ value, onChange }: { value: string; onChange: (seconds: string) => void }) {
  const parsedValue = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 20;
  return <label style={{ flex: 1, color: "var(--secondary)", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em" }}>HOLD TIME<span className="flex" style={{ marginTop: 5, overflow: "hidden", border: "1px solid var(--border)", borderRadius: 10, background: "var(--background)" }}><input className="workout-stepper-input" type="number" min="1" step="5" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Seconds" style={{ width: "100%", minWidth: 0, padding: "9px 10px", border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 15, fontWeight: 750 }} /><span style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)" }}><button type="button" onClick={() => onChange(String(safeValue + 5))} aria-label="Increase hold time" style={{ width: 30, height: 19, display: "grid", placeItems: "center", padding: 0, border: "none", borderBottom: "1px solid var(--border)", background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" }}><MaterialIcon name="keyboard_arrow_up" size={16} /></button><button type="button" onClick={() => onChange(String(Math.max(1, safeValue - 5)))} disabled={safeValue <= 1} aria-label="Decrease hold time" style={{ width: 30, height: 19, display: "grid", placeItems: "center", padding: 0, border: "none", background: "var(--surface-variant)", color: "var(--primary)", cursor: safeValue <= 1 ? "not-allowed" : "pointer", opacity: safeValue <= 1 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_down" size={16} /></button></span></span></label>;
}

interface CreateStretchRoutineModalProps {
  isOpen: boolean;
  userId: string;
  nextSortOrder: number;
  onClose: () => void;
  onCreate: (routine: StretchRoutineDefinition) => Promise<void>;
}

export default function CreateStretchRoutineModal({ isOpen, userId, nextSortOrder, onClose, onCreate }: CreateStretchRoutineModalProps) {
  const [name, setName] = useState("New stretching routine");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<Days>(blankDays);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StretchRoutinePlan[]>([]);
  const [detailStretch, setDetailStretch] = useState<StretchDefinition | null>(null);
  const [holdSeconds, setHoldSeconds] = useState("20");
  const [holdTimeError, setHoldTimeError] = useState("");
  const [stretchPendingRemoval, setStretchPendingRemoval] = useState<StretchDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedDetails = useMemo(() => selected.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ plan, stretch: catalogue.find((item) => item.id === plan.stretchId) })).filter((entry): entry is { plan: StretchRoutinePlan; stretch: StretchDefinition } => Boolean(entry.stretch)), [selected]);
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    const selectedIds = new Set(selected.map((plan) => plan.stretchId));
    return catalogue.filter((stretch) => !selectedIds.has(stretch.id) && (!search || [stretch.name, stretch.summary, stretch.instructions, ...stretch.primaryMuscleGroups, ...stretch.secondaryMuscleGroups].join(" ").toLowerCase().includes(search)));
  }, [query, selected]);
  const isValid = name.trim().length > 0 && selected.length > 0 && dayKeys.some((day) => days[day]);

  if (!isOpen) return null;

  function openStretch(stretch: StretchDefinition) {
    const current = selected.find((plan) => plan.stretchId === stretch.id);
    setDetailStretch(stretch);
    setHoldSeconds(String(current?.holdSeconds ?? 20));
    setHoldTimeError("");
  }

  function saveStretch() {
    if (!detailStretch) return;
    const parsedHoldSeconds = Number.parseInt(holdSeconds, 10);
    if (!Number.isFinite(parsedHoldSeconds) || parsedHoldSeconds < 1) {
      setHoldTimeError("Enter a hold time before continuing.");
      return;
    }
    setSelected((current) => {
      const existing = current.find((plan) => plan.stretchId === detailStretch.id);
      if (existing) return current.map((plan) => plan.stretchId === detailStretch.id ? { ...plan, holdSeconds: parsedHoldSeconds } : plan);
      return [...current, { stretchId: detailStretch.id, holdSeconds: parsedHoldSeconds, sortOrder: current.length }];
    });
    setDetailStretch(null);
  }

  function dismissStretchDetails() {
    const parsedHoldSeconds = Number.parseInt(holdSeconds, 10);
    if (!Number.isFinite(parsedHoldSeconds) || parsedHoldSeconds < 1) {
      setHoldTimeError("Enter a hold time before closing.");
      return;
    }
    setDetailStretch(null);
  }

  function moveStretch(stretchId: string, direction: -1 | 1) {
    setSelected((current) => {
      const ordered = current.slice().sort((a, b) => a.sortOrder - b.sortOrder);
      const index = ordered.findIndex((plan) => plan.stretchId === stretchId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= ordered.length) return current;
      [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
      return ordered.map((plan, sortOrder) => ({ ...plan, sortOrder }));
    });
  }

  async function createRoutine() {
    if (!isValid || saving) return;
    setSaving(true); setError("");
    const now = Date.now();
    try {
      await onCreate({ id: crypto.randomUUID(), userId, name: name.trim(), description: description.trim(), scheduledDays: dayKeys.flatMap((day, index) => days[day] ? [index] : []) as StretchRoutineDefinition["scheduledDays"], stretches: selected.map((plan, sortOrder) => ({ ...plan, sortOrder })), sortOrder: nextSortOrder, createdAt: now, updatedAt: now });
      onClose();
    } catch (createError) { console.error("Failed to create stretch routine:", createError); setError("Couldn’t create this routine. Please try again."); } finally { setSaving(false); }
  }

  return <div role="dialog" aria-modal="true" aria-label="Create stretching routine" style={{ position: "fixed", inset: 0, zIndex: 60, overflowY: "auto", paddingBottom: "calc(164px + env(safe-area-inset-bottom))", background: "var(--background)" }}>
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}><button type="button" onClick={onClose} aria-label="Close create stretching routine" className="workout-preview-icon-button"><MaterialIcon name="close" size={22} /></button><span style={{ fontSize: 13, fontWeight: 750, color: "var(--secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Create stretching routine</span><span style={{ width: 42 }} /></div>
      <input aria-label="Stretching routine name" value={name} onChange={(event) => setName(event.target.value)} style={{ width: "100%", padding: 0, marginBottom: 12, border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 30, fontWeight: 850 }} />
      <textarea aria-label="Stretching routine description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="For example: wind down before bed" rows={2} style={{ width: "100%", padding: 0, marginBottom: 28, border: "none", outline: "none", resize: "vertical", background: "transparent", color: "var(--secondary)", fontSize: 15, lineHeight: 1.5 }} />
      <section style={{ marginBottom: 28 }}><h2 style={{ margin: "0 0 12px", color: "var(--primary)", fontSize: 13, fontWeight: 800 }}>Routine days</h2><p style={{ margin: "0 0 12px", color: "var(--secondary)", fontSize: 13 }}>Saved separately from workout progress.</p><DayPicker days={days} onChange={setDays} showClearButton /></section>
      {selectedDetails.length > 0 && <section style={{ marginBottom: 27 }}><div className="flex items-center justify-between" style={{ marginBottom: 10 }}><h2 style={{ margin: 0, color: "var(--primary)", fontSize: 13, fontWeight: 800 }}>Routine order</h2><span style={{ color: "#2e9a5b", fontSize: 12, fontWeight: 750 }}>{selectedDetails.length} stretch{selectedDetails.length === 1 ? "" : "es"}</span></div><div className="flex flex-col" style={{ gap: 9 }}>{selectedDetails.map(({ plan, stretch }, index) => <article key={stretch.id} style={{ padding: "13px 14px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)" }}><div className="flex items-center" style={{ gap: 11 }}><span style={{ width: 29, height: 29, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 9, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 12, fontWeight: 850 }}>{index + 1}</span><button type="button" onClick={() => openStretch(stretch)} style={{ minWidth: 0, flex: 1, padding: 0, border: "none", background: "transparent", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}><strong style={{ display: "block", fontSize: 15 }}>{stretch.name}</strong><small style={{ color: "var(--secondary)", fontSize: 12 }}>{plan.holdSeconds}s hold</small></button><div className="flex" style={{ gap: 3 }}><button type="button" disabled={index === 0} onClick={() => moveStretch(stretch.id, -1)} aria-label={`Move ${stretch.name} earlier`} className="workout-preview-settings-button" style={{ opacity: index === 0 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_up" size={17} /></button><button type="button" disabled={index === selectedDetails.length - 1} onClick={() => moveStretch(stretch.id, 1)} aria-label={`Move ${stretch.name} later`} className="workout-preview-settings-button" style={{ opacity: index === selectedDetails.length - 1 ? 0.35 : 1 }}><MaterialIcon name="keyboard_arrow_down" size={17} /></button><button type="button" onClick={() => setStretchPendingRemoval(stretch)} aria-label={`Remove ${stretch.name}`} className="workout-preview-settings-button" style={{ color: "#d9534f" }}><MaterialIcon name="close" size={17} /></button></div></div></article>)}</div></section>}
      <section><h2 style={{ margin: "0 0 10px", color: "var(--primary)", fontSize: 13, fontWeight: 800 }}>Add stretches</h2><div className="flex items-center" style={{ gap: 8, padding: "0 12px", marginBottom: 15, border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)" }}><MaterialIcon name="search" size={20} color="var(--secondary)" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stretches or muscle groups" style={{ width: "100%", minWidth: 0, padding: "13px 0", border: "none", outline: "none", background: "transparent", color: "var(--primary)", fontSize: 14 }} /></div><div className="flex flex-col" style={{ gap: 8 }}>{matches.map((stretch) => <button key={stretch.id} type="button" onClick={() => openStretch(stretch)} style={{ width: "100%", padding: "13px 14px", border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)", color: "var(--primary)", cursor: "pointer", textAlign: "left" }}><span className="flex items-center justify-between" style={{ gap: 12 }}><span><strong style={{ display: "block", fontSize: 15 }}>{stretch.name}</strong><small style={{ display: "block", marginTop: 4, color: "var(--secondary)", fontSize: 12 }}>{stretch.summary}</small></span><MaterialIcon name="add" size={21} color="#2e9a5b" /></span></button>)}</div>{matches.length === 0 && <p style={{ padding: "28px 0", margin: 0, color: "var(--secondary)", textAlign: "center" }}>No unselected stretches match that search.</p>}</section><div aria-hidden="true" style={{ height: 220 }} />
    </div>
    <div style={{ position: "fixed", right: 0, bottom: 0, left: 0, zIndex: 61, padding: "12px 24px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--background)" }}><div style={{ maxWidth: 672, margin: "0 auto" }}>{error && <p style={{ margin: "0 0 8px", color: "#d9534f", fontSize: 13, textAlign: "center" }}>{error}</p>}<button type="button" disabled={!isValid || saving} onClick={() => void createRoutine()} style={{ width: "100%", padding: 15, border: "none", borderRadius: 14, background: "var(--primary)", color: "var(--background)", fontSize: 15, fontWeight: 800, cursor: isValid && !saving ? "pointer" : "not-allowed", opacity: isValid && !saving ? 1 : 0.4 }}>{saving ? "Creating…" : selected.length ? `Create routine · ${selected.length} stretch${selected.length === 1 ? "" : "es"}` : "Add stretches to create routine"}</button></div></div>
    {detailStretch && <div onMouseDown={dismissStretchDetails} style={{ position: "fixed", inset: 0, zIndex: 70, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.56)" }}><div role="dialog" aria-modal="true" aria-label={detailStretch.name} onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(620px, 100%)", maxHeight: "calc(100dvh - 40px)", overflowY: "auto", padding: 24, border: "1px solid var(--border)", borderRadius: 22, background: "var(--surface)", boxShadow: "0 24px 72px rgba(0, 0, 0, 0.35)" }}><div className="flex items-start justify-between" style={{ gap: 16 }}><div><h2 style={{ margin: "0 0 8px", color: "var(--primary)", fontSize: 23, fontWeight: 850 }}>{detailStretch.name}</h2><p style={{ margin: 0, color: "var(--secondary)", fontSize: 13 }}>{[...detailStretch.primaryMuscleGroups, ...detailStretch.secondaryMuscleGroups].join(" · ")}</p></div><button type="button" onClick={dismissStretchDetails} aria-label="Close stretch details" style={{ padding: 2, border: "none", background: "transparent", color: "var(--secondary)", cursor: "pointer" }}><MaterialIcon name="close" size={23} /></button></div><p style={{ margin: "22px 0 12px", color: "var(--primary)", fontSize: 15, lineHeight: 1.5 }}>{detailStretch.summary}</p><p style={{ margin: "0 0 22px", color: "var(--secondary)", fontSize: 14, lineHeight: 1.6 }}>{detailStretch.instructions}</p><HoldStepper value={holdSeconds} onChange={(seconds) => { setHoldSeconds(seconds); setHoldTimeError(""); }} />{holdTimeError && <p role="alert" style={{ margin: "8px 0 0", color: "#d9534f", fontSize: 13, fontWeight: 650 }}>{holdTimeError}</p>}<div className="flex" style={{ gap: 10, marginTop: 22 }}><button type="button" onClick={dismissStretchDetails} style={{ flex: 1, padding: 13, border: "1px solid var(--border)", borderRadius: 12, background: "transparent", color: "var(--primary)", fontWeight: 750, cursor: "pointer" }}>Close</button><button type="button" onClick={saveStretch} style={{ flex: 1, padding: 13, border: "none", borderRadius: 12, background: "var(--primary)", color: "var(--background)", fontWeight: 800, cursor: "pointer" }}>{selected.some((plan) => plan.stretchId === detailStretch.id) ? "Update routine" : "Add to routine"}</button></div></div></div>}
    {stretchPendingRemoval && <div onMouseDown={() => setStretchPendingRemoval(null)} style={{ position: "fixed", inset: 0, zIndex: 72, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.67)" }}><div role="alertdialog" aria-modal="true" aria-label={`Remove ${stretchPendingRemoval.name}`} onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(380px, 100%)", padding: 21, border: "1px solid #d9534f88", borderRadius: 20, background: "var(--surface)", boxShadow: "0 22px 58px rgba(0, 0, 0, 0.4)" }}><h2 style={{ margin: "0 0 8px", color: "#d9534f", fontSize: 20 }}>Remove stretch?</h2><p style={{ margin: "0 0 20px", color: "var(--secondary)", fontSize: 14, lineHeight: 1.5 }}>Remove <strong style={{ color: "var(--primary)" }}>{stretchPendingRemoval.name}</strong> from this routine?</p><div className="flex" style={{ gap: 10 }}><button type="button" onClick={() => setStretchPendingRemoval(null)} style={{ flex: 1, padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "transparent", color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => { setSelected((current) => current.filter((item) => item.stretchId !== stretchPendingRemoval.id).map((item, sortOrder) => ({ ...item, sortOrder }))); setStretchPendingRemoval(null); }} style={{ flex: 1, padding: 12, border: "none", borderRadius: 12, background: "#d9534f", color: "white", fontWeight: 850, cursor: "pointer" }}>Remove</button></div></div></div>}
  </div>;
}
