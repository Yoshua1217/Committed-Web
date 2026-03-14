"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { UserSettings } from "@/lib/types";
import { subscribeToSettings, saveSettings } from "@/lib/settings-service";

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    darkMode: false,
    preferredName: "",
    mainGoals: "",
    mainStruggles: "",
    customPrompt: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToSettings(user.uid, (s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, [user]);

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

  const update = (field: keyof UserSettings, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
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
    </div>
  );
}
