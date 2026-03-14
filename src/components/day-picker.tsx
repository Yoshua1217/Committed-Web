"use client";

import { useState } from "react";

interface Days {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

interface DayPickerProps {
  days: Days;
  onChange: (days: Days) => void;
}

const DAY_KEYS: (keyof Days)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const WEEKDAYS: (keyof Days)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

const WEEKENDS: (keyof Days)[] = ["saturday", "sunday"];

function allTrue(): Days {
  return {
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: true,
  };
}

function allFalse(): Days {
  return {
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: false,
  };
}

export default function DayPicker({ days, onChange }: DayPickerProps) {
  function toggleDay(key: keyof Days) {
    onChange({ ...days, [key]: !days[key] });
  }

  function setEveryDay() {
    onChange(allTrue());
  }

  function setWeekdays() {
    const next = allFalse();
    for (const k of WEEKDAYS) next[k] = true;
    onChange(next);
  }

  function setWeekends() {
    const next = allFalse();
    for (const k of WEEKENDS) next[k] = true;
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {DAY_KEYS.map((key, i) => {
          const active = days[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleDay(key)}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: active ? "none" : "1px solid var(--border)",
                background: active ? "var(--primary)" : "var(--surface)",
                color: active ? "var(--background)" : "var(--secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {DAY_LABELS[i]}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {([
          ["Every Day", setEveryDay],
          ["Weekdays", setWeekdays],
          ["Weekends", setWeekends],
        ] as [string, () => void][]).map(([label, handler]) => (
          <button
            key={label}
            type="button"
            onClick={handler}
            style={{
              background: "var(--surface-variant)",
              color: "var(--secondary)",
              border: "none",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
