import { db } from "@/lib/firebase";
import { UserSettings } from "@/lib/types";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

const COLLECTION_NAME = "userSettings";

const DEFAULT_SETTINGS: UserSettings = {
  darkMode: false,
  preferredName: "",
  mainGoals: "",
  mainStruggles: "",
  customPrompt: "",
};

function settingsFromFirestore(data: Record<string, unknown>): UserSettings {
  return {
    darkMode: typeof data.darkMode === "boolean" ? data.darkMode : false,
    preferredName: (data.preferredName as string) ?? "",
    mainGoals: (data.mainGoals as string) ?? "",
    mainStruggles: (data.mainStruggles as string) ?? "",
    customPrompt: (data.customPrompt as string) ?? "",
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
  });
}
