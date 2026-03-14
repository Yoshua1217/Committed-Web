"use client";

export type AgentPhase =
  | "routing"     // Manager is classifying
  | "specialist"  // Specialist is thinking
  | null;         // Not active

interface AgentThinkingProps {
  phase: AgentPhase;
  specialistLabel?: string;
  specialistDescription?: string;
}

const keyframes = `
@keyframes agentPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes agentSlide {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
`;

export default function AgentThinking({ phase, specialistLabel, specialistDescription }: AgentThinkingProps) {
  if (!phase) return null;

  return (
    <>
      <style>{keyframes}</style>
      <div style={{
        display: "flex",
        justifyContent: "flex-start",
        width: "100%",
        animation: "agentSlide 0.25s ease-out",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "14px 18px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px 16px 16px 4px",
          maxWidth: "85%",
        }}>
          {/* Phase 1: Routing */}
          <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
            <span
              className="material-symbols-rounded"
              style={{
                fontSize: 16,
                color: phase === "routing" ? "var(--primary)" : "#4CAF50",
                animation: phase === "routing" ? "agentPulse 1.2s ease-in-out infinite" : "none",
              }}
            >
              {phase === "routing" ? "psychology" : "check_circle"}
            </span>
            <span style={{
              color: phase === "routing" ? "var(--primary)" : "var(--secondary)",
              fontWeight: phase === "routing" ? 600 : 400,
            }}>
              {phase === "routing" ? "Analyzing your request..." : "Request classified"}
            </span>
          </div>

          {/* Phase 2: Specialist hired */}
          {phase === "specialist" && specialistLabel && (
            <div className="flex items-center gap-2" style={{ fontSize: 13, animation: "agentSlide 0.3s ease-out" }}>
              <span
                className="material-symbols-rounded"
                style={{
                  fontSize: 16,
                  color: "var(--primary)",
                  animation: "agentPulse 1.2s ease-in-out infinite",
                }}
              >
                smart_toy
              </span>
              <span style={{ color: "var(--primary)", fontWeight: 600 }}>
                {specialistLabel}
              </span>
              <span style={{ color: "var(--secondary)", fontWeight: 400 }}>
                is thinking...
              </span>
            </div>
          )}

          {/* Specialist description */}
          {phase === "specialist" && specialistDescription && (
            <span style={{
              fontSize: 11,
              color: "var(--secondary)",
              opacity: 0.7,
              marginLeft: 24,
              animation: "agentSlide 0.4s ease-out",
            }}>
              {specialistDescription}
            </span>
          )}

          {/* Animated dots */}
          <div className="flex items-center gap-1" style={{ marginLeft: 24 }}>
            {[0, 0.2, 0.4].map((delay, i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: "var(--secondary)",
                  animation: "agentPulse 1.4s ease-in-out infinite",
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
