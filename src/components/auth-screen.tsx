"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isCreateMode) {
        if (password.length < 6) {
          setError("Password must be at least 6 characters");
          setLoading(false);
          return;
        }
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Invalid email or password");
      } else if (code === "auth/email-already-in-use") {
        setError("Account already exists");
      } else if (code === "auth/weak-password") {
        setError("Password too weak — use at least 6 characters");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your connection");
      } else {
        setError("Something went wrong. Please try again");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== "auth/popup-closed-by-user") {
        setError("Google sign-in failed. Please try again");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backgroundColor: "var(--background)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo + Title */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: "var(--primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--primary)",
              marginBottom: 8,
            }}
          >
            Committed
          </h1>
          <p style={{ fontSize: 15, color: "var(--secondary)" }}>
            {isCreateMode ? "Create your account to get started" : "Welcome back. Stay on track."}
          </p>
        </div>

        {/* Card container */}
        <div
          style={{
            backgroundColor: "var(--surface)",
            borderRadius: 20,
            border: "1px solid var(--border)",
            padding: "32px 28px",
          }}
        >
          {/* Error */}
          {error && (
            <div
              style={{
                backgroundColor: "var(--error)",
                color: "#FFFFFF",
                padding: "12px 16px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          {/* Google Button — top of card for prominence */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              backgroundColor: "var(--surface-variant)",
              color: "var(--primary)",
              border: "1px solid var(--border)",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "24px 0",
              gap: 16,
            }}
          >
            <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              or
            </span>
            <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--secondary)", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 12,
                  fontSize: 14,
                  backgroundColor: "var(--background)",
                  color: "var(--primary)",
                  border: "1px solid var(--border)",
                  transition: "border-color 0.15s",
                }}
              />
            </div>

            <div style={{ marginBottom: 24, position: "relative" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--secondary)", marginBottom: 6 }}>
                Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isCreateMode ? "new-password" : "current-password"}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  paddingRight: 64,
                  borderRadius: 12,
                  fontSize: 14,
                  backgroundColor: "var(--background)",
                  color: "var(--primary)",
                  border: "1px solid var(--border)",
                  transition: "border-color 0.15s",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 12,
                  bottom: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--secondary)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: 6,
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 700,
                backgroundColor: "var(--primary)",
                color: "var(--background)",
                border: "none",
                cursor: loading || !email || !password ? "default" : "pointer",
                opacity: loading || !email || !password ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {loading ? "..." : isCreateMode ? "Create Account" : "Sign In"}
            </button>
          </form>
        </div>

        {/* Toggle mode */}
        <p
          style={{
            textAlign: "center",
            marginTop: 28,
            fontSize: 14,
            color: "var(--secondary)",
          }}
        >
          {isCreateMode ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => { setIsCreateMode(!isCreateMode); setError(""); }}
            style={{
              fontWeight: 700,
              color: "var(--primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              fontSize: 14,
            }}
          >
            {isCreateMode ? "Sign In" : "Create Account"}
          </button>
        </p>
      </div>
    </div>
  );
}
