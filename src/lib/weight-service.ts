import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getSettings } from "@/lib/settings-service";
import { markHabitComplete, todayString } from "@/lib/habits-service";

export interface DailyWeight {
  id: string; userId: string; date: string; weightLbs: number; createdAt: number; updatedAt: number;
}
export type WeightHabitResult = "completed" | "disabled" | "choose" | "unavailable";

export function parseWeightLbs(value: string): number | null {
  const text = value.trim();
  const number = Number(text);
  return /^\d+(\.\d{1,2})?$/.test(text) && Number.isFinite(number) && number > 0 && number <= 2000 ? number : null;
}

export async function getDailyWeight(userId: string, date: string): Promise<DailyWeight | null> {
  const snapshot = await getDoc(doc(db, "weight_logs", `${userId}_${date}`));
  return snapshot.exists() ? snapshot.data() as DailyWeight : null;
}

/** One record per local day; correcting today's value preserves other dates. */
export async function saveDailyWeight(userId: string, date: string, weightLbs: number): Promise<DailyWeight> {
  if (date !== todayString()) throw new Error("A new day has started. Refresh before logging your weight.");
  if (parseWeightLbs(String(weightLbs)) === null) throw new Error("Enter a weight between 0 and 2,000 lbs, with up to two decimal places.");
  const id = `${userId}_${date}`;
  const ref = doc(db, "weight_logs", id);
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    const now = Date.now();
    const entry: DailyWeight = { id, userId, date, weightLbs, createdAt: existing.exists() ? existing.data().createdAt : now, updatedAt: now };
    transaction.set(ref, entry);
    return entry;
  });
}

/** Called only after a weight save succeeds. Retry cannot duplicate weight data. */
export async function completeWeightHabit(userId: string, date: string): Promise<WeightHabitResult> {
  const settings = await getSettings(userId);
  if (!settings.weightHabitMappingConfigured && !settings.weightHabitMappingEnabled) return "choose";
  if (!settings.weightHabitMappingEnabled) return "disabled";
  if (!settings.weightHabitMappingHabitId) return "choose";
  return await markHabitComplete(userId, settings.weightHabitMappingHabitId, date) ? "completed" : "unavailable";
}
