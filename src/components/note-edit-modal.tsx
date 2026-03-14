"use client";

import { useState, useEffect } from "react";
import MaterialIcon from "@/components/material-icon";
import { Bucket, Label, Note } from "@/lib/types";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

interface NoteEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Note) => void;
  onDelete?: (noteId: string) => void;
  note?: Note | null;
  buckets: Bucket[];
  labels: Label[];
  userId: string;
  initialLabelId?: string;
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

export default function NoteEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  note,
  buckets,
  labels,
  userId,
  initialLabelId,
}: NoteEditModalProps) {
  const isEditMode = !!note;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmingDelete(false);
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        setSelectedLabelIds(note.labelIds);
      } else {
        setTitle("");
        setContent("");
        setSelectedLabelIds(initialLabelId ? [initialLabelId] : []);
      }
    }
  }, [isOpen, note, initialLabelId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedLabel = labels.find(l => selectedLabelIds.includes(l.id));
  const derivedBucketId = selectedLabel?.bucketId || "";
  const selectedBucket = buckets.find((b) => b.id === derivedBucketId);
  const accentColor = selectedBucket ? argbToHex(selectedBucket.color) : "var(--primary)";

  // Show all labels
  const availableLabels = labels;

  const toggleLabel = (id: string) => {
    setSelectedLabelIds((prev) => 
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!title.trim()) return;
    
    // Fall back to a default bucket if there are no labels or buckets
    const finalBucketId = derivedBucketId || (buckets.length > 0 ? buckets[0].id : "");

    const saved: Note = {
      id: note?.id ?? crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      labelIds: selectedLabelIds,
      bucketId: finalBucketId,
      createdAt: note?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      userId: note?.userId ?? userId,
    };
    onSave(saved);
    onClose();
  };

  const handleDelete = () => {
    if (note && onDelete) {
      onDelete(note.id);
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
          maxWidth: 560,
          maxHeight: "90vh",
          overflow: "auto",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "28px 28px 0 28px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
            {isEditMode ? "Edit Note" : "New Note"}
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
          {/* Labels */}
          {availableLabels.length > 0 && (
             <div>
               <label style={labelStyle}>Labels</label>
               <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                 {availableLabels.map((lbl) => {
                   const isSelected = selectedLabelIds.includes(lbl.id);
                   const lblBucket = buckets.find(b => b.id === lbl.bucketId);
                   const lblColor = lblBucket ? argbToHex(lblBucket.color) : "var(--primary)";
                   
                   return (
                     <button
                       key={lbl.id}
                       type="button"
                       onClick={() => toggleLabel(lbl.id)}
                       style={{
                         padding: "6px 12px",
                         borderRadius: 10,
                         border: isSelected ? `1px solid ${lblColor}` : "1px solid var(--border)",
                         backgroundColor: isSelected ? lblColor + "15" : "var(--surface-variant)",
                         color: isSelected ? lblColor : "var(--secondary)",
                         cursor: "pointer",
                         fontSize: 12,
                         fontWeight: 500,
                         transition: "all 0.15s",
                       }}
                     >
                       {lbl.name}
                     </button>
                   );
                 })}
               </div>
             </div>
          )}

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              placeholder="e.g. Weekly Meeting Notes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minHeight: 200, display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Entry</label>
            <textarea
              placeholder="Write your note here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                ...inputStyle,
                flex: 1,
                resize: "vertical",
                minHeight: 180,
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!title.trim()}
              style={{
                width: "100%",
                padding: 16,
                borderRadius: 16,
                fontWeight: 700,
                fontSize: 14,
                backgroundColor: accentColor,
                color: "#FFF",
                border: "none",
                cursor: title.trim() ? "pointer" : "default",
                opacity: title.trim() ? 1 : 0.4,
                transition: "opacity 0.15s",
              }}
            >
              {isEditMode ? "Save Changes" : "Create Note"}
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
                Delete Note
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
                maxWidth: 400,
                border: "1px solid var(--border)",
                boxShadow: "0 16px 48px rgba(0, 0, 0, 0.3)",
                textAlign: "center",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", margin: "0 0 8px" }}>
                Delete &ldquo;{note?.title}&rdquo;?
              </h3>
              <p style={{ fontSize: 13, color: "var(--secondary)", margin: "0 0 24px", lineHeight: 1.5 }}>
                This will permanently remove this note.
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
