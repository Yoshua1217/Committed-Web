"use client";

import { useEffect } from "react";

interface CongratsPopupProps {
  habitName: string | null;
  onDismiss: () => void;
}

export default function CongratsPopup({ habitName, onDismiss }: CongratsPopupProps) {
  useEffect(() => {
    if (!habitName) return;
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
  }, [habitName, onDismiss]);

  if (!habitName) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 88,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        backgroundColor: "var(--primary)",
        color: "var(--background)",
        padding: "10px 20px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      Locked in. {habitName} — Stay committed.
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}
