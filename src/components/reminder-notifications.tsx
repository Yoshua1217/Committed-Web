"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useAuth } from "@/lib/auth-context";
import { subscribeToHabits, subscribeToCompletionsForDate, todayString } from "@/lib/habits-service";
import { subscribeToTasks } from "@/lib/tasks-service";
import { buildReminderPlan } from "@/lib/reminder-plan";
import { isAndroidReminders, ReminderNotifications, type ReminderStatus } from "@/lib/reminder-notifications";
import type { Habit, HabitCompletion, Task } from "@/lib/types";

// One queue spans effect lifetimes so an old account can never overwrite a newer one.
let queue = Promise.resolve();

export default function Reminders() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [hasReminders, setHasReminders] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (loading || !isAndroidReminders()) return;
    let active = true;
    let habits: Habit[] | null = null;
    let tasks: Task[] | null = null;
    let completions: HabitCompletion[] | null = null;
    let asked = false;
    let sourceFailed = false;
    let lastPlan = "";
    const userId = user?.uid ?? "";
    const enqueue = (work: () => Promise<void>) => {
      queue = queue.then(async () => { if (active) await work(); }).catch((cause) => {
        console.error("Could not synchronize Android reminders:", cause);
        if (active) setError(true);
      });
    };
    const refresh = () => enqueue(async () => {
      if (sourceFailed || !habits || !tasks || !completions) return;
      const plan = buildReminderPlan(habits, tasks, completions);
      setHasReminders(plan.length > 0);
      // Persist first, even when permission is blocked, so settings can restore alarms.
      const serialized = JSON.stringify(plan);
      if (lastPlan !== serialized) {
        await ReminderNotifications.sync({ userId, reminders: plan });
        lastPlan = serialized;
      }
      if (plan.length && !asked) {
        asked = true;
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
          await LocalNotifications.requestPermissions();
        }
      }
      const nextStatus = await ReminderNotifications.status();
      if (active) { setStatus(nextStatus); if (!sourceFailed) setError(false); }
    });
    enqueue(async () => {
      await ReminderNotifications.setOwner({ userId });
      if (active) { setHasReminders(false); setStatus(null); }
    });
    if (!userId) return () => { active = false; };
    const failed = () => { sourceFailed = true; if (active) setError(true); };
    const stopHabits = subscribeToHabits(userId, (items) => { habits = items; refresh(); }, { onError: failed, keepPreviousOnError: true });
    const stopTasks = subscribeToTasks(userId, (items) => { tasks = items; refresh(); }, false, failed);
    let date = todayString();
    const loadCompletions = () => subscribeToCompletionsForDate(userId, date, (items) => { completions = items; refresh(); }, failed);
    let stopCompletions = loadCompletions();
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      if (date !== todayString()) {
        date = todayString();
        completions = null;
        stopCompletions();
        stopCompletions = loadCompletions();
      }
      refresh();
    };
    const timer = window.setInterval(resume, 60_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    const listener = ReminderNotifications.addListener("opened", (data) => {
      if (active && data.userId === userId) router.push(data.kind === "habit" ? "/dashboard/habits" : "/dashboard/tasks");
    });
    return () => {
      active = false;
      stopHabits(); stopTasks(); stopCompletions();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      void listener.then((handle) => handle.remove()).catch(console.error);
    };
  }, [user?.uid, loading, router, retry]);

  if (!user || (!error && (!hasReminders || !status || (status.enabled && status.exact)))) return null;
  const fix = async () => {
    try {
      if (error) { setRetry((value) => value + 1); return; }
      await ReminderNotifications.openSettings({ exact: status?.enabled ?? false });
    } catch { setError(true); }
  };
  return <div role="status" style={{ position: "fixed", bottom: "calc(80px + env(safe-area-inset-bottom))", left: 16, right: 16, zIndex: 100, padding: 14, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 4px 24px #0004", fontSize: 13 }}>
    {error ? "Android reminders could not be updated." : !status?.enabled ? "Habit and task notifications are blocked in Android settings." : "Allow Alarms & reminders in Android settings to receive reminders on time."}
    <button onClick={() => void fix()} style={{ marginLeft: 12, color: "var(--primary)", fontWeight: 700 }}>{error ? "Retry" : "Open settings"}</button>
  </div>;
}
