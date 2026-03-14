"use client";

interface ProgressCardProps {
  totalScheduled: number;
  completedCount: number;
  completedNames: string[];
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function ProgressCard({
  totalScheduled,
  completedCount,
  completedNames,
}: ProgressCardProps) {
  const now = new Date();
  const dayName = dayNames[now.getDay()];
  const monthName = monthNames[now.getMonth()];
  const dateStr = `${dayName}, ${monthName} ${now.getDate()}`;

  if (totalScheduled === 0) {
    return (
      <div
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: 24,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>Today</span>
          <span style={{ fontSize: 13, color: "var(--secondary)" }}>{dateStr}</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, marginTop: 8 }}>
          No habits scheduled for today
        </p>
      </div>
    );
  }

  const pct = Math.round((completedCount / totalScheduled) * 100);
  const allDone = pct >= 100;

  return (
    <div
      style={{
        backgroundColor: allDone ? "#4CAF5010" : "var(--surface)",
        border: `1px solid ${allDone ? "#4CAF5040" : "var(--border)"}`,
        borderRadius: 20,
        padding: 24,
        transition: "background-color 0.3s ease, border-color 0.3s ease",
      }}
    >
      {/* Date header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>Today</span>
        <span style={{ fontSize: 13, color: "var(--secondary)" }}>{dateStr}</span>
      </div>

      {/* Percentage + count */}
      <div className="flex items-baseline gap-3">
        <span
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: allDone ? "#4CAF50" : "var(--primary)",
            lineHeight: 1,
          }}
        >
          {pct}%
        </span>
        <span style={{ fontSize: 13, color: "var(--secondary)" }}>
          {completedCount} of {totalScheduled} completed
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full overflow-hidden"
        style={{
          height: 8,
          borderRadius: 9999,
          backgroundColor: "var(--surface-variant)",
          marginTop: 16,
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 9999,
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: allDone ? "#4CAF50" : "var(--primary)",
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {/* Completed names */}
      {completedNames.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {completedNames.map((name) => (
            <span
              key={name}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#4CAF50",
                backgroundColor: "#4CAF5015",
                padding: "4px 10px",
                borderRadius: 8,
              }}
            >
              ✓ {name}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--secondary)", marginTop: 14, marginBottom: 0 }}>
          No habits completed yet
        </p>
      )}
    </div>
  );
}
