"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ToolCard {
  id: string;
  title: string;
  description: string; // Added description field
  icon: string;
  color: string;
  href: string; // Added href field
}

const tools: ToolCard[] = [
  {
    id: "ai-chat",
    title: "AI Chat Proxy",
    description: "Secure proxy to communicate with OpenRouter.",
    icon: "forum",
    color: "#EC4899",
    href: "/dashboard/ai-chat"
  },
  {
    id: "prompt-library",
    title: "Prompt Library",
    description: "Save and manage reusable AI prompts.",
    icon: "auto_awesome",
    color: "#8B5CF6",
    href: "/dashboard/prompt-library"
  },
  {
    id: "notes",
    title: "Notes",
    description: "Organize your thoughts and ideas.",
    icon: "edit_note",
    color: "#00BCD4",
    href: "/dashboard/notes"
  },
  {
    id: "breathing",
    title: "Breathing Exercises",
    description: "Calm your mind with guided breathing.",
    icon: "self_improvement",
    color: "#4CAF50",
    href: "/dashboard/breathing"
  },
  {
    id: "pomodoro",
    title: "Pomodoro Timer",
    description: "Boost productivity with focused work sessions.",
    icon: "timer",
    color: "#FF7043",
    href: "/dashboard/pomodoro"
  },
];

export default function ToolsPage() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div style={{ padding: "32px 28px", maxWidth: 960, width: "100%" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)", margin: "0 0 8px" }}>
        Tools
      </h1>
      <p style={{ fontSize: 14, color: "var(--secondary)", margin: "0 0 32px" }}>
        Productivity utilities to support your routine.
      </p>

      <div
        className="responsive-card-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 20,
        }}
      >
        {tools.map((tool) => {
          const isHovered = hoveredId === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => {
                if (tool.href) {
                  router.push(tool.href);
                }
              }}
              onMouseEnter={() => setHoveredId(tool.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 20,
                border: "1px solid var(--border)",
                backgroundColor: isHovered ? "var(--surface-variant)" : "var(--surface)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                padding: 20,
                transition: "all 0.15s ease",
                transform: isHovered ? "translateY(-2px)" : "none",
                boxShadow: isHovered ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: tool.color + "18",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: 28, color: tool.color }}
                >
                  {tool.icon}
                </span>
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--primary)",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                {tool.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
