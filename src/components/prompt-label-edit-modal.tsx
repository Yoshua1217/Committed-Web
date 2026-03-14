"use client";

import { useState, useEffect } from "react";
import { PromptLabel } from "@/lib/types";
import { generatePromptLabelId } from "@/lib/prompt-labels-service";

interface PromptLabelEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (label: PromptLabel) => void;
  onDelete?: (labelId: string) => void;
  label: PromptLabel | null;
  userId: string;
}

export default function PromptLabelEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  label,
  userId,
}: PromptLabelEditModalProps) {
  const isEditMode = !!label;

  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (label) {
        setName(label.name);
      } else {
        setName("");
      }
    }
  }, [isOpen, label]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;

    const labelToSave: PromptLabel = {
      id: isEditMode ? label.id : generatePromptLabelId(),
      name: name.trim(),
      sortOrder: isEditMode ? label.sortOrder : undefined,
      createdAt: isEditMode ? label.createdAt : Date.now(),
      userId,
    };

    onSave(labelToSave);
    onClose();
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (isEditMode && onDelete) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    if (isEditMode && onDelete && label) {
      onDelete(label.id);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
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
          borderRadius: 24, // Match habit cards
          padding: 32, // Consistent padding
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
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
              <h3 style={{ margin: "0 0 12px 0", fontSize: 18, color: "var(--primary)" }}>Delete Label?</h3>
              <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "var(--secondary)", lineHeight: 1.5 }}>
                Are you sure you want to delete this label? Prompts assigned to it will remain, but lose the label.
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
            {isEditMode ? "Edit Label" : "New Label"}
          </h2>
          {isEditMode && onDelete && (
            <button
              onClick={handleDelete}
              style={{
                background: "none",
                border: "none",
                color: "var(--destructive, #EF4444)", // Use a destructive red
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

        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Label Name
          </label>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Coding, Marketing, Writing"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12, // Match inputs
              padding: "16px",
              fontSize: 16,
              color: "var(--primary)",
            }}
          />
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
            disabled={!name.trim()}
            style={{
              flex: 1,
              backgroundColor: "var(--primary)",
              color: "var(--background)",
              border: "none",
              borderRadius: 16,
              padding: "16px",
              fontSize: 16,
              fontWeight: 700,
              cursor: name.trim() ? "pointer" : "not-allowed",
              opacity: name.trim() ? 1 : 0.5,
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
