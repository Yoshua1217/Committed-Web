import { db } from "@/lib/firebase";
import { DailyLog } from "@/lib/types";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

export function dailyLogId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

function dailyLogFromFirestore(data: Record<string, unknown>): DailyLog {
  return {
    id: (data.id as string) ?? "",
    userId: (data.userId as string) ?? "",
    date: (data.date as string) ?? "",
    grateful: (data.grateful as string) ?? "",
    learned: (data.learned as string) ?? "",
    struggled: (data.struggled as string) ?? "",
    improveTomorrow: (data.improveTomorrow as string) ?? "",
    completed: data.completed === true,
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
    completedAt: data.completedAt == null ? null : Number(data.completedAt),
  };
}

export function subscribeToDailyLog(
  userId: string,
  date: string,
  callback: (dailyLog: DailyLog | null) => void
): () => void {
  const ref = doc(db, "daily_logs", dailyLogId(userId, date));

  return onSnapshot(
    ref,
    (snapshot) => {
      callback(
        snapshot.exists()
          ? dailyLogFromFirestore(snapshot.data() as Record<string, unknown>)
          : null
      );
    },
    (error) => {
      console.error("subscribeToDailyLog error:", error);
      callback(null);
    }
  );
}

export async function saveDailyLog(dailyLog: DailyLog): Promise<void> {
  await setDoc(doc(db, "daily_logs", dailyLog.id), dailyLog);
}
