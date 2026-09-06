import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Exercise actual TypeScript modules with isolated Firestore/Google boundaries.
// No account, credentials, network, or new test dependency is required.
function load(file, mocks = {}) {
  const filename = path.resolve(fileURLToPath(new URL("../", import.meta.url)), file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}
const planning = load("src/lib/task-planning.ts");
const base = (patch = {}) => ({ id: "task-a", userId: "user-a", type: "task", title: "Write report", description: "Draft and review", priority: "medium", projectId: "project-a", goalId: "", dueDate: "2026-09-30", dueDateTime: "2026-09-30T23:59", dueAllDay: true, startDateTime: "2026-09-08T09:00", startAllDay: false, estimatedMinutes: 120, completed: false, completedAt: null, archived: false, notificationDateTime: null, sortOrder: 0, createdAt: 1, ...patch });

const dropping = load("src/lib/task-calendar-drop.ts", { "@/lib/task-planning": planning });
test("task drops select the right day, snap to a quarter hour, and preserve estimated duration", () => {
  const days = [new Date(2026, 8, 7), new Date(2026, 8, 8)];
  const task = base({ startAllDay: true, estimatedMinutes: 90 });
  // A negative grid top represents a vertically scrolled calendar.
  const block = dropping.taskDropBlock(task, days, { left: 300, top: -200, width: 400 }, 610, 218, 45);
  assert.equal(planning.localDateTime(block.start), "2026-09-08T09:15");
  assert.equal(planning.localDateTime(block.end), "2026-09-08T10:45");
  const saved = dropping.scheduleDroppedTask(task, block.start);
  assert.deepEqual(saved, { ...task, startDateTime: "2026-09-08T09:15", startAllDay: false });
});

test("late task drops remain on the chosen date and can span midnight", () => {
  const block = dropping.taskDropBlock(base({ startDateTime: null }), [new Date(2026, 8, 7)], { left: 0, top: 0, width: 200 }, 50, 1079, 45);
  assert.equal(planning.localDateTime(block.start), "2026-09-07T23:45");
  assert.equal(planning.localDateTime(block.end), "2026-09-08T01:45");
});

test("outside drops and tasks no longer eligible cannot schedule", () => {
  const task = base({ startDateTime: null });
  const days = [new Date(2026, 8, 7)];
  const bounds = { left: 300, top: 100, width: 400 };
  for (const [x, y] of [[299, 200], [700, 200], [400, 99], [400, 1180], [NaN, 200]]) {
    assert.equal(dropping.taskDropBlock(task, days, bounds, x, y, 45), null);
  }
  for (const patch of [{ completed: true }, { deleted: true }, { archived: true }, { estimatedMinutes: 0 }, { startDateTime: "2026-09-08T09:00" }]) {
    assert.equal(dropping.taskDropBlock({ ...task, ...patch }, days, bounds, 400, 200, 45), null);
    assert.throws(() => dropping.scheduleDroppedTask({ ...task, ...patch }, days[0]));
  }
});

test("project goals override a task goal, including projects with no goal", () => {
  const task = base({ goalId: "personal-goal" });
  const projects = [{ id: "project-a", goalId: "project-goal" }, { id: "project-b", goalId: "other-goal" }];
  assert.equal(planning.taskGoalId(task, projects), "project-goal");
  assert.equal(planning.taskGoalId({ ...task, projectId: "project-b" }, projects), "other-goal");
  assert.equal(planning.taskGoalId(task, [{ id: "project-a", goalId: "" }]), "");
  assert.equal(planning.taskGoalId({ ...task, projectId: "" }, projects), "personal-goal");
});

function taskServiceHarness() {
  let project = { id: "project-a", userId: "user-a", goalId: "project-goal" };
  let taskListener;
  let projectListener;
  let taskUnsubscribed = false;
  let projectUnsubscribed = false;
  let saved;
  const service = load("src/lib/tasks-service.ts", {
    "@/lib/firebase": { db: {} },
    "@/lib/task-planning": planning,
    "@/lib/projects-service": { subscribeToProjects: (_user, callback) => { projectListener = callback; return () => { projectUnsubscribed = true; }; } },
    "firebase/firestore": {
      collection: () => ({}), query: () => ({}), where: () => ({}), doc: (_db, collection, id) => ({ collection, id }),
      onSnapshot: (_query, callback) => { taskListener = callback; return () => { taskUnsubscribed = true; }; },
      setDoc: async (_ref, data) => { saved = data; },
      runTransaction: async (_db, action) => action({
        get: async () => ({ exists: () => !!project, data: () => project }),
        set: (_ref, data, options) => { assert.equal(options.merge, true); saved = data; },
      }),
    },
  });
  return {
    service,
    get saved() { return saved; },
    get unsubscribed() { return taskUnsubscribed && projectUnsubscribed; },
    changeProject: (value) => { project = value; },
    emitProjects: (value) => projectListener(value),
    emitTasks: (value) => taskListener({ docs: value.map((task) => ({ id: task.id, data: () => task })) }),
  };
}

test("task subscriptions update existing tasks when the project goal changes or clears", () => {
  const h = taskServiceHarness();
  const received = [];
  const unsubscribe = h.service.subscribeToTasks("user-a", (tasks) => received.push(tasks));
  h.emitProjects([{ id: "project-a", goalId: "first-goal" }]);
  h.emitTasks([base({ goalId: "outdated-goal" })]);
  assert.equal(received.at(-1)[0].goalId, "first-goal");
  h.emitProjects([{ id: "project-a", goalId: "second-goal" }]);
  assert.equal(received.at(-1)[0].goalId, "second-goal");
  h.emitProjects([{ id: "project-a", goalId: "" }]);
  assert.equal(received.at(-1)[0].goalId, "");
  unsubscribe();
  assert.equal(h.unsubscribed, true);
});

test("saving a project task persists the latest project goal even from a stale editor", async () => {
  const h = taskServiceHarness();
  await h.service.saveTask(base({ goalId: "stale-goal" }));
  assert.equal(h.saved.goalId, "project-goal");
  assert.equal(h.saved.projectId, "project-a");
  h.changeProject({ id: "project-a", userId: "user-a", goalId: "" });
  await h.service.saveTask(base({ goalId: "stale-goal" }));
  assert.equal(h.saved.goalId, "");
  await h.service.saveTask(base({ projectId: "", goalId: "independent-goal" }));
  assert.equal(h.saved.goalId, "independent-goal");
});

test("saving rejects an unavailable or foreign project without writing a task", async () => {
  const h = taskServiceHarness();
  h.changeProject(null);
  await assert.rejects(h.service.saveTask(base()), /project is unavailable/);
  h.changeProject({ id: "project-a", userId: "someone-else", goalId: "private-goal" });
  await assert.rejects(h.service.saveTask(base()), /project is unavailable/);
  assert.equal(h.saved, undefined);
});

test("project progress weights two hours and ten minutes by effort, not task count", () => {
  const stats = planning.projectProgress([base(), base({ id: "small", estimatedMinutes: 10, completed: true })]);
  assert.equal(stats.percent, 8);
  assert.equal(stats.totalMinutes, 130);
  assert.equal(stats.completedMinutes, 10);
  assert.equal(stats.finished, false);
});
test("missing estimates remain explicit; completing them never fabricates time", () => {
  const stats = planning.projectProgress([base({ completed: true }), base({ estimatedMinutes: null })]);
  assert.equal(stats.percent, 100);
  assert.equal(stats.unestimated, 1);
  assert.equal(stats.finished, false);
  assert.equal(planning.projectProgress([]).percent, 0);
});
test("all-day and dateless estimated tasks wait for blocks; completed, archived, and unestimated tasks do not", () => {
  assert.equal(planning.isUnscheduledTask(base({ startAllDay: true })), true);
  assert.equal(planning.isUnscheduledTask(base({ startDateTime: null })), true);
  for (const patch of [{ completed: true }, { archived: true }, { deleted: true }, { estimatedMinutes: null }, { estimatedMinutes: 0 }, { type: "todo" }]) {
    assert.equal(planning.isUnscheduledTask(base({ startDateTime: null, ...patch })), false);
  }
});
test("a work block crosses midnight without consuming the time until the deadline", () => {
  const task = base({ startDateTime: "2026-09-08T23:30" });
  const block = planning.taskBlock(task);
  assert.equal(block.end - block.start, 120 * 60_000);
  assert.equal(block.end.getDate(), 9);
  assert.equal(task.dueDate, "2026-09-30");
  assert.equal(planning.taskBlock(base({ startAllDay: true })), null);
  assert.equal(planning.taskBlock(base({ startDateTime: "invalid" })), null);
});

function harness(initial = base()) {
  let task = structuredClone(initial);
  const events = new Map();
  const calls = [];
  let afterInsert;
  let failInsert = false;
  let failDelete = false;
  class ApiError extends Error { constructor(status) { super(`Google ${status}`); this.status = status; } }
  const snapshot = () => ({ id: initial.id, exists: () => !!task, data: () => structuredClone(task) });
  const store = {
    collection: () => ({}), query: () => ({}), where: () => ({}), doc: () => ({}),
    getDocs: async () => ({ docs: task ? [snapshot()] : [] }), getDoc: async () => snapshot(),
    updateDoc: async (_ref, patch) => { task = { ...task, ...structuredClone(patch) }; },
    deleteDoc: async () => { task = null; },
    runTransaction: async (_db, action) => action({ get: async () => snapshot(), update: (_ref, patch) => { task = { ...task, ...structuredClone(patch) }; }, delete: () => { task = null; } }),
  };
  const api = {
    GoogleCalendarApiError: ApiError,
    getGoogleEvent: async (_token, calendar, id) => { const event = events.get(`${calendar}:${id}`); if (!event) throw new ApiError(404); return structuredClone(event); },
    insertGoogleEvent: async (_token, calendar, event) => {
      calls.push(["insert", calendar, event.id]);
      const key = `${calendar}:${event.id}`;
      if (events.has(key)) throw new ApiError(409);
      events.set(key, structuredClone(event));
      if (afterInsert) afterInsert();
      if (failInsert) { failInsert = false; throw new Error("Connection dropped after insert"); }
      return event;
    },
    patchGoogleEvent: async (_token, calendar, id, patch) => { calls.push(["patch", calendar, id]); const key = `${calendar}:${id}`; if (!events.has(key)) throw new ApiError(404); events.set(key, { ...events.get(key), ...structuredClone(patch) }); },
    deleteGoogleEvent: async (_token, calendar, id) => { calls.push(["delete", calendar, id]); if (failDelete) throw new ApiError(503); if (!events.delete(`${calendar}:${id}`)) throw new ApiError(404); },
  };
  const { syncTaskCalendar } = load("src/lib/task-calendar-sync.ts", { "firebase/firestore": store, "@/lib/firebase": { db: {} }, "@/lib/tasks-service": { taskFromFirestore: (id, data) => ({ ...data, id }) }, "@/lib/task-planning": planning, "@/lib/google-calendar-api": api });
  return { sync: (calendar = "work") => syncTaskCalendar("user-a", "test-token", calendar), events, calls, get task() { return task; }, change: (patch) => { task = { ...task, ...patch }; }, dropInsertResponse: () => { failInsert = true; }, failDeletion: () => { failDelete = true; }, afterInsert: (fn) => { afterInsert = fn; } };
}

test("sync exports exactly the estimated block; repeated refreshes do not duplicate it", async () => {
  const h = harness(); await h.sync(); await h.sync();
  assert.equal(h.events.size, 1);
  assert.equal(h.calls.filter(([kind]) => kind === "insert").length, 1);
  const event = [...h.events.values()][0];
  assert.equal(new Date(event.end.dateTime) - new Date(event.start.dateTime), 120 * 60_000);
  assert.equal(h.task.dueDate, "2026-09-30");
});
test("a lost insert response retries the reserved event rather than duplicating it", async () => {
  const h = harness(); h.dropInsertResponse();
  await assert.rejects(h.sync(), /Connection dropped/);
  const reserved = h.task.calendarLink.eventId;
  await h.sync();
  assert.equal(h.events.size, 1);
  assert.equal(h.task.calendarLink.eventId, reserved);
  assert.notEqual(h.task.calendarLink.fingerprint, "");
});
test("task rename, completion and duration edits patch their existing event", async () => {
  const h = harness(); await h.sync();
  h.change({ title: "Final report", completed: true, estimatedMinutes: 30 }); await h.sync();
  const event = [...h.events.values()][0];
  assert.equal(event.summary, "✓ Final report");
  assert.equal(new Date(event.end.dateTime) - new Date(event.start.dateTime), 30 * 60_000);
  assert.equal(h.events.size, 1);
});
test("Google moves and resizes pull back into the task without moving its deadline", async () => {
  const h = harness(); await h.sync();
  const event = [...h.events.values()][0];
  event.start.dateTime = new Date("2026-09-10T14:00").toISOString();
  event.end.dateTime = new Date("2026-09-10T14:45").toISOString();
  await h.sync();
  assert.equal(h.task.startDateTime, "2026-09-10T14:00");
  assert.equal(h.task.estimatedMinutes, 45);
  assert.equal(h.task.dueDate, "2026-09-30");
});
test("unscheduling deletes the event, keeps the estimate, and re-scheduling reserves a fresh ID", async () => {
  const h = harness(); await h.sync(); const original = h.task.calendarLink.eventId;
  h.change({ startAllDay: true }); await h.sync();
  assert.equal(h.events.size, 0); assert.equal(h.task.estimatedMinutes, 120);
  h.change({ startAllDay: false }); await h.sync();
  assert.notEqual(h.task.calendarLink.eventId, original); assert.equal(h.events.size, 1);
});
test("Google deletion returns unchanged tasks to the unscheduled queue", async () => {
  const h = harness(); await h.sync(); h.events.clear(); await h.sync();
  assert.equal(h.task.calendarLink, null); assert.equal(planning.isUnscheduledTask(h.task), true);
});
test("a deleted Google event with a newer local edit receives a fresh ID", async () => {
  const h = harness(); await h.sync(); const original = h.task.calendarLink.eventId;
  h.events.clear(); h.change({ startDateTime: "2026-09-12T10:00" }); await h.sync();
  assert.notEqual(h.task.calendarLink.eventId, original); assert.equal(h.events.size, 1);
});
test("changing calendar mapping cleans up the old event", async () => {
  const h = harness(); await h.sync(); await h.sync("personal");
  assert.equal(h.events.size, 1); assert.equal(h.task.calendarLink.calendarId, "personal");
  await h.sync(null); assert.equal(h.events.size, 0); assert.equal(h.task.calendarLink, null);
});
test("failed deletion retains its tombstone and event link for retry", async () => {
  const h = harness(); await h.sync(); h.change({ deleted: true }); h.failDeletion();
  await assert.rejects(h.sync(), /503/);
  assert.equal(h.task.deleted, true); assert.ok(h.task.calendarLink); assert.equal(h.events.size, 1);
});
test("successful task deletion cleans up its event and tombstone", async () => {
  const h = harness(); await h.sync(); h.change({ deleted: true }); await h.sync();
  assert.equal(h.task, null); assert.equal(h.events.size, 0);
});
test("edits made during a Google write survive and are synced on the next pass", async () => {
  const h = harness(); h.afterInsert(() => h.change({ title: "New title while syncing" }));
  await h.sync(); assert.equal(h.task.title, "New title while syncing");
  await h.sync(); assert.equal([...h.events.values()][0].summary, "New title while syncing");
});
