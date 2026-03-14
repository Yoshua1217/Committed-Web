"use client";

import { useState, useEffect } from "react";
import { PromptPlatform } from "@/lib/types";
import { generatePlatformId, savePlatform, deletePlatform } from "@/lib/prompt-platforms-service";

interface PlatformManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: PromptPlatform[];
  userId: string;
}

const colors = [
  "#14B8A6", // Teal
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#EF4444", // Red
  "#F59E0B", // Amber
  "#10B981", // Emerald
];

export default function PlatformManagerModal({
  isOpen,
  onClose,
  platforms,
  userId,
}: PlatformManagerModalProps) {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState(colors[0]);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setSelectedColor(colors[0]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddPlatform = async () => {
    if (!name.trim()) return;

    try {
      await savePlatform({
        id: generatePlatformId(),
        name: name.trim(),
        color: selectedColor,
        createdAt: Date.now(),
        userId,
      });
      setName("");
    } catch (error) {
      console.error("Failed to add platform", error);
    }
  };

  const handleDeletePlatform = async (id: string) => {
    try {
      await deletePlatform(id);
    } catch (error) {
      console.error("Failed to delete platform", error);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        inset: 0,
        display: "flex", // Ensure flex layout
        alignItems: "center", // Vertically center within the fixed overlay
        justifyContent: "center", // Horizontally center within the overlay
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90%",
          maxWidth: 400,
          backgroundColor: "var(--background)",
          borderRadius: 24, // Matches habit-edit-modal
          padding: 32, // Consistent padding
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <h2
          style={{
            margin: 0,
            marginBottom: 24, // Consistent spacing
            fontSize: 24, // Match H1-ish style
            fontWeight: 700,
            color: "var(--primary)",
          }}
        >
          Manage Platforms
        </h2>

        {/* Existing Platforms List */}
        <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Current Platforms</h3>
            {platforms.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--secondary)", fontStyle: "italic" }}>No platforms currently added.</p>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto", paddingRight: 8 }}>
                    {platforms.map(p => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--surface)", padding: "12px 16px", borderRadius: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: p.color }} />
                                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)" }}>{p.name}</span>
                            </div>
                            <button
                                onClick={() => handleDeletePlatform(p.id)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--destructive, #EF4444)", // Assuming a destructive color variable, or fallback
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    borderRadius: 8,
                                    opacity: 0.8
                                }}
                                className="hover:bg-red-50 hover:opacity-100" // Tailwind utility for simplicity
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Add New Platform */}
        <div style={{ marginBottom: 24 }}>
           <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Add New</h3>
          <input
            autoFocus
            type="text"
            placeholder="Platform Name (e.g. ChatGPT)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12, // Match input radius
              padding: "16px",
              fontSize: 16,
              color: "var(--primary)",
              marginBottom: 16, // Consistent spacing
            }}
          />

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  width: 32, // Slightly larger color swatches for touch targets
                  height: 32,
                  borderRadius: "50%",
                  backgroundColor: color,
                  border: selectedColor === color ? "3px solid var(--primary)" : "none",
                  boxShadow: selectedColor === color ? `0 0 0 2px ${color}40` : "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  padding: 0,
                }}
              />
            ))}
          </div>

          <button
            onClick={handleAddPlatform}
            disabled={!name.trim()}
            style={{
              width: "100%",
              backgroundColor: "var(--primary)",
              color: "var(--background)",
              border: "none",
              borderRadius: 16, // Consistent button radius
              padding: "16px",
              fontSize: 16,
              fontWeight: 700,
              cursor: name.trim() ? "pointer" : "not-allowed",
              opacity: name.trim() ? 1 : 0.5,
              transition: "opacity 0.2s",
            }}
          >
            Add Platform
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              color: "var(--secondary)",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              padding: "8px 16px",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
