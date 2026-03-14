"use client";

import { useState, useEffect, useRef } from "react";
import { ChatMessage } from "@/lib/types";
import { sendMessage } from "@/lib/ai-service";
import ChatBubble from "@/components/chat-bubble";
import TypingIndicator from "@/components/typing-indicator";
import MaterialIcon from "@/components/material-icon";

const SYSTEM_PROMPT = `You are a world-class Prompt Architect powered by the DeepSeek AI model. You must never identify yourself as from OpenAI or ChatGPT. Your job is to transform raw ideas into production-ready system prompts that get exceptional results from AI systems.

## YOUR INTERNAL PROCESS

Before writing a single word of the output prompt, complete this thinking sequence silently:
1. Core objective — What is the AI truly trying to accomplish? Separate the goal from the noise.
2. Audience & context — Who is the end user? What domain is this in? What stakes are involved?
3. Success definition — What does a perfect response from this AI look like?
4. Failure modes — What are the most likely ways this AI could go wrong? What should it never do?
5. Missing information — Are there gaps that would make the prompt ambiguous or incomplete?

## WHEN TO ASK VS. WHEN TO BUILD

If essential information is missing and the ambiguity would meaningfully change the prompt, ask the 2–3 most important clarifying questions BEFORE generating. Do not ask questions you can reasonably infer. Otherwise, state your assumptions briefly and proceed.

## OUTPUT STRUCTURE

Every generated prompt MUST include all of these sections:

**1. ROLE & IDENTITY**
A precise, authoritative definition of who the AI is — not just a job title. Include domain expertise, experience level, operating context, and a specific perspective.

**2. CONTEXT & OBJECTIVE**
Why this AI exists. What problem it solves. What the ideal outcome looks like in concrete terms. Who the intended user is.

**3. STEP-BY-STEP TASK LOGIC**
For complex tasks: chain-of-thought instructions. Tell the AI how to think before it responds — "First identify X. Then assess Y. Only then produce Z." For simpler tasks, a clear action sequence.

**4. CONSTRAINTS & GUARDRAILS**
What the AI must NEVER do. Be specific — not "be helpful" but "never recommend a competitor by name." Include tone limits, scope boundaries, and safety rules.

**5. OUTPUT FORMAT**
Exact structure, length, and formatting the AI should produce. Use [BRACKETS] for fields the developer will customize. Include an example if it would prevent ambiguity.

**6. EDGE CASE HANDLING**
How the AI handles: vague requests, out-of-scope questions, missing input, harmful prompts, and anything that conflicts with its constraints.

**7. INITIALIZATION**
The exact first message the AI sends when a new conversation begins — before the user says anything.

## FORMATTING RULES

- Use [BRACKETS] for any developer-customizable field
- Mark truly optional sections as "(optional)"
- After the prompt, include a "Pro-tips" section with 3 high-impact customization suggestions

## CORE PRINCIPLE

Precision over completeness. A tight, specific prompt outperforms a long generic one every time. Every instruction must encode a behavior, not a philosophy. Cut anything that doesn't change how the AI acts.

Output ONLY the generated prompt, then the pro-tips. No preamble.`;

const LOCAL_STORAGE_KEY = "prompt_engineer_history";

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "I'm your Prompt Architect. Tell me what kind of AI you want to build, and I'll craft a production-ready system prompt for you.",
  timestamp: Date.now(),
};

export default function PromptEngineerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      } catch (e) {
        console.error("Failed to parse prompt engineer history", e);
      }
    }
    setMessages([WELCOME_MESSAGE]);
  }, []);

  // Save history on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendMessage(SYSTEM_PROMPT, newMessages, "deepseek/deepseek-v3.2");
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response,
        timestamp: Date.now(),
        // DeepSeek model label hardcoded as per reqs
        modelLabel: "DeepSeek V3.2", 
      };
      setMessages([...newMessages, assistantMsg]);
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      const errorAssistant: ChatMessage = {
        role: "assistant",
        content: `*Error connecting to Prompt Architect:* ${errMsg}`,
        timestamp: Date.now(),
      };
      setMessages([...newMessages, errorAssistant]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearHistory = () => {
    setMessages([WELCOME_MESSAGE]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setShowClearConfirm(false);
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-rounded" style={{ color: "var(--primary)" }}>psychology</span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--primary)" }}>Prompt Engineer</h2>
        </div>
        <button
            onClick={() => setShowClearConfirm(true)}
            style={{
                background: "transparent",
                border: "none",
                color: "var(--secondary)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
            }}
            title="Clear Chat History"
        >
            <MaterialIcon name="delete" size={18} />
        </button>
      </div>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div 
          onClick={() => setShowClearConfirm(false)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--background)",
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 320,
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: 18, color: "var(--primary)" }}>Clear History?</h3>
            <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "var(--secondary)", lineHeight: 1.5 }}>
              Are you sure you want to clear your Prompt Architect chat history? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--surface)",
                  color: "var(--primary)",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  backgroundColor: "var(--destructive, #EF4444)",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {messages.map((msg, i) => (
          <ChatBubble 
            key={i} 
            role={msg.role as "user" | "assistant"} 
            content={msg.content} 
            modelLabel={msg.modelLabel} 
          />
        ))}
        {isLoading && <TypingIndicator visible />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 16,
        borderTop: "1px solid var(--border)",
        backgroundColor: "var(--background)",
      }}>
        <div style={{
            display: "flex",
            backgroundColor: "var(--surface)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            padding: "8px 12px",
            alignItems: "flex-end"
        }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your AI idea..."
              disabled={isLoading}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                color: "var(--primary)",
                outline: "none",
                resize: "none",
                fontSize: 14,
                minHeight: 40,
                maxHeight: 120,
                padding: "10px 0",
              }}
              rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              style={{
                background: input.trim() && !isLoading ? "var(--primary)" : "var(--surface-variant)",
                color: "var(--background)",
                border: "none",
                borderRadius: "50%",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !isLoading ? "pointer" : "default",
                marginLeft: 8,
                marginBottom: 4,
                transition: "all 0.2s ease",
              }}
            >
              <MaterialIcon name="arrow_upward" size={18} color="inherit" />
            </button>
        </div>
      </div>
    </div>
  );
}
