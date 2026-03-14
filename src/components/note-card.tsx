"use client";

import { Note, Bucket } from "@/lib/types";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

interface NoteCardProps {
  note: Note;
  bucket: Bucket | null;
  onClick: () => void;
}

export default function NoteCard({ note, bucket, onClick }: NoteCardProps) {
  const accentColor = bucket ? argbToHex(bucket.color) : "var(--primary)";

  return (
    <div
      onClick={onClick}
      className="group"
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "16px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "all 0.2s ease",
        height: "100%",
        minHeight: 120, // To give it a nice square-ish shape like the habit cards 
      }}
    >
      <div className="flex justify-between items-start">
        <h3
          style={{
            margin: 0,
            fontSize: 15,
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
          {note.title}
        </h3>
        {bucket && (
          <div
            title={`Bucket: ${bucket.name}`}
            style={{
              padding: 4,
              borderRadius: "50%",
              backgroundColor: accentColor + "15",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcon name={bucket.iconName} size={14} color={accentColor} />
          </div>
        )}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--secondary)",
          lineHeight: 1.5,
          flex: 1, // pushes content to fill space
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "pre-wrap",
        }}
      >
        {note.content || <span style={{ fontStyle: "italic", opacity: 0.6 }}>No content...</span>}
      </p>

      {/* Date updated indicator at the bottom */}
      <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "flex-end" }}>
         <span style={{ fontSize: 11, color: "var(--secondary)", opacity: 0.7 }}>
           {new Date(note.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
         </span>
      </div>
    </div>
  );
}
