"use client";

import { useRef, useState } from "react";
import WorkoutFlowDialog from "@/components/workout-flow-dialog";
import MaterialIcon from "@/components/material-icon";
import type { WorkoutSession } from "@/lib/types";
import styles from "./workout-flow.module.css";

export default function CompletedSessionActions({ session, onClose, onRepeat, onDeleteRequest, repeatLabel = "Repeat session" }: {
  session: WorkoutSession; onClose: () => void; onRepeat?: (session: WorkoutSession) => Promise<void>;
  onDeleteRequest?: () => void; repeatLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function repeat() {
    if (!onRepeat || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await onRepeat(session); onClose(); }
    catch { setError("Couldn’t start this session. Your history is unchanged. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <WorkoutFlowDialog title="Session options" description={session.workoutNameSnapshot} onClose={onClose} busy={busy}>
    <div className={styles.list}>
      {onRepeat && <button type="button" className={styles.option} disabled={busy} onClick={() => void repeat()}><MaterialIcon name="replay" size={22} /><span><strong>{busy ? "Starting…" : repeatLabel}</strong><small>{repeatLabel.startsWith("Resume") ? "Continue the session that’s already active." : session.sessionType === "workout" ? "Start fresh with blank sets and these values in Prev." : "Start a fresh session using this activity or routine."}</small></span></button>}
      {onDeleteRequest && <button type="button" className={styles.option} disabled={busy} onClick={onDeleteRequest} style={{ color: "#d9534f" }}><MaterialIcon name="delete" size={22} /><span><strong>Delete record</strong></span></button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </WorkoutFlowDialog>;
}
