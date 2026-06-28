"use client";

interface DailyLogCardProps {
  completed: boolean;
  hasAnswers: boolean;
  onClick: () => void;
}

export default function DailyLogCard({ completed, hasAnswers, onClick }: DailyLogCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={completed ? "Edit completed daily log" : "Open daily log"}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "14px 15px",
        border: "1px solid rgba(59, 130, 246, 0.24)",
        borderRadius: 16,
        background: completed
          ? "rgba(37, 99, 235, 0.06)"
          : "rgba(37, 99, 235, 0.12)",
        color: "var(--primary)",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: "none",
        transition: "background-color 0.15s ease, border-color 0.15s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 11,
          background: "rgba(59, 130, 246, 0.14)",
          color: "#60A5FA",
          fontSize: 18,
        }}
      >
        {completed ? "✓" : "✎"}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 750 }}>Daily log</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--secondary)" }}>
          {completed ? "Completed · Click to edit" : hasAnswers ? "In progress · Continue reflecting" : "Reflect on your day"}
        </span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1, color: "#60A5FA", opacity: 0.8 }}>&rsaquo;</span>
    </button>
  );
}
