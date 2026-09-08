import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { Reminder } from "@/lib/reminder-plan";

export interface ReminderStatus { enabled: boolean; exact: boolean }
interface ReminderPlugin {
  setOwner(options: { userId: string }): Promise<void>;
  sync(options: { userId: string; reminders: Reminder[] }): Promise<void>;
  status(): Promise<ReminderStatus>;
  openSettings(options: { exact: boolean }): Promise<void>;
  addListener(event: "opened", listener: (data: { kind: string; userId: string }) => void): Promise<PluginListenerHandle>;
}

export const ReminderNotifications = registerPlugin<ReminderPlugin>("ReminderNotifications");
export function isAndroidReminders(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
