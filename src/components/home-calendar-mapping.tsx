"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readLocalCalendarSyncCache, subscribeToCalendarSync, saveHomeEventLayer, type SyncedGoogleCalendar } from "@/lib/calendar-sync-service";
import MaterialIcon from "@/components/material-icon";

export default function HomeCalendarMapping({ userId }: { userId: string }) {
  const [calendars, setCalendars] = useState<SyncedGoogleCalendar[]>([]);
  const [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => subscribeToCalendarSync(userId, (preferences, cloud) => {
    const local = readLocalCalendarSyncCache(userId);
    const cache = local && (!cloud || local.savedAt > cloud.savedAt) ? local : cloud;
    setCalendars(cache?.calendars ?? []);
    setSelected(preferences.featureCalendarMappings.homeEvents ?? "");
    setLoaded(true);
  }), [userId]);
  async function select(value: string) {
    setSaving(true); setMessage("");
    try { await saveHomeEventLayer(userId, value || null); setSelected(value); setMessage("Home event layer saved."); }
    catch { setMessage("Couldn’t save the layer. Please try again."); }
    finally { setSaving(false); }
  }
  return <section id="home-events" style={{ scrollMarginTop: 24, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", marginBottom: 24 }}>
    <div className="flex items-center gap-3"><MaterialIcon name="calendar_today" size={22} /><div><h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Home event layer</h2><p style={{ fontSize: 12, color: "var(--secondary)", margin: "4px 0 0" }}>Choose which calendar layer supplies today’s events on Home.</p></div></div>
    <label htmlFor="home-event-layer" style={{ display: "block", fontSize: 12, fontWeight: 600, marginTop: 18 }}>Calendar layer</label>
    <select id="home-event-layer" value={selected} disabled={!loaded || saving} onChange={(event) => void select(event.target.value)} style={{ width: "100%", padding: 12, marginTop: 8, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-variant)", color: "var(--primary)" }}>
      <option value="">Don’t show events</option>
      {selected && !calendars.some((calendar) => calendar.id === selected) && <option value={selected}>Selected layer unavailable — sync Calendar</option>}
      {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>)}
    </select>
    <p role="status" style={{ fontSize: 12, color: "var(--secondary)", margin: "10px 0 0" }}>{saving ? "Saving…" : message || "Changes save automatically. Calendar visibility is unchanged."}</p>
    {loaded && !calendars.length && <p style={{ fontSize: 13, margin: "12px 0 0" }}><Link href="/dashboard/calendar" style={{ textDecoration: "underline" }}>Connect or sync Google Calendar</Link> to load your layers.</p>}
  </section>;
}
