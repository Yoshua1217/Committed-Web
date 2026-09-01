"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import logoPic from "../../public/logo.png";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: "Home", path: "/dashboard", icon: "home" },
  { label: "Overview", path: "/dashboard/overview", icon: "overview" },
  { label: "Habits", path: "/dashboard/habits", icon: "habit" },
  { label: "Tools", path: "/dashboard/tools", icon: "tools" },
  { label: "Workouts", path: "/dashboard/workouts", icon: "workouts" },
];

const mobileNavItems: NavItem[] = [
  navItems[0],
  navItems[4],
  navItems[2],
  navItems[3],
  navItems[1],
];

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? "var(--primary)" : "var(--secondary)";

  switch (icon) {
    case "home":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "bucket":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 7h20l-2 13H4L2 7z" />
          <path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "goal":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );
    case "overview":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 17.5h7" />
          <path d="M17.5 14v7" />
        </svg>
      );
    case "habit":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "task":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="12" y2="17" />
        </svg>
      );
    case "tools":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "workouts":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9v6" />
          <path d="M7 6v12" />
          <path d="M7 12h10" />
          <path d="M17 6v12" />
          <path d="M20 9v6" />
        </svg>
      );
    case "ai":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarNavButton({
  label,
  icon,
  active,
  onClick,
  children,
  style,
}: {
  label?: string;
  icon?: string;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3"
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        fontSize: 14,
        backgroundColor: active
          ? "var(--surface-variant)"
          : hovered
          ? "var(--surface-variant)"
          : "transparent",
        color: active ? "var(--primary)" : "var(--secondary)",
        fontWeight: active ? 700 : 500,
        transition: "background-color 0.15s ease, color 0.15s ease",
        border: "none",
        cursor: "pointer",
        opacity: hovered && !active ? 0.85 : 1,
        ...style,
      }}
    >
      {icon && <NavIcon icon={icon} active={active} />}
      {children}
      {label}
    </button>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  const settingsActive = pathname === "/dashboard/settings";

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 z-40"
        style={{
          backgroundColor: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3"
          style={{ padding: "32px 24px" }}
        >
          <Image 
            src={logoPic} 
            alt="Committed Logo" 
            width={34}
            height={34}
            style={{
              borderRadius: 10,
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: "var(--primary)",
              margin: 0,
            }}
          >
            Committed
          </h1>
        </div>

        {/* Nav Items */}
        <nav
          className="flex-1 flex flex-col"
          style={{ padding: "0 12px", gap: 4 }}
        >
          {navItems.map((item) => {
            const active =
              pathname === item.path ||
              (item.path !== "/dashboard" && pathname.startsWith(item.path));
            return (
              <SidebarNavButton
                key={item.path}
                label={item.label}
                icon={item.icon}
                active={active}
                onClick={() => router.push(item.path)}
              />
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: "0 12px 20px" }}>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {/* Settings */}
            <SidebarNavButton
              active={settingsActive}
              onClick={() => router.push("/dashboard/settings")}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </SidebarNavButton>

            {/* Sign Out */}
            <SignOutButton onClick={signOut} />
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Primary navigation"
        className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center"
        style={{
          backgroundColor: "var(--surface)",
          borderTop: "1px solid var(--border)",
          padding: "8px 8px calc(8px + var(--app-safe-bottom))",
        }}
      >
        {mobileNavItems.map((item) => {
          const active =
            pathname === item.path ||
            (item.path !== "/dashboard" && pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className="mobile-nav-item flex flex-col items-center justify-center"
              style={{
                gap: 4,
                padding: "5px 8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <NavIcon icon={item.icon} active={active} />
              <span
                style={{
                  fontSize: 11,
                  color: active ? "var(--primary)" : "var(--secondary)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {item.label}
              </span>
              {/* Active dot indicator */}
              {active && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: "var(--primary)",
                    position: "absolute",
                    bottom: -2,
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function SignOutButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3"
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        fontSize: 14,
        fontWeight: 500,
        color: "var(--error)",
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        transition: "opacity 0.15s ease",
        opacity: hovered ? 0.7 : 1,
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      Sign Out
    </button>
  );
}
