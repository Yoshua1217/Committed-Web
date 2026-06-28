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
        border: `1px solid ${completed ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.5)"}`,
        borderRadius: 16,
        background: completed
          ? "linear-gradient(135deg, rgba(37, 99, 235, 0.10), rgba(59, 130, 246, 0.05))"
          : "linear-gradient(135deg, #2563EB, #3B82F6)",
        color: completed ? "#3B82F6" : "#fff",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: completed ? "none" : "0 10px 26px rgba(37, 99, 235, 0.2)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
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
          background: completed ? "rgba(59, 130, 246, 0.13)" : "rgba(255, 255, 255, 0.17)",
          fontSize: 18,
        }}
      >
        {completed ? "✓" : "✎"}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 750 }}>Daily log</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 11, opacity: 0.78 }}>
          {completed ? "Completed · Click to edit" : hasAnswers ? "In progress · Continue reflecting" : "Reflect on your day"}
        </span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1, opacity: 0.75 }}>&rsaquo;</span>
    </button>
  );
}
