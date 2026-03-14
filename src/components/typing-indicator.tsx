"use client";

interface TypingIndicatorProps {
  visible: boolean;
}

const keyframesStyle = `
@keyframes typingPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;

export default function TypingIndicator({ visible }: TypingIndicatorProps) {
  if (!visible) return null;

  const containerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-start",
    width: "100%",
  };

  const bubbleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "10px 14px",
    backgroundColor: "var(--surface-variant)",
    borderRadius: "16px 16px 16px 4px",
  };

  const dotStyle = (delay: number): React.CSSProperties => ({
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "var(--secondary)",
    animation: "typingPulse 1.4s ease-in-out infinite",
    animationDelay: `${delay}s`,
  });

  return (
    <>
      <style>{keyframesStyle}</style>
      <div style={containerStyle}>
        <div style={bubbleStyle}>
          <span style={dotStyle(0)} />
          <span style={dotStyle(0.2)} />
          <span style={dotStyle(0.4)} />
        </div>
      </div>
    </>
  );
}
