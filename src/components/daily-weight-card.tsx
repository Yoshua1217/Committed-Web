"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TbScaleOutline } from "react-icons/tb";
import MaterialIcon from "@/components/material-icon";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import { completeWeightHabit, getDailyWeight, parseWeightLbs, saveDailyWeight, type DailyWeight } from "@/lib/weight-service";
import { saveWeightHabitMapping } from "@/lib/settings-service";
import { subscribeToHabits } from "@/lib/habits-service";
import { isHabitPausedOnDate } from "@/lib/streak-calculator";
import type { Habit } from "@/lib/types";
import styles from "./daily-weight-card.module.css";

export default function DailyWeightCard({ userId, today, onSavedChange }: { userId: string; today: string; onSavedChange?: (saved: boolean) => void }) {
  const id = useId();
  const lock = useRef(false);
  const [value, setValue] = useState("");
  const [entry, setEntry] = useState<DailyWeight | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [mapped, setMapped] = useState(false);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onSavedChange?.(false);
    getDailyWeight(userId, today).then((saved) => {
      if (cancelled) return;
      setEntry(saved); setValue(saved ? String(saved.weightLbs) : ""); setLoading(false); setLoadError(false); onSavedChange?.(saved !== null);
    }).catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [userId, today, retry, onSavedChange]);

  async function mapHabit() {
    setMappingError(""); setMapped(false);
    try {
      const result = await completeWeightHabit(userId, today);
      if (result === "choose") setPicker(true);
      else if (result === "completed") setMapped(true);
      else if (result === "unavailable") setMappingError("Weight saved. The linked habit couldn’t be completed. Change the linked habit in Settings or try again.");
    } catch { setMappingError("Weight saved, but the habit couldn’t be completed. Try again."); }
  }

  async function submit() {
    if (lock.current || loading || loadError) return;
    const weight = parseWeightLbs(value);
    if (weight === null) { setError("Enter a weight above 0 and up to 2,000 lbs, with up to two decimal places."); return; }
    lock.current = true; setBusy(true); setError(""); setMappingError("");
    try {
      const saved = await saveDailyWeight(userId, today, weight);
      setEntry(saved); setValue(String(saved.weightLbs)); onSavedChange?.(true);
      await mapHabit();
    } catch (failure) { setError(failure instanceof Error && failure.message.startsWith("A new day") ? failure.message : "Couldn’t save your weight. Your entry is still here—please try again."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section className={styles.card} aria-labelledby={`${id}-title`}>
    <div className={styles.header}><h2 id={`${id}-title`}><TbScaleOutline size={20} aria-hidden="true" className={styles.icon} />Daily weight</h2></div>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className={styles.inputWrap}><span className={styles.srOnly}>Today’s weight in pounds</span><input type="text" inputMode="decimal" autoComplete="off" placeholder="Enter your weight" value={value} disabled={loading || loadError || busy} onChange={(event) => { setValue(event.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} /><span aria-hidden="true">lbs</span></label>
      <button className={styles.enter} type="submit" disabled={loading || loadError || busy || !value.trim()}>{busy ? "Saving…" : "Enter"}</button>
    </form>
    {(loading || entry) && <div className={styles.footer}><span role="status" className={entry ? styles.saved : ""}>{loading ? "Loading today’s entry…" : entry ? `${entry.weightLbs} lbs saved today${mapped ? " · Habit completed" : ""}` : ""}</span></div>}
    {loadError && <p className={styles.error} role="alert">Couldn’t load today’s weight. <button type="button" className={styles.link} onClick={() => { setLoading(true); setRetry((current) => current + 1); }}>Try again</button></p>}
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
    {mappingError && <p className={styles.error} role="alert">{mappingError} <button type="button" className={styles.link} disabled={busy} onClick={async () => { setBusy(true); await mapHabit(); setBusy(false); }}>Retry habit</button></p>}
    {picker && <WeightHabitPicker userId={userId} today={today} onClose={() => setPicker(false)} onChoose={async (habitId) => {
      await saveWeightHabitMapping(userId, habitId);
      setPicker(false); setMapped(false); setMappingError("");
      if (entry && habitId) { setBusy(true); await mapHabit(); setBusy(false); }
    }} />}
  </section>;
}

function WeightHabitPicker({ userId, today, onClose, onChoose }: { userId: string; today: string; onClose: () => void; onChoose: (habitId: string | null) => Promise<void> }) {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => subscribeToHabits(userId, setHabits, { onError: () => setError("Couldn’t load your habits. Close and reopen to try again.") }), [userId]);
  async function choose(habitId: string | null) {
    if (busy) return;
    setBusy(true); setError("");
    try { await onChoose(habitId); }
    catch { setError("Couldn’t save the habit link. Please try again."); setBusy(false); }
  }
  const available = habits?.filter((habit) => !isHabitPausedOnDate(habit, today));
  return <WorkoutFlowDialog title="Complete a habit too" description="Choose once. Saving your daily weight will check off this habit automatically. You can change this in Settings." busy={busy} onClose={onClose}>
    <div className={styles.habits}>{!habits && !error && <p role="status">Loading habits…</p>}{available?.map((habit) => <button className={styles.habit} key={habit.id} type="button" disabled={busy} onClick={() => void choose(habit.id)}><MaterialIcon name={habit.iconName || "check_circle"} size={20} /><span>{habit.name}</span><MaterialIcon name="chevron_right" size={18} /></button>)}{available?.length === 0 && <p>No active habits. Create or resume one in Habits to link it here.</p>}</div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button className={styles.link} type="button" disabled={busy} onClick={() => void choose(null)}>Don’t link a habit</button>
  </WorkoutFlowDialog>;
}
