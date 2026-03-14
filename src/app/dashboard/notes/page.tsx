"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Bucket, Label, Note } from "@/lib/types";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToLabels, saveLabel, deleteLabel, updateLabelOrder } from "@/lib/labels-service";
import { subscribeToNotes, saveNote, deleteNote } from "@/lib/notes-service";
import LabelEditModal from "@/components/label-edit-modal";
import NoteEditModal from "@/components/note-edit-modal";
import NoteCard from "@/components/note-card";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--secondary)",
  margin: 0,
  marginBottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export default function NotesPage() {
  const { user } = useAuth();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [initialLabelId, setInitialLabelId] = useState<string | undefined>(undefined);

  const [draggedLabelId, setDraggedLabelId] = useState<string | null>(null);
  const [dragOverLabelId, setDragOverLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribeToBuckets(user.uid, (b) => setBuckets(b)));
    unsubs.push(subscribeToLabels(user.uid, (l) => setLabels(l)));
    unsubs.push(subscribeToNotes(user.uid, (n) => {
      setNotes(n);
      setLoading(false);
    }));

    return () => unsubs.forEach((u) => u());
  }, [user]);

  const handleSaveLabel = async (label: Label) => {
    try {
      await saveLabel(label);
    } catch (err) {
      console.error("Failed to save label:", err);
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    try {
      await deleteLabel(labelId);
    } catch (err) {
      console.error("Failed to delete label:", err);
    }
  };

  const handleSaveNote = async (note: Note) => {
    try {
      await saveNote(note);
    } catch (err) {
      console.error("Failed to save note:", err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  const handleDragStart = (e: React.DragEvent, labelId: string) => {
    setDraggedLabelId(labelId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, labelId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverLabelId !== labelId) {
      setDragOverLabelId(labelId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverLabelId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetLabelId: string) => {
    e.preventDefault();
    setDragOverLabelId(null);
    
    if (!draggedLabelId || draggedLabelId === targetLabelId) return;

    const oldIndex = labels.findIndex(l => l.id === draggedLabelId);
    const newIndex = labels.findIndex(l => l.id === targetLabelId);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...labels];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      
      const updates = newOrder.map((l, index) => ({
        ...l,
        sortOrder: index,
      }));
      setLabels(updates); // Optimistic update
      
      try {
         await updateLabelOrder(updates.map(l => ({ id: l.id, sortOrder: l.sortOrder ?? 0 })));
      } catch (err) {
         console.error("Failed to reorder labels:", err);
      }
    }
    setDraggedLabelId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1080 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", marginBottom: 24, marginTop: 0 }}>Notes</h1>
        <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>Loading...</p>
      </div>
    );
  }

  // Find notes that do not belong to ANY label
  const unlabelledNotes = notes.filter((n) => n.labelIds.length === 0);

  return (
    <div style={{ padding: 32, maxWidth: 1080 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Notes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingLabel(null); setLabelModalOpen(true); }}
            style={{
              backgroundColor: "var(--surface-variant)",
              color: "var(--secondary)",
              border: "none",
              cursor: "pointer",
              borderRadius: 14,
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 16,
              paddingRight: 16,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Create Label
          </button>
          <button
            onClick={() => { setEditingNote(null); setInitialLabelId(undefined); setNoteModalOpen(true); }}
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--background)",
              border: "none",
              cursor: "pointer",
              borderRadius: 14,
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 20,
              paddingRight: 20,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Empty state */}
      {labels.length === 0 && notes.length === 0 && (
        <div
          className="text-center"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            paddingTop: 48,
            paddingBottom: 48,
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)", margin: 0, marginBottom: 4 }}>No notes yet</p>
          <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Create a label and a note to get started.</p>
        </div>
      )}

      {/* Label Rows */}
      {labels.map((label) => {
        // Find notes that belong to this label
        const sectionNotes = notes.filter((n) => n.labelIds.includes(label.id));

        const bucket = buckets.find(b => b.id === label.bucketId);
        const labelColor = bucket ? argbToHex(bucket.color) : "var(--primary)";
        const iconName = bucket ? bucket.iconName : "label";

        return (
          <div key={label.id} style={{ marginBottom: 40 }}>
            {/* The Label header acts as a row title */}
            <div 
              className="flex items-center group" 
              style={{ 
                marginBottom: 20, 
                width: "100%",
                paddingTop: 8,
                paddingBottom: 8,
                borderTop: dragOverLabelId === label.id ? `2px dashed ${labelColor}` : "2px dashed transparent",
                transition: "border 0.2s ease"
              }}
              draggable
              onDragStart={(e) => handleDragStart(e, label.id)}
              onDragOver={(e) => handleDragOver(e, label.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, label.id)}
            >
              <div 
                onClick={(e) => {
                   e.stopPropagation();
                   setEditingLabel(label); 
                   setLabelModalOpen(true);
                }}
                style={{ 
                  width: 32, 
                  height: 32, 
                  borderRadius: 10, 
                  backgroundColor: labelColor + "15", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: labelColor,
                  marginRight: 12,
                  flexShrink: 0,
                  cursor: "pointer",
                }}
                title="Edit Label"
              >
                <MaterialIcon name={iconName} size={18} />
              </div>
              <h2 style={{ 
                fontSize: 17, 
                fontWeight: 700, 
                color: "var(--primary)", 
                margin: 0, 
                letterSpacing: "-0.01em",
                marginRight: 16,
                flexShrink: 0
              }}>
                {label.name}
              </h2>
              
              {/* Full width stretching line */}
              <div style={{ flex: 1, height: 2, backgroundColor: labelColor, opacity: 0.3, borderRadius: 2 }} />
            </div>

            {/* Note Cards Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}>
              {/* Add Note Button shaped like NoteCard */}
              <div
                onClick={() => {
                  setEditingNote(null);
                  setInitialLabelId(label.id);
                  setNoteModalOpen(true);
                }}
                style={{
                  backgroundColor: "var(--surface)",
                  border: "2px dashed var(--border)",
                  borderRadius: 16,
                  padding: "16px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 0.2s ease",
                  height: "100%",
                  minHeight: 120,
                  opacity: 0.6,
                }}
                className="hover:opacity-100 hover:border-gray-400"
              >
                 <MaterialIcon name="add" size={32} color="var(--secondary)" />
                 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--secondary)" }}>New Note</span>
              </div>
              
              {sectionNotes.map((note) => {
                const bucket = buckets.find(b => b.id === note.bucketId) ?? null;
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    bucket={bucket}
                    onClick={() => { setEditingNote(note); setNoteModalOpen(true); }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Unlabelled Notes */}
      {unlabelledNotes.length > 0 && (
         <div style={{ marginBottom: 40 }}>
           <h2 style={sectionHeaderStyle}>
             Unlabelled Notes
           </h2>
           <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}>
              {unlabelledNotes.map((note) => {
                const bucket = buckets.find(b => b.id === note.bucketId) ?? null;
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    bucket={bucket}
                    onClick={() => { setEditingNote(note); setNoteModalOpen(true); }}
                  />
                );
              })}
            </div>
         </div>
      )}

      {/* Modals */}
      <LabelEditModal
        isOpen={labelModalOpen}
        onClose={() => { setLabelModalOpen(false); setEditingLabel(null); }}
        onSave={handleSaveLabel}
        onDelete={handleDeleteLabel}
        label={editingLabel}
        buckets={buckets}
        userId={user?.uid ?? ""}
      />

      <NoteEditModal
        isOpen={noteModalOpen}
        onClose={() => { setNoteModalOpen(false); setEditingNote(null); setInitialLabelId(undefined); }}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
        note={editingNote}
        buckets={buckets}
        labels={labels}
        userId={user?.uid ?? ""}
        initialLabelId={initialLabelId}
      />
    </div>
  );
}
