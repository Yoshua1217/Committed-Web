"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Bucket, Habit, UserSettings } from "@/lib/types";
import { subscribeToSettings, saveSettings } from "@/lib/settings-service";
import { resetAccountData } from "@/lib/account-reset-service";
import { subscribeToHabits } from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { isHabitPausedOnDate } from "@/lib/streak-calculator";
import MaterialIcon from "@/components/material-icon";

const COMPLETION_TYPE_LABELS: Record<Habit["completionType"], string> = {
  checkbox: "Checkbox",
  counter: "Counter",
  timer: "Timer",
};

const COMPLETION_TYPE_ICONS: Record<Habit["completionType"], string> = {
  checkbox: "check_box",
  counter: "add_circle",
  timer: "timer",
};

function todayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function argbToHex(argb: number): string {
  return `#${(argb & 0x00ffffff).toString(16).padStart(6, "0")}`;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    darkMode: false,
    preferredName: "",
    mainGoals: "",
    mainStruggles: "",
    customPrompt: "",
    workoutHabitMappingEnabled: false,
    workoutHabitMappingHabitId: null,
    stretchHabitMappingEnabled: false,
    stretchHabitMappingHabitId: null,
  });
  const [habits, setHabits] = useState<Habit[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [habitPickerType, setHabitPickerType] = useState<"workout" | "stretch" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetStarted, setResetStarted] = useState(false);
  const [resetSecondsRemaining, setResetSecondsRemaining] = useState(5);
  const [resetProgress, setResetProgress] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToSettings(user.uid, (s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToHabits(user.uid, setHabits);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToBuckets(user.uid, setBuckets);
  }, [user]);

  const activeHabits = habits.filter((habit) => !isHabitPausedOnDate(habit, todayString()));
  const selectedHabit = habits.find((habit) => habit.id === settings.workoutHabitMappingHabitId) ?? null;
  const selectedStretchHabit = habits.find((habit) => habit.id === settings.stretchHabitMappingHabitId) ?? null;
  const pickerIsStretching = habitPickerType === "stretch";
  const pickerHabitId = pickerIsStretching ? settings.stretchHabitMappingHabitId : settings.workoutHabitMappingHabitId;
  const bucketById = new Map(buckets.map((bucket) => [bucket.id, bucket]));

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveSettings(user.uid, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [user, settings]);

  const update = (field: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  useEffect(() => {
    if (!resetStarted || resetSecondsRemaining === 0) return;

    const timer = window.setTimeout(() => {
      setResetSecondsRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetStarted, resetSecondsRemaining]);

  const beginReset = () => {
    setResetStarted(true);
    setResetSecondsRemaining(5);
    setResetProgress(0);
    setResetError(null);
    window.requestAnimationFrame(() => setResetProgress(100));
  };

  const cancelReset = () => {
    if (resetting) return;
    setResetStarted(false);
    setResetSecondsRemaining(5);
    setResetProgress(0);
    setResetError(null);
  };

  const handleReset = async () => {
    if (!user || resetSecondsRemaining > 0) return;
    setResetting(true);
    setResetError(null);
    try {
      await resetAccountData(user.uid);
      setSettings({ darkMode: false, preferredName: "", mainGoals: "", mainStruggles: "", customPrompt: "", workoutHabitMappingEnabled: false, workoutHabitMappingHabitId: null, stretchHabitMappingEnabled: false, stretchHabitMappingHabitId: null });
      setResetStarted(false);
      setResetSecondsRemaining(5);
      setResetProgress(0);
    } catch (error) {
      console.error("Failed to reset account data:", error);
      setResetError("Your data could not be fully reset. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  if (!loaded) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--secondary)", fontSize: 14 }}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--primary)",
          margin: 0,
          marginBottom: 28,
        }}
      >
        Settings
      </h1>

      {/* Dark Mode */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          padding: "20px 22px",
          marginBottom: 24,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 22, color: "var(--secondary)" }}
            >
              dark_mode
            </span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", margin: 0 }}>
                Dark Mode
              </p>
              <p style={{ fontSize: 12, color: "var(--secondary)", margin: 0, marginTop: 2 }}>
                Override system theme
              </p>
            </div>
          </div>
          <button
            onClick={() => update("darkMode", !settings.darkMode)}
            style={{
              width: 48,
              height: 28,
              borderRadius: 14,
              border: "none",
              cursor: "pointer",
              position: "relative",
              backgroundColor: settings.darkMode ? "#4CAF50" : "var(--surface-variant)",
              transition: "background-color 0.2s",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: "#fff",
                position: "absolute",
                top: 3,
                left: settings.darkMode ? 23 : 3,
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </button>
        </div>
      </div>

      {/* AI Personalization */}
      <div
        style={{
          background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
          padding: "20px 22px", marginBottom: 24,
        }}
      >
        <div className="flex items-center justify-between" style={{ gap: 16 }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-rounded" style={{ fontSize: 22, color: "#2e9a5b" }}>fitness_center</span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Workout habit mapping</p>
              <p style={{ fontSize: 12, color: "var(--secondary)", margin: "2px 0 0", lineHeight: 1.4 }}>Automatically complete one habit when you finish a workout or activity.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.workoutHabitMappingEnabled}
            aria-label="Enable workout habit mapping"
            onClick={() => update("workoutHabitMappingEnabled", !settings.workoutHabitMappingEnabled)}
            style={{ width: 48, height: 28, flexShrink: 0, borderRadius: 14, border: "none", cursor: "pointer", position: "relative", backgroundColor: settings.workoutHabitMappingEnabled ? "#4CAF50" : "var(--surface-variant)", transition: "background-color 0.2s" }}
          >
            <span style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: 3, left: settings.workoutHabitMappingEnabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
          </button>
        </div>
        {settings.workoutHabitMappingEnabled && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
            <p style={{ color: "var(--secondary)", fontSize: 12, margin: "0 0 10px" }}>Selected habit</p>
            <button type="button" onClick={() => setHabitPickerType("workout")} style={{ width: "100%", minHeight: 46, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 13px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)", color: "var(--primary)", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 650 }}>
              <span>{selectedHabit?.name ?? "Choose a habit"}</span>
              <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>chevron_right</span>
            </button>
            {!settings.workoutHabitMappingHabitId && <p style={{ color: "var(--secondary)", fontSize: 12, margin: "10px 0 0" }}>Choose the habit that should be checked off after training.</p>}
          </div>
        )}
      </div>

      <div
        style={{
          background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
          padding: "20px 22px", marginBottom: 24,
        }}
      >
        <div className="flex items-center justify-between" style={{ gap: 16 }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-rounded" style={{ fontSize: 22, color: "#2e9a5b" }}>self_improvement</span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Stretching habit mapping</p>
              <p style={{ fontSize: 12, color: "var(--secondary)", margin: "2px 0 0", lineHeight: 1.4 }}>Automatically complete one habit when you finish a stretching routine.</p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={settings.stretchHabitMappingEnabled} aria-label="Enable stretching habit mapping" onClick={() => update("stretchHabitMappingEnabled", !settings.stretchHabitMappingEnabled)} style={{ width: 48, height: 28, flexShrink: 0, borderRadius: 14, border: "none", cursor: "pointer", position: "relative", backgroundColor: settings.stretchHabitMappingEnabled ? "#4CAF50" : "var(--surface-variant)", transition: "background-color 0.2s" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: 3, left: settings.stretchHabitMappingEnabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
          </button>
        </div>
        {settings.stretchHabitMappingEnabled && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
            <p style={{ color: "var(--secondary)", fontSize: 12, margin: "0 0 10px" }}>Selected habit</p>
            <button type="button" onClick={() => setHabitPickerType("stretch")} style={{ width: "100%", minHeight: 46, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 13px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--background)", color: "var(--primary)", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 650 }}><span>{selectedStretchHabit?.name ?? "Choose a habit"}</span><span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>chevron_right</span></button>
            {!settings.stretchHabitMappingHabitId && <p style={{ color: "var(--secondary)", fontSize: 12, margin: "10px 0 0" }}>Choose the habit that should be checked off after stretching.</p>}
          </div>
        )}
      </div>

      {/* AI Personalization */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          padding: "22px 22px 26px",
          marginBottom: 24,
        }}
      >
        <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 22, color: "var(--secondary)" }}
          >
            smart_toy
          </span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
            AI Personalization
          </h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0, marginBottom: 22 }}>
          This information is included with every AI interaction
        </p>

        {/* Preferred Name */}
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", display: "block", marginBottom: 6 }}>
            Preferred Name
          </span>
          <input
            type="text"
            value={settings.preferredName}
            onChange={(e) => update("preferredName", e.target.value)}
            placeholder="What should the AI call you?"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--primary)",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </label>

        {/* Main Goals */}
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", display: "block", marginBottom: 6 }}>
            Main Goals
          </span>
          <textarea
            value={settings.mainGoals}
            onChange={(e) => update("mainGoals", e.target.value)}
            placeholder="What are you working towards?"
            rows={3}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--primary)",
              fontSize: 14,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </label>

        {/* Main Struggles */}
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", display: "block", marginBottom: 6 }}>
            Main Struggles
          </span>
          <textarea
            value={settings.mainStruggles}
            onChange={(e) => update("mainStruggles", e.target.value)}
            placeholder="What challenges do you face?"
            rows={3}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--primary)",
              fontSize: 14,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </label>

        {/* Custom System Prompt */}
        <label style={{ display: "block", marginBottom: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", display: "block", marginBottom: 6 }}>
            System Prompt
          </span>
          <textarea
            value={settings.customPrompt}
            onChange={(e) => update("customPrompt", e.target.value)}
            placeholder="Custom instructions for the AI assistant..."
            rows={4}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--primary)",
              fontSize: 14,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </label>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 14,
          border: "none",
          backgroundColor: saved ? "#4CAF50" : "var(--primary)",
          color: saved ? "#fff" : "var(--background)",
          fontSize: 15,
          fontWeight: 700,
          cursor: saving ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
          transition: "background-color 0.2s, opacity 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {saving ? (
          "Saving..."
        ) : saved ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved
          </>
        ) : (
          "Save Settings"
        )}
      </button>

      {/* Danger Zone */}
      <div
        style={{
          marginTop: 24,
          background: "var(--surface)",
          borderRadius: 16,
          border: "1px solid #dc2626",
          padding: "22px",
        }}
      >
        <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 22, color: "#dc2626" }}>
            warning
          </span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#dc2626", margin: 0 }}>
            Reset account
          </h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--secondary)", margin: "0 0 18px" }}>
          Permanently deletes all of your habits, completion history, buckets, goals, tasks, AI personalization, and chat histories. Your sign-in account stays active, but this cannot be undone.
        </p>

        {!resetStarted ? (
          <button
            onClick={beginReset}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid #dc2626",
              background: "transparent", color: "#dc2626", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Reset my account
          </button>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", margin: "0 0 12px" }}>
              {resetSecondsRemaining > 0
                ? `Please take a moment — reset unlocks in ${resetSecondsRemaining} second${resetSecondsRemaining === 1 ? "" : "s"}.`
                : "The reset button is now unlocked. This action is permanent."}
            </p>
            <button
              onClick={handleReset}
              disabled={resetSecondsRemaining > 0 || resetting}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: resetSecondsRemaining === 0 ? "#dc2626" : "rgba(220, 38, 38, 0.14)",
                color: resetSecondsRemaining === 0 ? "#fff" : "#dc2626", fontSize: 14, fontWeight: 700,
                cursor: resetSecondsRemaining > 0 || resetting ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", overflow: "hidden", isolation: "isolate",
              }}
            >
              {resetSecondsRemaining > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute", inset: "0 auto 0 0", width: `${resetProgress}%`,
                    background: "#fca5a5", transition: "width 5s linear", zIndex: 0,
                  }}
                />
              )}
              <span style={{ position: "relative", zIndex: 1 }}>
                {resetting ? "Resetting account..." : resetSecondsRemaining > 0 ? `Reset unlocks in ${resetSecondsRemaining}s` : "Permanently reset my account"}
              </span>
            </button>
            <button
              onClick={cancelReset}
              disabled={resetting}
              style={{ width: "100%", marginTop: 10, border: "none", background: "transparent", color: "var(--secondary)", fontSize: 13, cursor: resetting ? "default" : "pointer" }}
            >
              Cancel
            </button>
          </>
        )}
        {resetError && <p role="alert" style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0" }}>{resetError}</p>}
      </div>

      {/* Account Info */}
      <div
        style={{
          marginTop: 24,
          background: "var(--surface)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          padding: "18px 22px",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 22, color: "var(--secondary)" }}
          >
            account_circle
          </span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", margin: 0 }}>
              {user?.displayName || user?.email || "Account"}
            </p>
            {user?.displayName && user?.email && (
              <p style={{ fontSize: 12, color: "var(--secondary)", margin: 0, marginTop: 2 }}>
                {user.email}
              </p>
            )}
          </div>
        </div>
      </div>

      {habitPickerType && (
        <div
          role="presentation"
          onMouseDown={() => setHabitPickerType(null)}
          style={{ position: "fixed", inset: 0, zIndex: 70, display: "grid", placeItems: "center", padding: 20, background: "rgba(0, 0, 0, 0.55)" }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="workout-habit-picker-title" onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(440px, 100%)", maxHeight: "min(560px, calc(100vh - 40px))", overflow: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 20, boxShadow: "0 20px 64px rgba(0,0,0,0.35)" }}>
            <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 6 }}>
              <h2 id="workout-habit-picker-title" style={{ color: "var(--primary)", fontSize: 18, fontWeight: 750, margin: 0 }}>Choose a habit</h2>
              <button type="button" aria-label="Close habit picker" onClick={() => setHabitPickerType(null)} style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: "none", borderRadius: 10, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer" }}><span className="material-symbols-rounded">close</span></button>
            </div>
            <p style={{ color: "var(--secondary)", fontSize: 13, lineHeight: 1.45, margin: "0 0 16px" }}>{pickerIsStretching ? "Finishing any stretching routine will complete this habit for that day." : "Finishing any workout or activity will complete this habit for that day."}</p>
            {activeHabits.length ? (
              <div className="flex flex-col" style={{ gap: 6 }}>
                {activeHabits.map((habit) => {
                  const selected = habit.id === pickerHabitId;
                  const bucket = bucketById.get(habit.bucketId);
                  const bucketColor = bucket ? argbToHex(bucket.color) : "var(--secondary)";
                  return <button key={habit.id} type="button" onClick={() => { update(pickerIsStretching ? "stretchHabitMappingHabitId" : "workoutHabitMappingHabitId", habit.id); setHabitPickerType(null); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", border: selected ? "1px solid #4CAF50" : "1px solid var(--border)", borderRadius: 13, background: selected ? "#4CAF5018" : "var(--background)", color: "var(--primary)", textAlign: "left", cursor: "pointer" }}>
                    <span style={{ width: 36, height: 36, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 11, background: bucket ? `${bucketColor}20` : "var(--surface-variant)", color: bucketColor }}><MaterialIcon name={bucket?.iconName || habit.iconName || "Category"} size={20} color={bucketColor} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700 }}>{habit.name}</strong><small style={{ display: "block", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--secondary)", fontSize: 12, fontWeight: 600 }}>{bucket?.name ?? "No bucket"} · {COMPLETION_TYPE_LABELS[habit.completionType]}</small></span>
                    {selected ? <MaterialIcon name="check_circle" size={20} color="#2e9a5b" /> : <MaterialIcon name={COMPLETION_TYPE_ICONS[habit.completionType]} size={19} color="var(--secondary)" />}
                  </button>;
                })}
              </div>
            ) : <p style={{ color: "var(--secondary)", fontSize: 13, margin: 0 }}>{habits.length ? "All of your habits are paused. Resume one to use it for workout mapping." : "Create a habit first, then return here to map it."}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
