"use client";

import { useState, useEffect } from "react";
import ColorPicker from "@/components/color-picker";
import IconPicker from "@/components/icon-picker";
import { Bucket } from "@/lib/types";

interface BucketEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bucket: Bucket) => void;
  onDelete?: (bucketId: string) => void;
  bucket?: Bucket | null;
  userId: string;
  nextSortOrder: number;
}

const DEFAULT_COLOR = 0xff64b5f6;
const DEFAULT_ICON = "FitnessCenter";

export default function BucketEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  bucket,
  userId,
  nextSortOrder,
}: BucketEditModalProps) {
  const isEditMode = !!bucket;

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [iconName, setIconName] = useState(DEFAULT_ICON);

  // Reset form when modal opens/closes or bucket changes
  useEffect(() => {
    if (isOpen) {
      if (bucket) {
        setName(bucket.name);
        setColor(bucket.color);
        setIconName(bucket.iconName);
      } else {
        setName("");
        setColor(DEFAULT_COLOR);
        setIconName(DEFAULT_ICON);
      }
    }
  }, [isOpen, bucket]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;

    const saved: Bucket = {
      id: bucket?.id ?? crypto.randomUUID(),
      name: name.trim(),
      iconName,
      color,
      sortOrder: bucket?.sortOrder ?? nextSortOrder,
      createdAt: bucket?.createdAt ?? Date.now(),
      userId: bucket?.userId ?? userId,
    };

    onSave(saved);
    onClose();
  };

  const handleDelete = () => {
    if (bucket && onDelete) {
      onDelete(bucket.id);
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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
    backgroundColor: "var(--background)",
    color: "var(--primary)",
    border: "1px solid var(--border)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--surface)",
          borderRadius: 20,
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
          border: "1px solid var(--border)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "28px 28px 20px 28px" }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--primary)",
            }}
          >
            {isEditMode ? "Edit Bucket" : "New Bucket"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              color: "var(--secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--surface-variant)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "0 28px 28px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Name Input */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              placeholder="Bucket name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Color Picker */}
          <div>
            <label style={labelStyle}>Color</label>
            <ColorPicker selectedColor={color} onSelectColor={setColor} />
          </div>

          {/* Icon Picker */}
          <div>
            <label style={labelStyle}>Icon</label>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              <IconPicker selectedIcon={iconName} onSelectIcon={setIconName} />
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              paddingTop: 4,
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 14,
                backgroundColor: "var(--primary)",
                color: "var(--background)",
                border: "none",
                cursor: name.trim() ? "pointer" : "default",
                opacity: name.trim() ? 1 : 0.4,
                transition: "opacity 0.15s",
              }}
            >
              {isEditMode ? "Save Changes" : "Create Bucket"}
            </button>

            {isEditMode && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 14,
                  fontWeight: 700,
                  fontSize: 14,
                  backgroundColor: "transparent",
                  color: "var(--error)",
                  border: "1px solid var(--error)",
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
              >
                Delete Bucket
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
