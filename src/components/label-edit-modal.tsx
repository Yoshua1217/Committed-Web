"use client";

import { useState, useEffect } from "react";
import MaterialIcon from "@/components/material-icon";
import { Bucket, Label } from "@/lib/types";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

interface LabelEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (label: Label) => void;
  onDelete?: (labelId: string) => void;
  label?: Label | null;
  buckets: Bucket[];
  userId: string;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--secondary)",
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  backgroundColor: "var(--surface-variant)",
  color: "var(--primary)",
  border: "1px solid var(--border)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

export default function LabelEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  label,
  buckets,
  userId,
}: LabelEditModalProps) {
  const isEditMode = !!label;

  const [name, setName] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      if (label) {
        setName(label.name);
        setBucketId(label.bucketId);
      } else {
        setName("");
        setBucketId(buckets.length > 0 ? buckets[0].id : "");
      }
    }
  }, [isOpen, label, buckets]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedBucket = buckets.find((b) => b.id === bucketId);
  const accentColor = selectedBucket ? argbToHex(selectedBucket.color) : "var(--primary)";

  const handleSave = () => {
    if (!name.trim() || !bucketId) return;
    
    const saved: Label = {
      id: label?.id ?? crypto.randomUUID(),
      name: name.trim(),
      bucketId,
      createdAt: label?.createdAt ?? Date.now(),
      userId: label?.userId ?? userId,
    };
    onSave(saved);
    onClose();
  };

  const handleDelete = () => {
    if (label && onDelete) {
      onDelete(label.id);
      setConfirmingDelete(false);
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: 24,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--surface)",
          borderRadius: 24,
          width: "100%",
          maxWidth: 400,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "28px 28px 0 28px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
            {isEditMode ? "Edit Label" : "New Label"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              color: "var(--secondary)",
              background: "var(--surface-variant)",
              border: "none",
              cursor: "pointer",
              padding: 8,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.15s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px 28px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              placeholder="e.g. Ideas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Bucket selection */}
          <div>
            <label style={labelStyle}>Bucket</label>
            {buckets.length === 0 ? (
               <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>
                 No buckets connected. Create a bucket first.
               </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {buckets.map((b) => {
                  const bHex = argbToHex(b.color);
                  const isSelected = bucketId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBucketId(b.id)}
                      className="flex items-center gap-2"
                      style={{
                        padding: "8px 14px",
                        borderRadius: 12,
                        border: isSelected ? `2px solid ${bHex}` : "1px solid var(--border)",
                        backgroundColor: isSelected ? bHex + "15" : "var(--surface-variant)",
                        color: isSelected ? bHex : "var(--secondary)",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 500,
                        transition: "all 0.15s",
                      }}
                    >
                      <MaterialIcon name={b.iconName} size={18} color={isSelected ? bHex : "var(--secondary)"} />
                      {b.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || !bucketId}
              style={{
                width: "100%",
                padding: 16,
                borderRadius: 16,
                fontWeight: 700,
                fontSize: 14,
                backgroundColor: accentColor,
                color: "#FFF",
                border: "none",
                cursor: name.trim() && bucketId ? "pointer" : "default",
                opacity: name.trim() && bucketId ? 1 : 0.4,
                transition: "opacity 0.15s",
              }}
            >
              {isEditMode ? "Save Changes" : "Create Label"}
            </button>

            {isEditMode && onDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 16,
                  fontWeight: 600,
                  fontSize: 14,
                  backgroundColor: "transparent",
                  color: "var(--error)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                Delete Label
              </button>
            )}
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {confirmingDelete && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              borderRadius: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmingDelete(false); }}
          >
            <div
              style={{
                backgroundColor: "var(--surface)",
                borderRadius: 20,
                padding: 28,
                width: "85%",
                border: "1px solid var(--border)",
                boxShadow: "0 16px 48px rgba(0, 0, 0, 0.3)",
                textAlign: "center",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", margin: "0 0 8px" }}>
                Delete &ldquo;{label?.name}&rdquo;?
              </h3>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: "0 0 24px", lineHeight: 1.5 }}>
                This will permanently remove this label.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 14,
                    fontWeight: 600,
                    fontSize: 14,
                    backgroundColor: "var(--surface-variant)",
                    color: "var(--primary)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 14,
                    fontWeight: 600,
                    fontSize: 14,
                    backgroundColor: "var(--error)",
                    color: "#FFF",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
