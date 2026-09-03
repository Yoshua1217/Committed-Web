"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  getAuth,
  signOut as signOutSecondaryAuth,
} from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import firebaseApp, { auth } from "./firebase";

export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  connectGoogleCalendar: () => Promise<string>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle({
        skipNativeAuth: true,
        // The legacy Google flow returns the scoped access token directly;
        // Credential Manager can complete already-granted scopes without one.
        useCredentialManager: false,
      });
      const idToken = result.credential?.idToken;
      if (!idToken) {
        throw new Error("Google sign-in did not return an ID token.");
      }
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      return;
    }

    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  // Calendar access is intentionally obtained from the same Google provider that
  // Firebase Auth uses. The separate, in-memory Firebase Auth instance on web
  // prevents an email/password user from being signed out or switched while they
  // grant Calendar permission.
  const connectGoogleCalendar = async () => {
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle({
        skipNativeAuth: true,
        // This flow returns a fresh scoped Calendar token for an already
        // authorized account, so refresh works after an app restart.
        useCredentialManager: false,
        scopes: [GOOGLE_CALENDAR_READONLY_SCOPE],
      });
      const accessToken = result.credential?.accessToken;
      if (!accessToken) throw new Error("Google did not return Calendar access.");
      return accessToken;
    }

    const calendarAppName = "committed-calendar-oauth";
    const calendarApp = getApps().find((app) => app.name === calendarAppName)
      ?? initializeApp(firebaseApp.options, calendarAppName);
    const calendarAuth = getAuth(calendarApp);
    const provider = new GoogleAuthProvider();
    provider.addScope(GOOGLE_CALENDAR_READONLY_SCOPE);

    try {
      const result = await signInWithPopup(calendarAuth, provider);
      const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
      if (!accessToken) throw new Error("Google did not return Calendar access.");
      return accessToken;
    } finally {
      await signOutSecondaryAuth(calendarAuth);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, connectGoogleCalendar, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
