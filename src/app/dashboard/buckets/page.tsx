"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Bucket } from "@/lib/types";
import { subscribeToBuckets, saveBucket, deleteBucket } from "@/lib/buckets-service";
import BucketEditModal from "@/components/bucket-edit-modal";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

export default function BucketsPage() {
  const { user } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Real-time Firestore listener
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubscribe = subscribeToBuckets(user.uid, (data) => {
      setBuckets(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const handleSave = async (bucket: Bucket) => {
    try {
      await saveBucket(bucket);
    } catch (err) {
      console.error("Failed to save bucket:", err);
    }
  };

  const handleDelete = async (bucketId: string) => {
    setDeleteConfirm(null);
    try {
      await deleteBucket(bucketId);
    } catch (err) {
      console.error("Failed to delete bucket:", err);
    }
  };

  const openCreate = () => {
    setEditingBucket(null);
    setModalOpen(true);
  };

  const openEdit = (bucket: Bucket) => {
    setEditingBucket(bucket);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--primary)",
            marginBottom: 24,
          }}
        >
          Buckets
        </h1>
        <div
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "48px 28px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--secondary)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--primary)",
          }}
        >
          Buckets
        </h1>
        <button
          onClick={openCreate}
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--background)",
            borderRadius: 14,
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
          }}
        >
          + New Bucket
        </button>
      </div>

      {/* Empty State */}
      {buckets.length === 0 && (
        <div
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "48px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--secondary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: "0 auto", display: "block" }}
            >
              <path d="M2 7h20l-2 13H4L2 7z" />
              <path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
            </svg>
          </div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--primary)",
              marginBottom: 6,
            }}
          >
            No buckets yet
          </p>
          <p style={{ fontSize: 14, color: "var(--secondary)" }}>
            Create your first life category to organize your habits.
          </p>
        </div>
      )}

      {/* Bucket Grid */}
      {buckets.length > 0 && (
        <div
          className="responsive-card-grid"
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {buckets.map((bucket) => {
            const hex = argbToHex(bucket.color);
            const isDeleting = deleteConfirm === bucket.id;

            return (
              <div
                key={bucket.id}
                onClick={() => openEdit(bucket)}
                style={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  padding: 20,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                <div className="flex items-center" style={{ gap: 14 }}>
                  {/* Icon circle (same style as habit cards) */}
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      backgroundColor: hex + "20",
                    }}
                  >
                    <MaterialIcon
                      name={bucket.iconName}
                      size={26}
                      color={hex}
                    />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--primary)",
                        marginBottom: 2,
                      }}
                    >
                      {bucket.name}
                    </p>
                    <p
                      className="truncate"
                      style={{ fontSize: 13, color: "var(--secondary)" }}
                    >
                      Tap to edit
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDeleting) {
                        handleDelete(bucket.id);
                      } else {
                        setDeleteConfirm(bucket.id);
                        setTimeout(() => setDeleteConfirm(null), 3000);
                      }
                    }}
                    className="shrink-0"
                    style={{
                      padding: 8,
                      borderRadius: 12,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: isDeleting ? "var(--primary)" : "var(--secondary)",
                      backgroundColor: isDeleting ? "var(--error)" : "transparent",
                      transition: "background-color 0.15s, color 0.15s",
                    }}
                  >
                    {isDeleting ? "Confirm" : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Create Modal */}
      <BucketEditModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingBucket(null);
        }}
        onSave={handleSave}
        onDelete={(id) => handleDelete(id)}
        bucket={editingBucket}
        userId={user?.uid ?? ""}
        nextSortOrder={buckets.length}
      />
    </div>
  );
}

function isLightColor(argb: number): boolean {
  const r = (argb >> 16) & 0xff;
  const g = (argb >> 8) & 0xff;
  const b = argb & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.7;
}
