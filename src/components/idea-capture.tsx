"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createIdea } from "@/lib/ideas-service";

export function IdeaStarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

interface IdeaCaptureProps {
  userId: string;
  showToast?: boolean;
  autoFocus?: boolean;
}

export default function IdeaCapture({ userId, showToast = false, autoFocus = false }: IdeaCaptureProps) {
  const [text, setText] = useState("");
  const [starred, setStarred] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [error, setError] = useState("");
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ideaText = text.trim();
    if (!ideaText || saving) return;

    setSaving(true);
    setError("");
    try {
      await createIdea(userId, ideaText, starred);
      setText("");
      setStarred(false);
      if (showToast) {
        setToastVisible(true);
        if (toastTimeout.current) clearTimeout(toastTimeout.current);
        toastTimeout.current = setTimeout(() => setToastVisible(false), 2200);
      }
    } catch (saveError) {
      console.error("Failed to capture idea:", saveError);
      setError("Couldn’t save that idea. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="idea-capture-wrap">
      <form className="idea-capture" onSubmit={handleSubmit}>
        <button
          type="button"
          className={`idea-star-button${starred ? " is-starred" : ""}`}
          onClick={() => setStarred((current) => !current)}
          aria-label={starred ? "Capture without a star" : "Star this idea"}
          aria-pressed={starred}
        >
          <IdeaStarIcon filled={starred} />
        </button>
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Capture an idea…"
          aria-label="Idea"
          enterKeyHint="done"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={saving}
        />
        <button
          type="submit"
          className="idea-enter-button"
          disabled={!text.trim() || saving}
        >
          {saving ? "Saving…" : "Enter"}
        </button>
      </form>
      {error && <p className="idea-capture-error" role="alert">{error}</p>}
      {toastVisible && (
        <div className="idea-capture-toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          Idea saved
        </div>
      )}
    </div>
  );
}
