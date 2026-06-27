"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { ChatMessage } from "@/lib/types";
import {
  buildSystemPrompt,
  sendMessage,
  sendAgentMessage,
  AI_MODELS,
  AiModel,
} from "@/lib/ai-service";
import {
  getAllConversations,
  getConversation,
  saveConversation,
  deleteConversation as deleteConv,
  generateConversationId,
  StoredConversation,
} from "@/lib/chat-storage";
import { subscribeToHabits, subscribeToCompletionsForDate, todayString, getCompletionsForHabit } from "@/lib/habits-service";
import { subscribeToBuckets } from "@/lib/buckets-service";
import { subscribeToGoals } from "@/lib/goals-service";
import { subscribeToSettings } from "@/lib/settings-service";
import { calculateStreak } from "@/lib/streak-calculator";
import { Habit, HabitCompletion, Bucket, Goal, StreakInfo, UserSettings } from "@/lib/types";
import ChatBubble from "@/components/chat-bubble";
import TypingIndicator from "@/components/typing-indicator";
import AgentThinking, { AgentPhase } from "@/components/agent-thinking";
import ChatHistoryPanel from "@/components/chat-history-panel";

type ChatMode = "agent" | "manual";

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hey! I'm your Committed AI assistant. I have full access to your habits, buckets, and progress. Ask me anything — like what habits to add, how you're doing, or how to improve your routine.",
  timestamp: Date.now(),
};

export default function AiChatPage() {
  const { user } = useAuth();
  const today = todayString();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [selectedModel, setSelectedModel] = useState<AiModel>("google/gemini-2.5-flash-lite");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Agent thinking UI state
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);
  const [agentSpecialistLabel, setAgentSpecialistLabel] = useState("");
  const [agentSpecialistDesc, setAgentSpecialistDesc] = useState("");

  // Data for system prompt
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to data for system prompt
  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeToHabits(user.uid, setHabits));
    unsubs.push(subscribeToCompletionsForDate(user.uid, today, setCompletions));
    unsubs.push(subscribeToBuckets(user.uid, setBuckets));
    unsubs.push(subscribeToGoals(user.uid, setGoals));
    unsubs.push(subscribeToSettings(user.uid, setSettings));
    return () => unsubs.forEach((u) => u());
  }, [user, today]);

  // Build system prompt when data changes
  const dataKey = JSON.stringify({
    h: habits.map((h) => h.id),
    c: completions.map((c) => `${c.habitId}:${c.completed}:${c.counterValue}:${c.timerSeconds}`),
    b: buckets.map((b) => b.id),
    g: goals.map((g) => g.id),
    s: settings?.preferredName ?? "",
    sg: settings?.mainGoals ?? "",
    ss: settings?.mainStruggles ?? "",
    sp: settings?.customPrompt ?? "",
  });

  useEffect(() => {
    if (habits.length === 0 && buckets.length === 0) {
      setSystemPrompt(
        "You are Committed AI, a personal productivity coach. Help the user with habit tracking and productivity advice."
      );
      return;
    }

    let cancelled = false;
    async function build() {
      const streaks: Record<string, StreakInfo> = {};
      for (const h of habits) {
        try {
          const hc = await getCompletionsForHabit(h.userId, h.id);
          streaks[h.id] = calculateStreak(h, hc);
        } catch {
          streaks[h.id] = { currentStreak: 0, currentAntiStreak: 0 };
        }
      }
      if (cancelled) return;
      const prompt = buildSystemPrompt({ buckets, goals, habits, completions, streaks, settings });
      setSystemPrompt(prompt);
    }
    build();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // Load conversations from localStorage
  useEffect(() => {
    setConversations(getAllConversations());
  }, [messages]);

  // Auto-load the most recent conversation on mount
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    const all = getAllConversations();
    if (all.length > 0) {
      const recent = all[0];
      setCurrentConversationId(recent.id);
      setMessages(
        recent.messages.map((m: any) => ({
          role: m.role as ChatMessage["role"],
          content: m.content,
          timestamp: m.timestamp,
          modelLabel: m.modelLabel,
        }))
      );
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, agentPhase]);

  // ── Save conversation helper ──────────────────────────────
  const saveConv = useCallback((finalMessages: ChatMessage[]) => {
    const saveableMessages = finalMessages.filter(
      (m) => m !== WELCOME_MESSAGE && (m.role === "user" || m.role === "assistant")
    );
    if (saveableMessages.length >= 2) {
      const convId = currentConversationId ?? generateConversationId();
      if (!currentConversationId) setCurrentConversationId(convId);
      const title = saveableMessages.find((m) => m.role === "user")?.content.slice(0, 50) ?? "New Chat";
      saveConversation({
        id: convId,
        title: title.length >= 50 ? title + "..." : title,
        createdAt: currentConversationId
          ? (getConversation(convId)?.createdAt ?? Date.now())
          : Date.now(),
        updatedAt: Date.now(),
        messages: finalMessages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp, modelLabel: m.modelLabel })),
      });
    }
  }, [currentConversationId]);

  // ── Send handler ──────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setIsLoading(true);

    try {
      if (chatMode === "agent") {
        // ── Agent Mode: Manager → Specialist ──
        setAgentPhase("routing");
        setAgentSpecialistLabel("");
        setAgentSpecialistDesc("");

        const result = await sendAgentMessage(systemPrompt, newMessages);

        // Brief pause to show the specialist was hired before showing response
        setAgentPhase("specialist");
        setAgentSpecialistLabel(result.routing.label);
        setAgentSpecialistDesc(result.routing.description);

        // Small delay so user sees the specialist name before the response pops in
        await new Promise((r) => setTimeout(r, 600));

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: result.content,
          timestamp: Date.now(),
          modelLabel: `${result.routing.label} · ${result.routing.reason}`,
        };
        const finalMessages = [...newMessages, assistantMsg];
        setMessages(finalMessages);
        saveConv(finalMessages);
      } else {
        // ── Manual Mode ──
        const response = await sendMessage(systemPrompt, newMessages, selectedModel);
        const modelLabel = AI_MODELS.find((m) => m.id === selectedModel)?.label;
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: response,
          timestamp: Date.now(),
          modelLabel,
        };
        const finalMessages = [...newMessages, assistantMsg];
        setMessages(finalMessages);
        saveConv(finalMessages);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      setError(errMsg);
      const errorAssistant: ChatMessage = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${errMsg}. Please try again.`,
        timestamp: Date.now(),
      };
      setMessages([...newMessages, errorAssistant]);
    } finally {
      setIsLoading(false);
      setAgentPhase(null);
      setAgentSpecialistLabel("");
      setAgentSpecialistDesc("");
    }
  }, [input, isLoading, messages, systemPrompt, currentConversationId, selectedModel, chatMode, saveConv]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setShowHistory(false);
  };

  const handleLoadConversation = (id: string) => {
    if (id === "") {
      handleNewConversation();
      return;
    }
    const conv = getConversation(id);
    if (conv) {
      setCurrentConversationId(id);
      setMessages(
        conv.messages.map((m: any) => ({
          role: m.role as ChatMessage["role"],
          content: m.content,
          timestamp: m.timestamp,
          modelLabel: m.modelLabel,
        }))
      );
    }
    setShowHistory(false);
  };

  const handleDeleteConversation = (id: string) => {
    deleteConv(id);
    setConversations(getAllConversations());
    if (currentConversationId === id) {
      handleNewConversation();
    }
  };

  // ── Mode toggle button style helper ───────────────────────
  const modeBtn = (mode: ChatMode, label: string, icon: string) => {
    const isActive = chatMode === mode;
    return (
      <button
        onClick={() => setChatMode(mode)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "6px 12px",
          borderRadius: 10,
          border: "none",
          fontSize: 12,
          fontWeight: isActive ? 700 : 500,
          color: isActive ? "var(--background)" : "var(--secondary)",
          backgroundColor: isActive ? "var(--primary)" : "transparent",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 14 }}>{icon}</span>
        {label}
      </button>
    );
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: "calc(100vh - 0px)", maxHeight: "100vh" }}
    >
      {/* Header */}
      <div
        className="shrink-0"
        style={{
          padding: "12px 20px",
          backgroundColor: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Top row: title + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)", margin: 0 }}>
              AI Chat
            </h1>
            {/* Mode toggle */}
            <div style={{
              display: "flex",
              gap: 2,
              padding: 3,
              borderRadius: 12,
              backgroundColor: "var(--surface-variant)",
            }}>
              {modeBtn("agent", "Auto", "psychology")}
              {modeBtn("manual", "Manual", "tune")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Model selector — only in manual mode */}
            {chatMode === "manual" && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowModelPicker((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: "var(--surface-variant)",
                    color: "var(--secondary)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 16, opacity: 0.7 }}>smart_toy</span>
                  {AI_MODELS.find((m) => m.id === selectedModel)?.label}
                  <span className="material-symbols-rounded" style={{ fontSize: 16, opacity: 0.5, transition: "transform 0.2s", transform: showModelPicker ? "rotate(180deg)" : "rotate(0)" }}>expand_more</span>
                </button>
                {showModelPicker && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      onClick={() => setShowModelPicker(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 50,
                        minWidth: 220,
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        padding: 6,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                      }}
                    >
                      {AI_MODELS.map((m) => {
                        const isActive = m.id === selectedModel;
                        return (
                          <button
                            key={m.id}
                            onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "none",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: isActive ? 700 : 500,
                              color: isActive ? "var(--primary)" : "var(--secondary)",
                              backgroundColor: isActive ? "var(--surface-variant)" : "transparent",
                              transition: "background-color 0.1s ease",
                            }}
                            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--surface-variant)"; }}
                            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: 18, opacity: isActive ? 1 : 0.5 }}>smart_toy</span>
                            <span style={{ flex: 1, textAlign: "left" }}>{m.label}</span>
                            {isActive && <span className="material-symbols-rounded" style={{ fontSize: 16, color: "var(--primary)" }}>check</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={handleNewConversation}
              style={{
                borderRadius: 12,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "var(--surface-variant)",
                color: "var(--secondary)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                transition: "opacity 0.15s ease",
              }}
            >
              New Chat
            </button>
            <button
              onClick={() => setShowHistory(true)}
              style={{
                borderRadius: 12,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "var(--surface-variant)",
                color: "var(--secondary)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                transition: "opacity 0.15s ease",
              }}
            >
              History
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          overscrollBehavior: "contain",
        }}
      >
        {messages.map((msg, i) => (
          <ChatBubble key={i} role={msg.role as "user" | "assistant"} content={msg.content} modelLabel={msg.modelLabel} />
        ))}
        {/* Thinking indicators */}
        {chatMode === "agent" && agentPhase && (
          <AgentThinking
            phase={agentPhase}
            specialistLabel={agentSpecialistLabel}
            specialistDescription={agentSpecialistDesc}
          />
        )}
        {chatMode === "manual" && isLoading && <TypingIndicator visible />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div
        className="shrink-0 flex items-end"
        style={{
          padding: "16px 20px",
          gap: "12px",
          backgroundColor: "var(--surface)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
          }}
          onKeyDown={handleKeyDown}
          placeholder={chatMode === "agent" ? "Ask anything — the right model will be picked for you..." : "Ask me anything..."}
          disabled={isLoading}
          rows={1}
          className="flex-1"
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            fontSize: "14px",
            backgroundColor: "var(--background)",
            color: "var(--primary)",
            border: "1px solid var(--border)",
            outline: "none",
            resize: "none",
            overflow: "auto",
            lineHeight: "1.4",
            maxHeight: 160,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{
            borderRadius: "14px",
            padding: "14px 20px",
            fontSize: "14px",
            fontWeight: 700,
            backgroundColor: "var(--primary)",
            color: "var(--background)",
            border: "none",
            cursor: input.trim() && !isLoading ? "pointer" : "default",
            opacity: !input.trim() || isLoading ? 0.4 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          Send
        </button>
      </div>

      {/* History panel */}
      <ChatHistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        conversations={conversations}
        onLoadConversation={handleLoadConversation}
        onDeleteConversation={handleDeleteConversation}
        currentConversationId={currentConversationId}
      />
    </div>
  );
}
