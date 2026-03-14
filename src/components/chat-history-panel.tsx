"use client";

import { useState, useEffect } from "react";

interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: { role: string; content: string; timestamp: number }[];
}

interface ChatHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: StoredConversation[];
  onLoadConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  currentConversationId: string | null;
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return "1 month ago";
  return `${diffMonths} months ago`;
}

export default function ChatHistoryPanel({
  isOpen,
  onClose,
  conversations,
  onLoadConversation,
  onDeleteConversation,
  currentConversationId,
}: ChatHistoryPanelProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Prevent body scroll when open
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

  // Reset delete confirm when panel closes
  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirm(null);
    }
  }, [isOpen]);

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      onDeleteConversation(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: isOpen ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0)",
        transition: "background-color 0.3s ease",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(80%, 300px)",
          backgroundColor: "var(--background)",
          borderLeft: "1px solid var(--border)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          display: "flex",
          flexDirection: "column",
          zIndex: 51,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 16px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--primary)",
              margin: 0,
            }}
          >
            Chat History
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
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

        {/* New Chat Button */}
        <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              onLoadConversation("");
              onClose();
            }}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
              color: "var(--primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Conversation List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px 16px",
          }}
        >
          {conversations.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 16px",
                color: "var(--secondary)",
                fontSize: 13,
              }}
            >
              No conversations yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {conversations.map((conv) => {
                const isActive = conv.id === currentConversationId;
                const isDeleting = deleteConfirm === conv.id;

                return (
                  <div
                    key={conv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 12,
                      cursor: "pointer",
                      backgroundColor: isActive
                        ? "var(--surface-variant)"
                        : "transparent",
                      transition: "background-color 0.15s ease",
                    }}
                    onClick={() => {
                      onLoadConversation(conv.id);
                      onClose();
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "var(--surface)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "transparent";
                      }
                    }}
                  >
                    {/* Conversation info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--primary)",
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {conv.title}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--secondary)",
                          margin: "2px 0 0",
                        }}
                      >
                        {getRelativeTime(conv.updatedAt)}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(conv.id);
                      }}
                      style={{
                        flexShrink: 0,
                        padding: isDeleting ? "4px 8px" : 4,
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: isDeleting ? 600 : 400,
                        color: isDeleting ? "var(--primary)" : "var(--secondary)",
                        backgroundColor: isDeleting
                          ? "var(--error)"
                          : "transparent",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isDeleting ? (
                        "Delete"
                      ) : (
                        <svg
                          width="14"
                          height="14"
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
