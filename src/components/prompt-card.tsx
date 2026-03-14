"use client";

import { useState } from "react";
import { Prompt, PromptPlatform } from "@/lib/types";
import MaterialIcon from "@/components/material-icon";

interface PromptCardProps {
  prompt: Prompt;
  platform: PromptPlatform | null;
  onClick: () => void;
}

export default function PromptCard({ prompt, platform, onClick }: PromptCardProps) {
  const [copied, setCopied] = useState(false);
  const accentColor = platform ? platform.color : "var(--primary)";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the edit modal
    navigator.clipboard.writeText(prompt.promptText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error("Could not copy text: ", err));
  };

  return (
    <div
      onClick={onClick}
      className="group relative"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "16px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "all 0.2s ease",
        height: "100%",
        minHeight: 140, 
      }}
    >
      <div className="flex justify-between items-start">
        <div style={{ flex: 1, paddingRight: 32 }}>
             {/* Platform Pill */}
             {platform && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  backgroundColor: accentColor + "15", // 15 = ~8% opacity hex approx for light background tint
                  color: accentColor,
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                {platform.name}
              </div>
            )}
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--primary)",
                lineHeight: 1.3,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {prompt.title}
            </h3>
        </div>
        
        {/* Copy Button placed top-right absolutely or floating */}
        <button
            onClick={handleCopy}
            className={`absolute top-4 right-4 rounded-xl px-3 py-1.5 flex items-center gap-1.5 transition-colors ${copied ? 'bg-green-100 text-[#10B981]' : 'bg-[var(--surface-variant)] text-[var(--secondary)] hover:bg-[var(--border)]'}`}
            style={{ border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            title="Copy Prompt"
        >
             <MaterialIcon name={copied ? "check" : "content_copy"} size={16} color="inherit" />
             <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--secondary)",
          lineHeight: 1.5,
          flex: 1, 
          display: "-webkit-box",
          WebkitLineClamp: 3, // Allow a bit more text for description
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "pre-wrap",
        }}
      >
        {prompt.description || <span style={{ fontStyle: "italic", opacity: 0.6 }}>No description...</span>}
      </p>

      {/* Date updated indicator at the bottom */}
      <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border)" }}>
         <span style={{ fontSize: 11, color: "var(--secondary)", opacity: 0.7, marginTop: 4 }}>
           {new Date(prompt.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
         </span>
      </div>
    </div>
  );
}
