"use client";

import { useState, useEffect } from "react";
import { Prompt, PromptPlatform, PromptLabel } from "@/lib/types";
import { generatePromptId } from "@/lib/prompts-service";

interface PromptEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: Prompt) => void;
  onDelete?: (promptId: string) => void;
  prompt: Prompt | null;
  platforms: PromptPlatform[];
  labels: PromptLabel[];
  userId: string;
  initialLabelId?: string;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px",
  fontSize: 16,
  color: "var(--primary)",
};

export default function PromptEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  prompt,
  platforms,
  labels,
  userId,
  initialLabelId,
}: PromptEditModalProps) {
  const isEditMode = !!prompt;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [selectedPlatformId, setSelectedPlatformId] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (prompt) {
        setTitle(prompt.title);
        setDescription(prompt.description);
        setPromptText(prompt.promptText);
        setSelectedPlatformId(prompt.platformId);
        setSelectedLabelIds(prompt.labelIds);
      } else {
        setTitle("");
        setDescription("");
        setPromptText("");
        setSelectedPlatformId(platforms.length > 0 ? platforms[0].id : "");
        setSelectedLabelIds(initialLabelId ? [initialLabelId] : []);
      }
    }
  }, [isOpen, prompt, platforms, initialLabelId]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim() || !promptText.trim() || !selectedPlatformId) return;

    const promptToSave: Prompt = {
      id: isEditMode ? prompt.id : generatePromptId(),
      title: title.trim(),
      description: description.trim(),
      promptText: promptText.trim(),
      labelIds: selectedLabelIds,
      platformId: selectedPlatformId,
      createdAt: isEditMode ? prompt.createdAt : Date.now(),
      updatedAt: Date.now(),
      userId,
    };

    onSave(promptToSave);
    onClose();
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (isEditMode && onDelete) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    if (isEditMode && onDelete && prompt) {
      onDelete(prompt.id);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
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
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90%",
          maxWidth: 600, // Wider for prompt text
          maxHeight: "90vh", // Prevent overflowing screen
          overflowY: "auto", // Allow scrolling within modal
          backgroundColor: "var(--background)",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* Delete Confirmation Overlay inside modal */}
        {showDeleteConfirm && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(2px)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 24,
            padding: 20
          }}>
            <div style={{
              backgroundColor: "var(--background)",
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 320,
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
            }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 18, color: "var(--primary)" }}>Delete Prompt?</h3>
              <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "var(--secondary)", lineHeight: 1.5 }}>
                Are you sure you want to delete this prompt? This action cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={cancelDelete}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface)",
                    color: "var(--primary)",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 12,
                    border: "none",
                    backgroundColor: "var(--destructive, #EF4444)",
                    color: "white",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "var(--primary)",
            }}
          >
            {isEditMode ? "Edit Prompt" : "New Prompt"}
          </h2>
          {isEditMode && onDelete && (
            <button
              onClick={handleDelete}
              style={{
                background: "none",
                border: "none",
                color: "var(--destructive, #EF4444)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: 12,
              }}
              className="hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>

        {/* Labels Selection (Top) */}
        {labels.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Labels</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {labels.map((label) => {
                const isSelected = selectedLabelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => toggleLabel(label.id)}
                    style={{
                      backgroundColor: isSelected ? "var(--primary)" : "var(--surface)",
                      color: isSelected ? "var(--background)" : "var(--primary)",
                      border: "1px solid",
                      borderColor: isSelected ? "var(--primary)" : "var(--border)",
                      borderRadius: 16, // Pill shape
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Form Fields container (scrollable logic usually handled by outer div maxHeight, but just in case) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Generate React Component"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Platform</label>
              {platforms.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--destructive, #EF4444)", margin: 0, marginTop: 4 }}>
                   Please create a platform first from the "Manage Platforms" menu.
                </p>
              ) : (
                <select
                  value={selectedPlatformId}
                  onChange={(e) => setSelectedPlatformId(e.target.value)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    cursor: "pointer",
                    backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>')`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 16px center",
                    backgroundSize: "16px",
                    paddingRight: 48,
                  }}
                >
                  <option value="" disabled>Select Platform</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label style={labelStyle}>Description (Optional)</label>
              <input
                type="text"
                placeholder="Briefly describe what this prompt does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Prompt Text</label>
              <textarea
                placeholder="Write your AI prompt here..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                style={{
                  ...inputStyle,
                  minHeight: 160,
                  resize: "vertical",
                  fontFamily: "monospace", // Distinct font for prompt text
                  fontSize: 14,
                }}
              />
            </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              backgroundColor: "var(--surface)",
              color: "var(--primary)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "16px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !promptText.trim() || !selectedPlatformId}
            style={{
              flex: 1,
              backgroundColor: "var(--primary)",
              color: "var(--background)",
              border: "none",
              borderRadius: 16,
              padding: "16px",
              fontSize: 16,
              fontWeight: 700,
              cursor: (title.trim() && promptText.trim() && selectedPlatformId) ? "pointer" : "not-allowed",
              opacity: (title.trim() && promptText.trim() && selectedPlatformId) ? 1 : 0.5,
              transition: "opacity 0.2s",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
