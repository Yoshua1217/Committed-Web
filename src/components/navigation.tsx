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
  { label: "Calendar", path: "/dashboard/calendar", icon: "calendar" },
  { label: "Overview", path: "/dashboard/overview", icon: "overview" },
  { label: "Habits", path: "/dashboard/habits", icon: "habit" },
  { label: "Tasks", path: "/dashboard/tasks", icon: "task" },
  { label: "Projects", path: "/dashboard/ideas", icon: "project" },
  { label: "Tools", path: "/dashboard/tools", icon: "tools" },
  { label: "Workouts", path: "/dashboard/workouts", icon: "workouts" },
  { label: "Notes", path: "/dashboard/notes", icon: "notes" },
];

const mobileNavPaths = [
  "/dashboard",
  "/dashboard/calendar",
  "/dashboard/workouts",
  "/dashboard/habits",
  "/dashboard/ideas",
];

const mobileNavItems: NavItem[] = mobileNavPaths.map(
  (path) => navItems.find((item) => item.path === path) as NavItem
);

const mobileOverflowNavItems = navItems.filter(
  (item) => !mobileNavPaths.includes(item.path)
);

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
    case "project":
      return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /><path d="M6.5 9v9H14M6.5 12H18V9" /><rect x="14" y="3" width="7" height="6" rx="1" /></svg>;
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
    case "calendar":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
          <line x1="16" y1="2.5" x2="16" y2="6.5" />
          <line x1="8" y1="2.5" x2="8" y2="6.5" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
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
          <path d="M9 4h6" />
          <path d="M9 3a2 2 0 0 0-2 2v1H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2V5a2 2 0 0 0-2-2" />
          <rect x="8" y="3" width="8" height="4" rx="1" />
          <path d="m7.5 13 2 2 3.5-4" />
          <path d="M14 14h3" />
          <path d="M14 18h3" />
        </svg>
      );
    case "idea":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 4.5A3 3 0 0 0 4 6.2a3.4 3.4 0 0 0-1.5 5.5A3.1 3.1 0 0 0 4 17a3.3 3.3 0 0 0 5.5 2.4V4.5Z" />
          <path d="M14.5 4.5A3 3 0 0 1 20 6.2a3.4 3.4 0 0 1 1.5 5.5A3.1 3.1 0 0 1 20 17a3.3 3.3 0 0 1-5.5 2.4V4.5Z" />
          <path d="M9.5 8H7.8a1.8 1.8 0 0 0-1.7 2.4M14.5 8h1.7a1.8 1.8 0 0 1 1.7 2.4M9.5 14H8a2 2 0 0 0-1.8 1.1M14.5 14H16a2 2 0 0 1 1.8 1.1" />
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
    case "notes":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M4 4.5v17" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
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
      className="sidebar-nav-button flex items-center justify-center"
      aria-label={label}
      title={label}
      style={{
        width: 40,
        height: 40,
        padding: 0,
        borderRadius: 13,
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
    </button>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const settingsActive = pathname === "/dashboard/settings";

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 h-full w-16 z-40"
        style={{
          backgroundColor: "var(--surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-center"
          style={{ padding: "18px 0 8px" }}
        >
          <Image 
            src={logoPic} 
            alt="Committed Logo" 
            width={38}
            height={38}
            loading="eager"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        </div>

        {/* Nav Items */}
        <nav
          aria-label="Primary navigation"
          className="flex-1 flex flex-col items-center"
          style={{ padding: "0 12px", gap: 6 }}
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
              paddingTop: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            {/* Settings */}
            <SidebarNavButton
              label="Settings"
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
            </SidebarNavButton>

            {/* Sign Out */}
            <SignOutButton onClick={signOut} />
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      {mobileMoreOpen && (
        <>
          <button
            type="button"
            className="mobile-nav-drawer-scrim md:hidden"
            aria-label="Close more navigation"
            onClick={() => setMobileMoreOpen(false)}
            style={{
              position: "fixed",
              zIndex: 45,
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 0,
              border: 0,
              background: "rgba(0, 0, 0, .22)",
            }}
          />
          <div
            className="mobile-nav-drawer md:hidden"
            role="menu"
            aria-label="More navigation"
            style={{
              position: "fixed",
              zIndex: 50,
              right: "calc(8px + var(--app-safe-right))",
              bottom: "calc(76px + var(--app-safe-bottom))",
              width: "min(208px, calc(100vw - 32px))",
              display: "grid",
              gap: 3,
              padding: 7,
              border: "1px solid var(--border)",
              borderRadius: 17,
              background: "var(--surface)",
              boxShadow: "0 16px 42px rgba(0, 0, 0, .34)",
            }}
          >
            {mobileOverflowNavItems.map((item) => {
              const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
              return (
                <button
                  key={item.path}
                  type="button"
                  role="menuitem"
                  className={active ? "active" : ""}
                  onClick={() => {
                    setMobileMoreOpen(false);
                    router.push(item.path);
                  }}
                  style={{
                    width: "100%",
                    minHeight: 43,
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "8px 10px",
                    border: 0,
                    borderRadius: 11,
                    background: active ? "var(--surface-variant)" : "transparent",
                    color: active ? "var(--primary)" : "var(--secondary)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 750 : 650,
                    textAlign: "left",
                  }}
                >
                  <NavIcon icon={item.icon} active={active} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
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
        <button
          type="button"
          className="mobile-nav-item mobile-nav-more flex flex-col items-center justify-center"
          aria-label={mobileMoreOpen ? "Close more navigation" : "Open more navigation"}
          aria-expanded={mobileMoreOpen}
          onClick={() => setMobileMoreOpen((open) => !open)}
          style={{
            gap: 4,
            padding: "5px 8px",
            background: "none",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 24, color: "var(--secondary)" }} aria-hidden="true">
            {mobileMoreOpen ? "keyboard_arrow_down" : "keyboard_arrow_up"}
          </span>
          <span style={{ fontSize: 11, color: "var(--secondary)", fontWeight: 500 }}>More</span>
        </button>
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
      className="sidebar-nav-button flex items-center justify-center"
      aria-label="Sign out"
      title="Sign out"
      style={{
        width: 40,
        height: 40,
        padding: 0,
        borderRadius: 13,
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
    </button>
  );
}
