import { db } from "@/lib/firebase";
import { UserSettings } from "@/lib/types";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";

const COLLECTION_NAME = "userSettings";

const DEFAULT_SETTINGS: UserSettings = {
  darkMode: false,
  preferredName: "",
  mainGoals: "",
  mainStruggles: "",
  customPrompt: "",
  workoutHabitMappingEnabled: false,
  workoutHabitMappingHabitId: null,
  stretchHabitMappingEnabled: false,
  stretchHabitMappingHabitId: null,
};

function settingsFromFirestore(data: Record<string, unknown>): UserSettings {
  return {
    darkMode: typeof data.darkMode === "boolean" ? data.darkMode : false,
    preferredName: (data.preferredName as string) ?? "",
    mainGoals: (data.mainGoals as string) ?? "",
    mainStruggles: (data.mainStruggles as string) ?? "",
    customPrompt: (data.customPrompt as string) ?? "",
    workoutHabitMappingEnabled: data.workoutHabitMappingEnabled === true,
    workoutHabitMappingHabitId: typeof data.workoutHabitMappingHabitId === "string" ? data.workoutHabitMappingHabitId : null,
    stretchHabitMappingEnabled: data.stretchHabitMappingEnabled === true,
    stretchHabitMappingHabitId: typeof data.stretchHabitMappingHabitId === "string" ? data.stretchHabitMappingHabitId : null,
  };
}

export function subscribeToSettings(
  userId: string,
  callback: (settings: UserSettings) => void
): () => void {
  const ref = doc(db, COLLECTION_NAME, userId);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(settingsFromFirestore(snapshot.data() as Record<string, unknown>));
      } else {
        callback(DEFAULT_SETTINGS);
      }
    },
    (error) => {
      console.error("subscribeToSettings error:", error);
      callback(DEFAULT_SETTINGS);
    }
  );
}

export async function saveSettings(userId: string, settings: UserSettings): Promise<void> {
  await setDoc(doc(db, COLLECTION_NAME, userId), {
    darkMode: settings.darkMode,
    preferredName: settings.preferredName,
    mainGoals: settings.mainGoals,
    mainStruggles: settings.mainStruggles,
    customPrompt: settings.customPrompt,
    workoutHabitMappingEnabled: settings.workoutHabitMappingEnabled,
    workoutHabitMappingHabitId: settings.workoutHabitMappingHabitId,
    stretchHabitMappingEnabled: settings.stretchHabitMappingEnabled,
    stretchHabitMappingHabitId: settings.stretchHabitMappingHabitId,
  });
}

/** Gets the persisted settings for actions triggered outside the settings page. */
export async function getSettings(userId: string): Promise<UserSettings> {
  const snapshot = await getDoc(doc(db, COLLECTION_NAME, userId));
  return snapshot.exists()
    ? settingsFromFirestore(snapshot.data() as Record<string, unknown>)
    : DEFAULT_SETTINGS;
}
