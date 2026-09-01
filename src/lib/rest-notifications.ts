import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

interface RestTimerPlugin {
  start(options: { exerciseName: string; endAt: number }): Promise<void>;
  stop(options: { clearCompletion: boolean }): Promise<void>;
}

const RestTimer = registerPlugin<RestTimerPlugin>("RestTimer");
const LEGACY_REST_NOTIFICATION_IDS = [710_001, 710_002];

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

let notificationPermissionRequest: Promise<boolean> | null = null;

/**
 * Starts permission resolution before a set is completed, so the first rest
 * interval never waits behind the Android notification prompt or bridge call.
 */
export async function prepareRestNotifications(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  if (notificationPermissionRequest) return notificationPermissionRequest;
  notificationPermissionRequest = (async () => {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted";
  })().catch((error) => {
    console.warn("Could not request notification permission:", error);
    return false;
  });
  return notificationPermissionRequest;
}

async function clearLegacyRestNotifications(): Promise<void> {
  const notifications = LEGACY_REST_NOTIFICATION_IDS.map((id) => ({ id }));
  await LocalNotifications.cancel({ notifications });
  await LocalNotifications.removeDeliveredNotificationsById({ ids: LEGACY_REST_NOTIFICATION_IDS });
}

/** Starts Android's single native countdown notification and its background haptic cues. */
export async function scheduleRestNotifications(exerciseName: string, endAt: number): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    if (!await prepareRestNotifications()) return;
    await clearLegacyRestNotifications();
    await RestTimer.start({ exerciseName, endAt });
  } catch (error) {
    console.warn("Could not start the native rest timer:", error);
  }
}

/** Removes the ongoing countdown but preserves the completion alert that just fired. */
export async function clearRestCountdownNotification(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await RestTimer.stop({ clearCompletion: false });
    await clearLegacyRestNotifications();
  } catch (error) {
    console.warn("Could not clear the native rest timer:", error);
  }
}

/** Stops rest early and clears both its countdown and pending/completed alerts. */
export async function clearRestNotifications(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await RestTimer.stop({ clearCompletion: true });
    await clearLegacyRestNotifications();
  } catch (error) {
    console.warn("Could not clear native rest notifications:", error);
  }
}
