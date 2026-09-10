import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const useEmulators = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";
const firebaseConfig = {
  apiKey: "AIzaSyDQvaF2LF8NzAWpKU_JfcUN9dsXL_PBsJk",
  authDomain: "committed-2f3a9.firebaseapp.com",
  projectId: "committed-2f3a9",
  storageBucket: "committed-2f3a9.firebasestorage.app",
  messagingSenderId: "164172002698",
  appId: "1:164172002698:web:b33b8e7df21fff9c954473",
};
if (useEmulators) {
  firebaseConfig.projectId = "demo-ink-workspace";
  firebaseConfig.storageBucket = "demo-ink-workspace.appspot.com";
}

const existingApp = getApps().find((candidate) => candidate.name === "[DEFAULT]");
const app = existingApp ?? initializeApp(firebaseConfig);

function getConfiguredFirestore(): Firestore {
  // Firestore's streaming transport can repeatedly fail behind QUIC-hostile
  // networks, proxies, and VPNs. Long polling uses ordinary HTTPS requests and
  // lets the SDK reconnect cleanly when the browser reports a network change.
  if (typeof window !== "undefined" && !existingApp) {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }

  // Reuse the existing instance during SSR and Fast Refresh. Calling
  // initializeFirestore twice for the same app would throw.
  return getFirestore(app);
}

export const auth = getAuth(app);
export const db = getConfiguredFirestore();
export const functions = getFunctions(app);
export const storage = getStorage(app);
if (useEmulators && typeof window !== "undefined" && !existingApp) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
export default app;
