"use client";

import MaterialIcon from "@/components/material-icon";
import { WorkoutSession } from "@/lib/types";

interface WorkoutCompletionSummaryProps {
  session: WorkoutSession;
  onDone: () => void;
  onViewHistory: () => void;
}

function formatDuration(session: WorkoutSession): string {
  const total = session.durationSeconds ?? (session.completedAt ? Math.max(0, Math.floor((session.completedAt - session.startedAt) / 1000)) : 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function WorkoutCompletionSummary({ session, onDone, onViewHistory }: WorkoutCompletionSummaryProps) {
  const totalSets = session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const completedSets = session.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completed).length, 0);
  const completedExercises = session.exercises.filter((exercise) => exercise.sets.some((set) => set.completed)).length;

  return <div role="dialog" aria-modal="true" aria-label="Workout complete" style={{ position: "fixed", inset: 0, zIndex: 90, overflowY: "auto", background: "var(--background)" }}>
    <main style={{ width: "min(620px, 100%)", minHeight: "100%", margin: "0 auto", padding: "max(48px, calc(30px + var(--app-safe-top))) 24px calc(132px + var(--app-safe-bottom))", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ position: "relative", width: 64, height: 64, display: "grid", placeItems: "center", marginBottom: 18 }}>
        <span aria-hidden="true" style={{ position: "absolute", inset: 1, border: "1px solid #41e98760", borderRadius: "50%" }} />
        <span style={{ width: 52, height: 52, display: "grid", placeItems: "center", borderRadius: "50%", background: "#41e987", color: "#0a2a19", boxShadow: "0 8px 22px #41e98725" }}><MaterialIcon name="check" size={27} /></span>
      </div>
      <p style={{ color: "#2e9a5b", fontSize: 12, fontWeight: 850, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 9px" }}>Workout complete</p>
      <h1 style={{ maxWidth: 480, color: "var(--primary)", fontSize: 34, lineHeight: 1.08, margin: "0 0 11px" }}>{session.workoutNameSnapshot}</h1>
      <p style={{ maxWidth: 370, color: "var(--secondary)", fontSize: 14, lineHeight: 1.5, margin: 0 }}>You showed up and put the work in. Keep building.</p>

      <section aria-label="Workout summary" style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 9, marginTop: 31 }}>
        <div style={{ padding: "15px 8px", border: "1px solid var(--border)", borderRadius: 15, background: "var(--surface)" }}><MaterialIcon name="schedule" size={19} color="#2e9a5b" /><strong style={{ display: "block", color: "var(--primary)", fontSize: 18, fontWeight: 850, marginTop: 7 }}>{formatDuration(session)}</strong><span style={{ display: "block", color: "var(--secondary)", fontSize: 11, fontWeight: 700, marginTop: 3 }}>TIME</span></div>
        <div style={{ padding: "15px 8px", border: "1px solid var(--border)", borderRadius: 15, background: "var(--surface)" }}><MaterialIcon name="format_list_numbered" size={19} color="#2e9a5b" /><strong style={{ display: "block", color: "var(--primary)", fontSize: 18, fontWeight: 850, marginTop: 7 }}>{completedSets}/{totalSets}</strong><span style={{ display: "block", color: "var(--secondary)", fontSize: 11, fontWeight: 700, marginTop: 3 }}>SETS</span></div>
        <div style={{ padding: "15px 8px", border: "1px solid var(--border)", borderRadius: 15, background: "var(--surface)" }}><MaterialIcon name="fitness_center" size={19} color="#2e9a5b" /><strong style={{ display: "block", color: "var(--primary)", fontSize: 18, fontWeight: 850, marginTop: 7 }}>{completedExercises}</strong><span style={{ display: "block", color: "var(--secondary)", fontSize: 11, fontWeight: 700, marginTop: 3 }}>EXERCISES</span></div>
      </section>

      {session.personalRecords.length > 0 && <section style={{ width: "100%", marginTop: 15, padding: "15px 16px", border: "1px solid #f5c84c65", borderRadius: 16, background: "#f5c84c10", textAlign: "left" }}><div className="flex items-center" style={{ gap: 7, color: "#d69e13", marginBottom: 9 }}><span style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 9, background: "#f5c84c20" }}><MaterialIcon name="emoji_events" size={18} /></span><div><h2 style={{ fontSize: 15, margin: 0 }}>New personal record{session.personalRecords.length === 1 ? "" : "s"}</h2><p style={{ color: "var(--secondary)", fontSize: 12, margin: "2px 0 0" }}>You raised the bar today.</p></div></div><div className="flex flex-wrap" style={{ gap: 6 }}>{session.personalRecords.map((record) => <span key={record.exerciseId} style={{ padding: "6px 8px", borderRadius: 8, background: "var(--surface)", color: "var(--primary)", fontSize: 12, fontWeight: 750 }}>{record.exerciseNameSnapshot} · {record.reps} reps</span>)}</div></section>}

      <section style={{ width: "100%", marginTop: 24, textAlign: "left" }}>
        <h2 style={{ color: "var(--primary)", fontSize: 17, margin: "0 0 11px" }}>Logged exercises</h2>
        <div className="flex flex-col" style={{ gap: 10 }}>
          {session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder).filter((exercise) => exercise.sets.some((set) => set.completed)).map((exercise, exerciseIndex) => <article key={exercise.exerciseId} style={{ padding: 13, border: "1px solid var(--border)", borderRadius: 15, background: "var(--surface)" }}>
            <div className="flex items-center" style={{ gap: 9, marginBottom: 10 }}><span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: 8, background: "var(--surface-variant)", color: "var(--secondary)", fontSize: 11, fontWeight: 850 }}>{exerciseIndex + 1}</span><h3 style={{ color: "var(--primary)", fontSize: 15, margin: 0 }}>{exercise.exerciseNameSnapshot}</h3></div>
            <div className="completed-set-grid completed-set-heading"><span>Set</span><span>Weight</span><span>Reps</span><span>Status</span></div>
            {exercise.sets.map((set, setIndex) => { if (!set.completed) return null; const isRecord = session.personalRecords.some((record) => record.exerciseId === exercise.exerciseId && ((record.setIds?.includes(set.id) ?? false) || (!record.setIds && record.reps === set.reps))); return <div key={set.id} className="completed-set-grid completed-set-row" style={{ minHeight: 34, padding: "5px 7px", border: isRecord ? "1px solid #f5c84c" : undefined, background: isRecord ? "#f5c84c12" : undefined }}><span>{setIndex + 1}</span><span>{exercise.loadType === "bodyweight" ? "BW" : set.weightLbs ?? "—"}</span><span>{set.reps ?? "—"}</span><span style={{ color: isRecord ? "#d69e13" : "#2e9a5b", fontWeight: 850 }}>{isRecord ? <span className="flex items-center justify-center" style={{ gap: 3 }}><MaterialIcon name="emoji_events" size={14} />PR</span> : "Done"}</span></div>; })}
          </article>)}
        </div>
      </section>
    </main>
    <footer style={{ position: "fixed", right: 0, bottom: 0, left: 0, zIndex: 1, padding: "12px 24px calc(12px + var(--app-safe-bottom))", borderTop: "1px solid var(--border)", background: "var(--background)" }}><div className="flex" style={{ maxWidth: 572, gap: 10, margin: "0 auto" }}><button type="button" onClick={onViewHistory} style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 14, padding: 14, minHeight: 50, background: "var(--surface)", color: "var(--primary)", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>View history</button><button type="button" onClick={onDone} style={{ flex: 1.1, border: "none", borderRadius: 14, padding: 14, minHeight: 50, background: "var(--primary)", color: "var(--background)", fontSize: 14, fontWeight: 850, cursor: "pointer" }}>Done</button></div></footer>
  </div>;
}
