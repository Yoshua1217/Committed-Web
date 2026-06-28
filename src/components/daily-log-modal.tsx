"use client";

import { useEffect, useState } from "react";
import { DailyLog } from "@/lib/types";
import { dailyLogId } from "@/lib/daily-log-service";

interface DailyLogModalProps {
  isOpen: boolean;
  dailyLog: DailyLog | null;
  userId: string;
  date: string;
  onSave: (dailyLog: DailyLog) => Promise<void>;
  onClose: () => void;
}

const questions = [
  { key: "grateful", label: "What am I grateful for today?", placeholder: "A moment, person, or thing I appreciated..." },
  { key: "learned", label: "What did I learn today?", placeholder: "Something I understand better now..." },
  { key: "struggled", label: "Where did I struggle today?", placeholder: "A challenge I ran into..." },
  { key: "improveTomorrow", label: "Where can I improve tomorrow?", placeholder: "One thing I can do differently..." },
] as const;

type AnswerKey = (typeof questions)[number]["key"];

export default function DailyLogModal({
  isOpen,
  dailyLog,
  userId,
  date,
  onSave,
  onClose,
}: DailyLogModalProps) {
  const [answers, setAnswers] = useState<Record<AnswerKey, string>>({
    grateful: "",
    learned: "",
    struggled: "",
    improveTomorrow: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAnswers({
      grateful: dailyLog?.grateful ?? "",
      learned: dailyLog?.learned ?? "",
      struggled: dailyLog?.struggled ?? "",
      improveTomorrow: dailyLog?.improveTomorrow ?? "",
    });
  }, [isOpen, dailyLog]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const persist = async (complete: boolean) => {
    if (saving) return;
    setSaving(true);
    const now = Date.now();
    const completed = complete || dailyLog?.completed === true;
    const savedLog: DailyLog = {
      id: dailyLog?.id ?? dailyLogId(userId, date),
      userId,
      date,
      ...answers,
      completed,
      createdAt: dailyLog?.createdAt || now,
      updatedAt: now,
      completedAt: completed ? (dailyLog?.completedAt ?? now) : null,
    };

    try {
      await onSave(savedLog);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(5, 12, 24, 0.68)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-log-title"
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 24,
          border: "1px solid rgba(59, 130, 246, 0.32)",
          background: "var(--surface)",
          boxShadow: "0 28px 90px rgba(0, 0, 0, 0.42)",
        }}
      >
        <div style={{ padding: "28px 28px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              aria-hidden="true"
              style={{
                display: "grid",
                placeItems: "center",
                width: 42,
                height: 42,
                borderRadius: 13,
                color: "#fff",
                background: "#2563EB",
                fontSize: 20,
              }}
            >
              &#9998;
            </div>
            <div>
              <h2 id="daily-log-title" style={{ margin: 0, fontSize: 21, fontWeight: 750, color: "var(--primary)" }}>
                Daily log
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--secondary)" }}>
                Take a minute to reflect on your day.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "24px 28px 28px" }}>
          {questions.map((question, index) => (
            <div key={question.key}>
              <label
                htmlFor={`daily-log-${question.key}`}
                style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 650, color: "var(--primary)" }}
              >
                <span style={{ color: "#3B82F6", marginRight: 7 }}>{index + 1}.</span>
                {question.label}
              </label>
              <textarea
                id={`daily-log-${question.key}`}
                value={answers[question.key]}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                placeholder={question.placeholder}
                rows={2}
                autoFocus={index === 0}
                style={{
                  width: "100%",
                  minHeight: 76,
                  resize: "vertical",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "var(--surface-variant)",
                  padding: "12px 14px",
                  color: "var(--primary)",
                  font: "inherit",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              />
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={() => persist(false)}
              disabled={saving}
              style={{
                flex: 1,
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "13px 18px",
                background: "var(--surface-variant)",
                color: "var(--primary)",
                fontSize: 14,
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.65 : 1,
              }}
            >
              Exit
            </button>
            <button
              type="button"
              onClick={() => persist(true)}
              disabled={saving}
              style={{
                flex: 1.4,
                border: "none",
                borderRadius: 14,
                padding: "13px 18px",
                background: "#2563EB",
                color: "#fff",
                fontSize: 14,
                fontWeight: 750,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.65 : 1,
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.25)",
              }}
            >
              Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
