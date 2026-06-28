"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Task, Goal } from "@/lib/types";
import { subscribeToTasks, saveTask, deleteTask, completeTask, uncompleteTask } from "@/lib/tasks-service";
import { subscribeToGoals } from "@/lib/goals-service";
import TaskEditModal from "@/components/task-edit-modal";

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeToTasks(user.uid, (t) => {
      setTasks(t);
      setLoading(false);
    });
    const unsub2 = subscribeToGoals(user.uid, setGoals);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const todos = tasks.filter((t) => t.type === "todo" && !t.completed);
  const activeTasks = tasks.filter((t) => t.type === "task" && !t.completed);
  const completedTasks = tasks.filter((t) => t.type === "task" && t.completed);

  const today = new Date().toISOString().split("T")[0];

  const handleComplete = useCallback(async (t: Task) => {
    setCompletingIds((prev) => new Set(prev).add(t.id));
    // Small delay for visual feedback before archiving todos
    setTimeout(async () => {
      await completeTask(t);
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(t.id);
        return next;
      });
    }, t.type === "todo" ? 400 : 0);
  }, []);

  const handleSave = useCallback(async (t: Task) => {
    await saveTask(t);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteTask(id);
  }, []);

  const nextSortOrder = tasks.length;

  const goalName = (id: string) => goals.find((g) => g.id === id)?.name ?? "";

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--secondary)", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 28px", maxWidth: 720, width: "100%" }}>
      {/* Header */}
      <div className="mobile-page-header flex items-center justify-between" style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)", margin: 0 }}>
          Tasks
        </h1>
        <button
          onClick={() => {
            setEditingTask(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2"
          style={{
            padding: "10px 20px",
            borderRadius: 14,
            backgroundColor: "var(--primary)",
            color: "var(--background)",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
          Add
        </button>
      </div>

      {/* Quick To-Dos Section */}
      <section style={{ marginBottom: 32 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>
            check_circle
          </span>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--secondary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            To Do
          </h2>
          {todos.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, backgroundColor: "var(--surface-variant)",
              color: "var(--secondary)", padding: "2px 8px", borderRadius: 10,
            }}>
              {todos.length}
            </span>
          )}
        </div>

        {todos.length === 0 ? (
          <div style={{
            padding: "24px 20px",
            borderRadius: 16,
            border: "1px dashed var(--border)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>
              No to-dos. Click Add to create one.
            </p>
          </div>
        ) : (
          <div style={{
            borderRadius: 16,
            border: "1px solid var(--border)",
            backgroundColor: "var(--surface)",
            overflow: "hidden",
          }}>
            {todos.map((todo, i) => {
              const completing = completingIds.has(todo.id);
              return (
                <div
                  key={todo.id}
                  className="flex items-center gap-3"
                  style={{
                    padding: "14px 16px",
                    borderBottom: i < todos.length - 1 ? "1px solid var(--border)" : "none",
                    opacity: completing ? 0.3 : 1,
                    transform: completing ? "translateX(20px)" : "none",
                    transition: "all 0.35s ease",
                  }}
                >
                  <button
                    onClick={() => handleComplete(todo)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "2px solid var(--border)",
                      background: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    {completing && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span
                    onClick={() => {
                      setEditingTask(todo);
                      setModalOpen(true);
                    }}
                    style={{
                      fontSize: 14,
                      color: "var(--primary)",
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    {todo.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Main Tasks Section */}
      <section style={{ marginBottom: 32 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--secondary)" }}>
            assignment
          </span>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--secondary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Tasks
          </h2>
          {activeTasks.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, backgroundColor: "var(--surface-variant)",
              color: "var(--secondary)", padding: "2px 8px", borderRadius: 10,
            }}>
              {activeTasks.length}
            </span>
          )}
        </div>

        {activeTasks.length === 0 ? (
          <div style={{
            padding: "24px 20px",
            borderRadius: 16,
            border: "1px dashed var(--border)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: 13, color: "var(--secondary)", margin: 0 }}>
              No tasks yet. Click Add to create one.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeTasks.map((task) => {
              const overdue = task.dueDate ? task.dueDate < today : false;
              const goal = task.goalId ? goalName(task.goalId) : "";
              return (
                <div
                  key={task.id}
                  onClick={() => {
                    setEditingTask(task);
                    setModalOpen(true);
                  }}
                  className="flex items-start gap-3"
                  style={{
                    padding: "16px 18px",
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface)",
                    cursor: "pointer",
                    transition: "background-color 0.15s",
                  }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleComplete(task);
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: "2px solid var(--border)",
                      background: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title */}
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--primary)", marginBottom: 4 }}>
                      {task.title}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                      {/* Due date */}
                      {task.dueDate && (
                        <span className="flex items-center gap-1" style={{
                          fontSize: 12,
                          color: overdue ? "var(--error)" : "var(--secondary)",
                          fontWeight: overdue ? 600 : 400,
                        }}>
                          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>calendar_today</span>
                          {formatDate(task.dueDate)}
                          {overdue && " (overdue)"}
                        </span>
                      )}
                      {/* Goal */}
                      {goal && (
                        <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--secondary)" }}>
                          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>flag</span>
                          {goal}
                        </span>
                      )}
                      {/* Notification indicator */}
                      {task.notificationDateTime && (
                        <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--secondary)" }}>
                          <span className="material-symbols-rounded" style={{ fontSize: 14 }}>notifications</span>
                          Reminder set
                        </span>
                      )}
                    </div>

                    {/* Description preview */}
                    {task.description && (
                      <p style={{
                        fontSize: 12,
                        color: "var(--secondary)",
                        margin: "6px 0 0",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Completed Tasks Section */}
      {completedTasks.length > 0 && (
        <section>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
              marginBottom: 14,
            }}
          >
            <span className="material-symbols-rounded" style={{
              fontSize: 18,
              color: "var(--secondary)",
              transition: "transform 0.2s",
              transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)",
            }}>
              chevron_right
            </span>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--secondary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Completed
            </h2>
            <span style={{
              fontSize: 11, fontWeight: 700, backgroundColor: "var(--surface-variant)",
              color: "var(--secondary)", padding: "2px 8px", borderRadius: 10,
            }}>
              {completedTasks.length}
            </span>
          </button>

          {showCompleted && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3"
                  style={{
                    padding: "14px 18px",
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface)",
                    opacity: 0.5,
                  }}
                >
                  {/* Checked box */}
                  <button
                    onClick={() => uncompleteTask(task)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: "none",
                      background: "var(--primary)",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <span style={{
                    fontSize: 14,
                    color: "var(--primary)",
                    textDecoration: "line-through",
                    opacity: 0.7,
                  }}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Edit Modal */}
      <TaskEditModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
        task={editingTask}
        goals={goals}
        userId={user?.uid ?? ""}
        nextSortOrder={nextSortOrder}
      />
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
