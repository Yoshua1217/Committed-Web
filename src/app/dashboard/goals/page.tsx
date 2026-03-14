"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Bucket, Goal } from "@/lib/types";
import { subscribeToGoals, saveGoal, deleteGoal } from "@/lib/goals-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import GoalEditModal from "@/components/goal-edit-modal";
import MaterialIcon from "@/components/material-icon";

function argbToHex(argb: number): string {
  const rgb = argb & 0x00ffffff;
  return "#" + rgb.toString(16).padStart(6, "0").toUpperCase();
}

export default function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeToGoals(user.uid, (g) => { setGoals(g); setLoading(false); }));
    unsubs.push(subscribeToBuckets(user.uid, (b) => setBuckets(b)));
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const bucketMap = new Map(buckets.map((b) => [b.id, b]));

  // Group goals by bucket
  const goalsByBucket = new Map<string, Goal[]>();
  for (const g of goals) {
    const list = goalsByBucket.get(g.bucketId) || [];
    list.push(g);
    goalsByBucket.set(g.bucketId, list);
  }

  const handleSave = async (goal: Goal) => {
    try { await saveGoal(goal); } catch (err) { console.error("Failed to save goal:", err); }
  };

  const handleDelete = async (goalId: string) => {
    try { await deleteGoal(goalId); } catch (err) { console.error("Failed to delete goal:", err); }
  };

  const openCreate = () => {
    setEditingGoal(null);
    setModalOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 720 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", marginBottom: 24, marginTop: 0 }}>
          Goals
        </h1>
        <div
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "48px 28px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--secondary)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
          Goals
        </h1>
        <button
          onClick={openCreate}
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--background)",
            borderRadius: 14,
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
          }}
        >
          + New Goal
        </button>
      </div>

      {/* Empty State */}
      {goals.length === 0 && (
        <div
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "48px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 56, color: "var(--secondary)", display: "block" }}
            >
              flag
            </span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", marginBottom: 6 }}>
            No goals yet
          </p>
          <p style={{ fontSize: 14, color: "var(--secondary)", margin: 0 }}>
            Create your first goal to give your habits purpose and direction.
          </p>
        </div>
      )}

      {/* Goals grouped by bucket */}
      {Array.from(goalsByBucket.entries()).map(([bucketId, bucketGoals]) => {
        const bucket = bucketMap.get(bucketId);
        const hex = bucket ? argbToHex(bucket.color) : "var(--secondary)";

        return (
          <div key={bucketId} style={{ marginBottom: 28 }}>
            {/* Bucket header */}
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              {bucket && (
                <div
                  className="flex items-center justify-center"
                  style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: hex + "20" }}
                >
                  <MaterialIcon name={bucket.iconName} size={14} color={hex} />
                </div>
              )}
              <h2 style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--secondary)",
                margin: 0,
              }}>
                {bucket?.name ?? "Unknown Bucket"}
              </h2>
            </div>

            {/* Goal cards */}
            <div className="flex flex-col" style={{ gap: 10 }}>
              {bucketGoals.map((goal) => (
                <div
                  key={goal.id}
                  onClick={() => openEdit(goal)}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 18,
                    padding: 20,
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Goal icon */}
                    <div
                      className="shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 44,
                        height: 44,
                        backgroundColor: hex + "20",
                      }}
                    >
                      <MaterialIcon name={goal.iconName} size={24} color={hex} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--primary)",
                          margin: 0,
                          marginBottom: goal.description ? 6 : 0,
                        }}
                      >
                        {goal.name}
                      </p>
                      {goal.description && (
                        <p style={{
                          fontSize: 13,
                          color: "var(--secondary)",
                          margin: 0,
                          lineHeight: 1.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}>
                          {goal.description}
                        </p>
                      )}
                    </div>

                    {/* Edit arrow */}
                    <span style={{ color: "var(--secondary)", fontSize: 16, marginTop: 2 }}>&rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Edit/Create Modal */}
      <GoalEditModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingGoal(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
        goal={editingGoal}
        buckets={buckets}
        userId={user?.uid ?? ""}
        nextSortOrder={goals.length}
      />
    </div>
  );
}
