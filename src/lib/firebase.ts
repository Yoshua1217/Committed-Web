import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDQvaF2LF8NzAWpKU_JfcUN9dsXL_PBsJk",
  authDomain: "committed-2f3a9.firebaseapp.com",
  projectId: "committed-2f3a9",
  storageBucket: "committed-2f3a9.firebasestorage.app",
  messagingSenderId: "164172002698",
  appId: "1:164172002698:web:b33b8e7df21fff9c954473",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export default app;
