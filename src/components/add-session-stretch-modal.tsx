"use client";

import { useRef, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import catalogue from "@/data/stretching-catalogue.json";
import type { StretchDefinition } from "@/lib/types";
import styles from "./workout-flow.module.css";

export default function AddSessionStretchModal({ existingIds, onClose, onAdd }: {
  existingIds: string[]; onClose: () => void; onAdd: (stretch: StretchDefinition, seconds: number) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StretchDefinition | null>(null);
  const [seconds, setSeconds] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const matches = (catalogue as StretchDefinition[]).filter((stretch) => !existingIds.includes(stretch.id) && `${stretch.name} ${stretch.primaryMuscleGroups.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function add() {
    if (!selected || pending.current) return;
    if (!Number.isSafeInteger(Number(seconds)) || Number(seconds) <= 0) { setError("Enter a hold time greater than zero."); return; }
    pending.current = true; setBusy(true); setError("");
    try { await onAdd(selected, Number(seconds)); onClose(); }
    catch { setError("Couldn’t add this stretch. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <WorkoutFlowDialog title={selected?.name ?? "Add a stretch"} description={selected ? selected.summary : "Choose a stretch to add to this session."} busy={busy} onClose={onClose}
    footer={selected && <button type="button" className={styles.primary} disabled={busy} onClick={() => void add()}>{busy ? "Adding…" : "Add to session"}</button>}>
    {selected ? <>
      <button type="button" className={styles.back} disabled={busy} onClick={() => { setSelected(null); setError(""); }}><MaterialIcon name="chevron_left" size={18} />Back to stretches</button>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>{selected.instructions}</p>
      <label style={{ display: "block", fontSize: 13, fontWeight: 750 }}>Hold time (seconds)<input type="number" min={1} step={1} inputMode="numeric" value={seconds} onChange={(event) => setSeconds(event.target.value)} style={{ width: "100%", padding: 12, marginTop: 8, borderRadius: 12, border: "1px solid var(--border)", background: "var(--background)", color: "var(--primary)", fontSize: 16 }} /></label>
    </> : <>
      <label className={styles.search}><MaterialIcon name="search" size={20} /><input placeholder="Search stretches" aria-label="Search stretches" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.list}>{matches.map((stretch) => <button key={stretch.id} type="button" className={styles.option} onClick={() => { setSelected(stretch); setSeconds("30"); }}><span><strong>{stretch.name}</strong><small>{stretch.primaryMuscleGroups.join(" · ")}</small></span><MaterialIcon name="add" size={21} /></button>)}</div>
      {!matches.length && <p className={styles.empty}>No more stretches match that search.</p>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </WorkoutFlowDialog>;
}
