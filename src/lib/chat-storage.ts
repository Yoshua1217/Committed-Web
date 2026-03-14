// Local chat storage using localStorage
// Matches the Android app's ChatDao behavior without external dependencies

const STORAGE_KEY = "committed-conversations";

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: { role: string; content: string; timestamp: number; modelLabel?: string }[];
}

function readAll(): StoredConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredConversation[];
  } catch {
    return [];
  }
}

function writeAll(conversations: StoredConversation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export function getAllConversations(): StoredConversation[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): StoredConversation | null {
  return readAll().find((c) => c.id === id) ?? null;
}

export function saveConversation(conversation: StoredConversation): void {
  const all = readAll();
  const index = all.findIndex((c) => c.id === conversation.id);
  if (index >= 0) {
    all[index] = conversation;
  } else {
    all.push(conversation);
  }
  writeAll(all);
}

export function deleteConversation(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}

export function generateConversationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
