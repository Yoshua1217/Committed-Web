"use client";

import { useEffect, useId, useRef, useState } from "react";
import MaterialIcon from "@/components/material-icon";
import type { WorkoutDefinition } from "@/lib/types";
import styles from "./workout-routine-select.module.css";

export default function WorkoutRoutineSelect({ workouts, value, onChange, todayIds = [] }: {
  workouts: WorkoutDefinition[]; value: string; onChange: (id: string) => void; todayIds?: string[];
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLLIElement | null)[]>([]);
  const typeahead = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const selected = workouts.find((workout) => workout.id === value);

  useEffect(() => {
    if (!open) return;
    options.current[focused]?.focus();
  }, [open, focused]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function show() {
    setFocused(Math.max(0, workouts.findIndex((workout) => workout.id === value)));
    typeahead.current = { text: "", at: 0 };
    setOpen(true);
  }
  function choose(index: number) {
    onChange(workouts[index].id);
    setOpen(false);
    trigger.current?.focus();
  }

  return <div ref={root} className={styles.root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <span id={`${id}-label`} className={styles.label}>Choose your workout</span>
    <div className={styles.control}>
      <button ref={trigger} type="button" className={styles.trigger} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => open ? setOpen(false) : show()} onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
        }}>
        <MaterialIcon name="fitness_center" size={18} /><span id={`${id}-value`} className={styles.name}>{selected?.name ?? "Choose a workout"}</span><span className={`${styles.chevron} ${open ? styles.expanded : ""}`}><MaterialIcon name="expand_more" size={20} /></span>
      </button>
      {open && <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className={styles.menu} onKeyDown={(event) => {
        const next = event.key === "ArrowDown" ? (focused + 1) % workouts.length : event.key === "ArrowUp" ? (focused + workouts.length - 1) % workouts.length : event.key === "Home" ? 0 : event.key === "End" ? workouts.length - 1 : null;
        if (next !== null) { event.preventDefault(); setFocused(next); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(focused); }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = event.timeStamp;
          const text = (now - typeahead.current.at < 700 ? typeahead.current.text : "") + event.key.toLowerCase();
          typeahead.current = { text, at: now };
          const match = workouts.findIndex((workout) => workout.name.toLowerCase().startsWith(text));
          if (match >= 0) setFocused(match);
        }
      }}>
        {workouts.map((workout, index) => <li key={workout.id} ref={(element) => { options.current[index] = element; }} role="option" aria-selected={workout.id === value} tabIndex={focused === index ? 0 : -1} className={styles.option} onFocus={() => setFocused(index)} onClick={() => choose(index)}>
          <span className={styles.optionText}><span className={styles.optionName}>{workout.name}</span><span className={styles.meta}>{todayIds.includes(workout.id) ? "Scheduled today · " : ""}{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}</span></span>
          {workout.id === value && <MaterialIcon name="check" size={18} />}
        </li>)}
      </ul>}
    </div>
  </div>;
}
