"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { readLocalCalendarSyncCache, subscribeToCalendarSync, type GoogleCalendarCache, type SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";
import { listGoogleEvents } from "@/lib/google-calendar-api";
import { homeEvents } from "@/lib/home-dashboard";
import MaterialIcon from "@/components/material-icon";
import styles from "@/app/dashboard/home.module.css";

export default function HomeEvents({ userId, today }: { userId: string; today: string }) {
  const { connectGoogleCalendar } = useAuth();
  const [cache, setCache] = useState<GoogleCalendarCache | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState<{ calendarId: string; today: string; events: SyncedGoogleCalendarEvent[]; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => subscribeToCalendarSync(userId, (preferences, cloud) => {
    const local = readLocalCalendarSyncCache(userId);
    setCache(local && (!cloud || local.savedAt > cloud.savedAt) ? local : cloud);
    setCalendarId(preferences.featureCalendarMappings.homeEvents ?? null);
    setLoaded(true);
  }), [userId]);
  useEffect(() => {
    const onFocus = () => setRefresh((value) => value + 1);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(onFocus, 5 * 60_000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!calendarId) return;
    let cancelled = false;
    const token = storedToken(userId);
    if (!token) return;
    const from = new Date(`${today}T00:00:00`);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    const frame = requestAnimationFrame(() => { setBusy(true); setError(""); });
    void listGoogleEvents(token, calendarId, from.toISOString(), to.toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((events) => { if (!cancelled) setLive({ calendarId, today, events: events.map((event) => ({ ...event, calendarId })), at: Date.now() }); })
      .catch(() => { if (!cancelled) setError("Couldn’t refresh Google Calendar. Showing the last available events."); })
      .finally(() => { cancelAnimationFrame(frame); if (!cancelled) setBusy(false); });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [userId, calendarId, today, refresh]);
  async function refreshEvents() {
    setError("");
    if (!storedToken(userId)) {
      setBusy(true);
      try {
        const token = await connectGoogleCalendar();
        sessionStorage.setItem(`committed-google-calendar-write-token-v2:${userId}`, token);
        sessionStorage.setItem(`committed-google-calendar-write-token-time-v2:${userId}`, String(Date.now()));
      } catch { setError("Calendar wasn’t connected. You can try again or open Calendar."); setBusy(false); return; }
    }
    setRefresh((value) => value + 1);
  }
  const current = live?.calendarId === calendarId && live.today === today ? live : null;
  const events = homeEvents(current?.events ?? cache?.events ?? [], calendarId, today);
  const calendar = cache?.calendars.find((item) => item.id === calendarId);
  const savedAt = current?.at ?? cache?.savedAt;
  return <section className={styles.section} aria-labelledby="home-events-title">
    <div className={styles.sectionHeader}><h2 id="home-events-title">Today’s events {loaded && calendarId && <span className={styles.badge}>{events.length}</span>}</h2><Link className={styles.link} href="/dashboard/calendar">Calendar<MaterialIcon name="chevron_right" size={16} /></Link></div>
    <div className={styles.panel}>
      {!loaded ? <p className={styles.empty} role="status">Loading your calendar…</p> : !calendarId ? <div className={styles.empty}><strong>Your day, in one place</strong>Choose a calendar layer to bring today’s events here.<div className={styles.actions}><Link className={styles.secondary} href="/dashboard/settings#home-events"><MaterialIcon name="layers" size={17} />Choose event layer</Link></div></div>
        : <>
          <div className={styles.groupLabel}>{calendar?.summary ?? "Selected calendar layer"}</div>
          {events.length ? events.map((event) => <div className={styles.row} key={event.id}>
            <div className={styles.eventTime}>{event.start?.date ? "All day" : <>
              {new Date(event.start?.dateTime ?? "").toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              {event.end?.dateTime && <><br />– {new Date(event.end.dateTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>}
            </>}</div>
            <Link href="/dashboard/calendar" className={styles.rowButton}><span className={styles.title}>{event.summary || "Untitled event"}</span>{event.location && <span className={styles.meta}>{event.location}</span>}</Link>
            {event.hangoutLink?.startsWith("https://meet.google.com/") && <a className={styles.secondary} href={event.hangoutLink} target="_blank" rel="noreferrer">Join</a>}
          </div>) : <p className={styles.empty}>{busy ? "Checking today’s events…" : current ? "No events today. You have some breathing room." : "No events for today in your saved calendar. Refresh to check the latest."}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.footer}><span className={styles.meta}>{busy ? "Refreshing…" : savedAt ? `${current ? "Updated" : "Saved calendar"} · ${new Date(savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Sync Calendar to load events"}</span><div className="flex gap-3"><button className={styles.link} disabled={busy} onClick={() => void refreshEvents()}>Refresh</button></div></div>
        </>}
    </div>
  </section>;
}

function storedToken(userId: string) {
  try {
    const at = Number(sessionStorage.getItem(`committed-google-calendar-write-token-time-v2:${userId}`));
    return Date.now() - at < 50 * 60_000 ? sessionStorage.getItem(`committed-google-calendar-write-token-v2:${userId}`) : null;
  } catch { return null; }
}
