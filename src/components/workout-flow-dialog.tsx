"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import MaterialIcon from "@/components/material-icon";
import styles from "./workout-flow.module.css";

export default function WorkoutFlowDialog({ title, description, onClose, busy = false, children, footer }: {
  title: string; description: string; onClose: () => void; busy?: boolean; children: ReactNode; footer?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={styles.panel}>
      <header className={styles.header}>
        <div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label={`Close ${title.toLowerCase()}`} className="workout-preview-icon-button"><MaterialIcon name="close" size={22} /></button>
      </header>
      <div className={styles.content}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  </dialog>;
}
