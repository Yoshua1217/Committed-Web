import { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { taskFromFirestore } from "@/lib/tasks-service";
import type { Task } from "@/lib/types";
import { localDateTime, taskBlock, taskCalendarFingerprint } from "@/lib/task-planning";
import { deleteGoogleEvent, getGoogleEvent, GoogleCalendarApiError, insertGoogleEvent, patchGoogleEvent } from "@/lib/google-calendar-api";
import type { SyncedGoogleCalendarEvent } from "@/lib/calendar-sync-service";

const inFlight = new Map<string, Promise<void>>();
const absent = (error: unknown) => error instanceof GoogleCalendarApiError && (error.status === 404 || error.status === 410);

/** Reconcile linked work blocks on refresh. Unsaved local changes take priority.
 * Reservations survive failed requests so retries cannot insert duplicate events.
 * Only sync-owned metadata is written after network calls; concurrent edits survive.
 */
export function syncTaskCalendar(userId: string, token: string, calendarId: string | null): Promise<void> {
  const previous = inFlight.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => reconcile(userId, token, calendarId));
  inFlight.set(userId, next);
  void next.finally(() => { if (inFlight.get(userId) === next) inFlight.delete(userId); }).catch(() => {});
  return next;
}

async function reconcile(userId: string, token: string, calendarId: string | null) {
  const snapshots = await getDocs(query(collection(db, "tasks"), where("userId", "==", userId)));
  for (const snapshot of snapshots.docs) {
    // Refresh before each request in case another task changed during this pass.
    const ref = doc(db, "tasks", snapshot.id);
    const latest = await getDoc(ref);
    if (!latest.exists()) continue;
    const task = taskFromFirestore(latest.id, latest.data());
    let link = task.calendarLink;
    const block = taskBlock(task);
    const shouldExport = !!block && !task.archived && !task.deleted && !!calendarId;
    if (link && (!shouldExport || link.calendarId !== calendarId)) {
      try { await deleteGoogleEvent(token, link.calendarId, link.eventId, "none"); } catch (error) { if (!absent(error)) throw error; }
      await updateDoc(ref, { calendarLink: null });
      link = null;
    }
    if (task.deleted) { await deleteDoc(ref); continue; }
    if (!shouldExport || !block || !calendarId) continue;
    const fingerprint = taskCalendarFingerprint(task);
    let remote: SyncedGoogleCalendarEvent | null = null;
    if (link) {
      try { remote = await getGoogleEvent(token, link.calendarId, link.eventId); } catch (error) { if (!absent(error)) throw error; }
      if (remote?.status === "cancelled") remote = null;
      // A previously synced event deleted in Google returns the task to planning.
      if (!remote && link.fingerprint === fingerprint) {
        await updateIfUnchanged(task, { startDateTime: null, startAllDay: false, calendarLink: null });
        continue;
      }
      if (!remote && link.fingerprint) {
        // Google retains deleted event IDs. A newer local schedule needs a new ID.
        await updateDoc(ref, { calendarLink: null });
        link = null;
      }
      if (remote && link?.fingerprint === fingerprint) {
        const remoteStart = remote.start?.dateTime;
        const remoteEnd = remote.end?.dateTime;
        const duration = remoteStart && remoteEnd ? Math.round((new Date(remoteEnd).getTime() - new Date(remoteStart).getTime()) / 60_000) : 0;
        const title = (remote.summary ?? task.title).replace(/^✓ /, "");
        const pulled = { ...task, title, description: remote.description ?? "", startDateTime: remoteStart ? localDateTime(new Date(remoteStart)) : remote.start?.date ? `${remote.start.date}T00:00` : null, startAllDay: !remoteStart, estimatedMinutes: duration > 0 ? duration : task.estimatedMinutes };
        if (taskCalendarFingerprint(pulled) !== fingerprint) {
          await updateIfUnchanged(task, { title: pulled.title, description: pulled.description, startDateTime: pulled.startDateTime, startAllDay: pulled.startAllDay, estimatedMinutes: pulled.estimatedMinutes ?? null, calendarLink: { ...link, fingerprint: taskCalendarFingerprint(pulled) } });
        }
        continue;
      }
    }
    if (!link) {
      const candidate = { calendarId, eventId: crypto.randomUUID().replaceAll("-", ""), fingerprint: "" };
      // Multiple devices use the same reserved Google ID.
      link = await runTransaction(db, async (transaction) => {
        const fresh = await transaction.get(ref);
        if (!fresh.exists() || fresh.data().deleted) return null;
        const existing = fresh.data().calendarLink as Task["calendarLink"];
        if (existing) return existing;
        transaction.update(ref, { calendarLink: candidate });
        return candidate;
      });
      if (!link) continue;
    }
    const payload = { summary: `${task.completed ? "✓ " : ""}${task.title}`, description: task.description, start: { dateTime: block.start.toISOString() }, end: { dateTime: block.end.toISOString() }, extendedProperties: { private: { committedTaskId: task.id } } };
    if (remote) {
      await patchGoogleEvent(token, link.calendarId, link.eventId, payload, "none", remote.etag);
    } else {
      try { await insertGoogleEvent(token, link.calendarId, { ...payload, id: link.eventId }); }
      catch (error) {
        if (!(error instanceof GoogleCalendarApiError) || error.status !== 409) throw error;
        // The reserved insert succeeded earlier, but its acknowledgement was lost.
        await patchGoogleEvent(token, link.calendarId, link.eventId, payload, "none");
      }
    }
    await updateDoc(ref, { calendarLink: { ...link, fingerprint } });
  }
}

async function updateIfUnchanged(task: Task, patch: Record<string, unknown>) {
  const ref = doc(db, "tasks", task.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const current = taskFromFirestore(snapshot.id, snapshot.data());
    if (taskCalendarFingerprint(current) === taskCalendarFingerprint(task)) transaction.update(ref, patch);
  });
}
