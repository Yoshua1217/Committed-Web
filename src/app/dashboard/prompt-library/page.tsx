"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { PromptPlatform, PromptLabel, Prompt } from "@/lib/types";
import { subscribeToPlatforms } from "@/lib/prompt-platforms-service";
import { subscribeToPromptLabels, savePromptLabel, deletePromptLabel, updatePromptLabelOrder } from "@/lib/prompt-labels-service";
import { subscribeToPrompts, savePrompt, deletePrompt } from "@/lib/prompts-service";

import PlatformManagerModal from "@/components/platform-manager-modal";
import PromptLabelEditModal from "@/components/prompt-label-edit-modal";
import PromptEditModal from "@/components/prompt-edit-modal";
import PromptCard from "@/components/prompt-card";
import PromptEngineerChat from "@/components/prompt-engineer-chat";
import MaterialIcon from "@/components/material-icon";

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

export default function PromptLibraryPage() {
  const { user } = useAuth();

  const [platforms, setPlatforms] = useState<PromptPlatform[]>([]);
  const [labels, setLabels] = useState<PromptLabel[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  const [platformModalOpen, setPlatformModalOpen] = useState(false);

  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<PromptLabel | null>(null);

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [initialLabelId, setInitialLabelId] = useState<string | undefined>(undefined);

  const [draggedLabelId, setDraggedLabelId] = useState<string | null>(null);
  const [dragOverLabelId, setDragOverLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(subscribeToPlatforms(user.uid, (p) => setPlatforms(p)));
    unsubs.push(subscribeToPromptLabels(user.uid, (l) => setLabels(l)));
    unsubs.push(subscribeToPrompts(user.uid, (p) => {
      setPrompts(p);
      setLoading(false);
    }));

    return () => unsubs.forEach((u) => u());
  }, [user]);

  const handleSaveLabel = async (label: PromptLabel) => {
    try {
      await savePromptLabel(label);
    } catch (err) {
      console.error("Failed to save prompt label:", err);
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    try {
      await deletePromptLabel(labelId);
    } catch (err) {
      console.error("Failed to delete prompt label:", err);
    }
  };

  const handleSavePrompt = async (prompt: Prompt) => {
    try {
      await savePrompt(prompt);
    } catch (err) {
      console.error("Failed to save prompt:", err);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    try {
      await deletePrompt(promptId);
    } catch (err) {
      console.error("Failed to delete prompt:", err);
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
         await updatePromptLabelOrder(updates.map(l => ({ id: l.id, sortOrder: l.sortOrder ?? 0 })));
      } catch (err) {
         console.error("Failed to reorder prompt labels:", err);
      }
    }
    setDraggedLabelId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 1080 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", marginBottom: 24, marginTop: 0 }}>Prompt Library</h1>
        <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>Loading...</p>
      </div>
    );
  }

  // Find prompts that do not belong to ANY label
  const unlabelledPrompts = prompts.filter((p) => p.labelIds.length === 0);

  return (
    <div className="prompt-library-shell" style={{ display: "flex", height: "calc(100vh - 0px)" }}>
      {/* Main Content Area */}
      <div style={{ flex: 1, padding: 32, overflowY: "auto" }}>
        {/* Header */}
        <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>Prompt Library</h1>
          <div className="flex gap-2">
           <button
            onClick={() => { setPlatformModalOpen(true); }}
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--secondary)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              borderRadius: 14,
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 16,
              paddingRight: 16,
              fontSize: 14,
              fontWeight: 700,
            }}
            className="hover:bg-[var(--surface-variant)] transition-colors"
          >
            Manage Platforms
          </button>
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
            onClick={() => { setEditingPrompt(null); setInitialLabelId(undefined); setPromptModalOpen(true); }}
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
            + New Prompt
          </button>
        </div>
      </div>

      {/* Empty state */}
      {labels.length === 0 && prompts.length === 0 && (
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
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--primary)", margin: 0, marginBottom: 4 }}>No prompts yet</p>
          <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>Create a platform, a label, and a prompt to get started.</p>
        </div>
      )}

      {/* Label Rows */}
      {labels.map((label) => {
        // Find prompts that belong to this label
        const sectionPrompts = prompts.filter((p) => p.labelIds.includes(label.id));
        const labelColor = "var(--primary)"; // Prompt labels don't have distinct colors tied to buckets

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
                  backgroundColor: "var(--surface-variant)", 
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
                <MaterialIcon name="folder_open" size={18} />
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
              <div style={{ flex: 1, height: 2, backgroundColor: "var(--border)", borderRadius: 2 }} />
            </div>

            {/* Prompt Cards Grid */}
            <div className="responsive-card-grid" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", // Slightly wider for prompts
              gap: 16,
            }}>
              {/* Add Prompt Button shaped like PromptCard */}
              <div
                onClick={() => {
                  setEditingPrompt(null);
                  setInitialLabelId(label.id);
                  setPromptModalOpen(true);
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
                  minHeight: 140,
                  opacity: 0.6,
                }}
                className="hover:opacity-100 hover:border-gray-400"
              >
                 <MaterialIcon name="add" size={32} color="var(--secondary)" />
                 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--secondary)" }}>New Prompt</span>
              </div>
              
              {sectionPrompts.map((prompt) => {
                const platform = platforms.find(p => p.id === prompt.platformId) ?? null;
                return (
                  <div key={prompt.id} style={{ position: "relative", height: "100%" }}>
                     <PromptCard
                        prompt={prompt}
                        platform={platform}
                        onClick={() => { setEditingPrompt(prompt); setPromptModalOpen(true); }}
                     />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Unlabelled Prompts */}
      {unlabelledPrompts.length > 0 && (
         <div style={{ marginBottom: 40 }}>
           <h2 style={sectionHeaderStyle}>
             Unlabelled Prompts
           </h2>
            <div className="responsive-card-grid" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}>
              {unlabelledPrompts.map((prompt) => {
                const platform = platforms.find(p => p.id === prompt.platformId) ?? null;
                return (
                  <div key={prompt.id} style={{ position: "relative", height: "100%" }}>
                     <PromptCard
                        prompt={prompt}
                        platform={platform}
                        onClick={() => { setEditingPrompt(prompt); setPromptModalOpen(true); }}
                     />
                  </div>
                );
              })}
            </div>
         </div>
      )}

      {/* Modals */}
      <PlatformManagerModal
        isOpen={platformModalOpen}
        onClose={() => setPlatformModalOpen(false)}
        platforms={platforms}
        userId={user?.uid ?? ""}
      />

      <PromptLabelEditModal
        isOpen={labelModalOpen}
        onClose={() => { setLabelModalOpen(false); setEditingLabel(null); }}
        onSave={handleSaveLabel}
        onDelete={handleDeleteLabel}
        label={editingLabel}
        userId={user?.uid ?? ""}
      />

        <PromptEditModal
          isOpen={promptModalOpen}
          onClose={() => { setPromptModalOpen(false); setEditingPrompt(null); setInitialLabelId(undefined); }}
          onSave={handleSavePrompt}
          onDelete={handleDeletePrompt}
          prompt={editingPrompt}
          platforms={platforms}
          labels={labels}
          userId={user?.uid ?? ""}
          initialLabelId={initialLabelId}
        />
      </div>

      {/* Side Panel: Prompt Engineer Chat */}
      <div style={{ width: 380, flexShrink: 0 }}>
        <PromptEngineerChat />
      </div>
    </div>
  );
}
