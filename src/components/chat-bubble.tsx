"use client";

import MarkdownRenderer from "@/components/markdown-renderer";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  modelLabel?: string;
}

export default function ChatBubble({ role, content, modelLabel }: ChatBubbleProps) {
  const isUser = role === "user";

  const containerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: isUser ? "flex-end" : "flex-start",
    width: "100%",
  };

  const bubbleStyle: React.CSSProperties = {
    maxWidth: "85%",
    padding: "12px 18px",
    fontSize: "14px",
    lineHeight: 1.6,
    backgroundColor: isUser ? "var(--primary)" : "var(--surface)",
    color: isUser ? "var(--background)" : "var(--primary)",
    borderRadius: isUser
      ? "20px 20px 4px 20px"
      : "20px 20px 20px 4px",
    border: isUser ? "none" : "1px solid var(--border)",
  };

  return (
    <div style={containerStyle}>
      <div>
        <div style={bubbleStyle}>
          {isUser ? content : <MarkdownRenderer content={content} />}
        </div>
        {!isUser && modelLabel && (
          <p style={{
            fontSize: 11,
            color: "var(--secondary)",
            margin: "4px 0 0 8px",
            opacity: 0.6,
          }}>
            {modelLabel}
          </p>
        )}
      </div>
    </div>
  );
}
