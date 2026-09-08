import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}

const history = load("src/lib/habit-history.ts");
const streaks = load("src/lib/streak-calculator.ts", { "@/lib/habit-history": history });
const base = (patch = {}) => ({
  id: "habit-a", userId: "user-a", name: "Read", iconName: "Book", bucketId: "", goalId: "",
  completionType: "checkbox", counterIncrement: 1, counterGoal: 10, timerGoalSeconds: 300,
  monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true,
  reminderTime: null, sortOrder: 0, createdAt: new Date(2026, 8, 1, 21).getTime(), pausePeriods: [], ...patch,
});
const completion = (patch = {}) => ({ id: "completion-a", habitId: "habit-a", userId: "user-a", date: "2026-09-02", completed: true, counterValue: 0, timerSeconds: 0, completedAt: 1, ...patch });

test("new habits repair every earlier denominator, including with stray completions", () => {
  const reading = base();
  const laptop = base({ id: "laptop", createdAt: new Date(2026, 8, 6, 23).getTime() });
  const entries = [completion(), completion({ habitId: "laptop" })];
  const day = history.habitDay([reading, laptop], entries, "2026-09-02");
  assert.equal(day.percentage, 100);
  assert.deepEqual(day.habits.map((habit) => habit.id), ["habit-a"]);
  assert.equal(streaks.isScheduledForDate(laptop, "2026-09-05"), false);
  assert.equal(streaks.isScheduledForDate(laptop, "2026-09-06"), true);
});

test("name, schedule, type and targets remain frozen across multiple edits", () => {
  const original = base({ completionType: "counter", createdOn: "2026-09-01" });
  const entries = [completion({ completed: false, counterValue: 5 })];
  const baseline = history.habitDay([original], entries, "2026-09-02");
  const edited = history.preserveHabitHistory(original, { ...original, name: "New name", counterGoal: 20, wednesday: false }, "2026-09-03");
  const converted = history.preserveHabitHistory(edited, { ...edited, completionType: "timer", timerGoalSeconds: 600 }, "2026-09-06");
  assert.deepEqual(history.habitDay([converted], entries, "2026-09-02"), baseline);
  assert.equal(baseline.percentage, 50);
  assert.equal(history.habitForDate(converted, "2026-09-04").counterGoal, 20);
  assert.equal(history.habitForDate(converted, "2026-09-06").completionType, "timer");
});

test("pause and resume retain completed days and exclude only paused dates", () => {
  const original = base();
  const paused = history.preserveHabitHistory(original, { ...original, pausePeriods: [{ startedOn: "2026-09-03", endedOn: null }] }, "2026-09-03");
  const resumed = history.preserveHabitHistory(paused, { ...paused, pausePeriods: [{ startedOn: "2026-09-03", endedOn: "2026-09-05" }] }, "2026-09-06");
  for (const habit of [paused, resumed]) assert.equal(history.habitDay([habit], [completion()], "2026-09-02").percentage, 100);
  for (const date of ["2026-09-03", "2026-09-04", "2026-09-05"]) assert.equal(streaks.isScheduledForDate(resumed, date), false);
  assert.equal(streaks.isScheduledForDate(resumed, "2026-09-06"), true);
  assert.equal(history.habitDay([resumed], [completion({ date: "2026-09-03" })], "2026-09-03").percentage, 100);
});

test("same-day pause/resume and stale form history never overwrite frozen versions", () => {
  const original = base();
  const paused = history.preserveHabitHistory(original, { ...original, pausePeriods: [{ startedOn: "2026-09-06", endedOn: null }] }, "2026-09-06");
  const resumed = history.preserveHabitHistory(paused, { ...original, history: {} }, "2026-09-06");
  assert.deepEqual(resumed.history, paused.history);
  assert.equal(streaks.isScheduledForDate(resumed, "2026-09-06"), true);
  assert.equal(Object.keys(resumed.history).length, 1);
  assert.equal("history" in resumed.history["2026-09-06"], false);
});

test("deletion preserves both completed and missed habits, even when all are deleted", () => {
  const original = base();
  const deleted = history.preserveHabitHistory(original, { ...original, deletedOn: "2026-09-06" }, "2026-09-06");
  assert.equal(history.habitDay([deleted], [completion()], "2026-09-02").percentage, 100);
  assert.equal(history.habitDay([deleted], [], "2026-09-03").scheduled, 1);
  assert.equal(history.habitDay([deleted], [completion({ date: "2026-09-06" })], "2026-09-06").scheduled, 0);
  assert.throws(() => history.preserveHabitHistory(deleted, original, "2026-09-07"), /deleted/);
});

test("creation and deletion on one day never add a habit to earlier days", () => {
  const created = history.preserveHabitHistory(null, base(), "2026-09-06");
  const deleted = history.preserveHabitHistory(created, { ...created, deletedOn: "2026-09-06" }, "2026-09-06");
  assert.deepEqual(deleted.history, {});
  assert.equal(history.habitForDate(deleted, "2026-09-05"), null);
  assert.equal(history.habitForDate(deleted, "2026-09-06"), null);
});

test("timer fractions and explicit manual completion use a consistent percentage", () => {
  const timer = base({ completionType: "timer", timerGoalSeconds: 300 });
  assert.equal(history.habitDay([timer], [completion({ completed: false, timerSeconds: 75 })], "2026-09-02").percentage, 25);
  assert.equal(history.habitDay([timer], [completion()], "2026-09-02").percentage, 100);
  assert.equal(history.habitDay([], [], "2026-09-02").percentage, 0);
});

test("known creation dates remain stable, and unknown legacy dates are not invented", () => {
  const habit = base({ createdOn: "2026-08-31" });
  const edited = history.preserveHabitHistory(habit, { ...habit, createdOn: "2026-09-06", createdAt: 9 }, "2026-09-06");
  assert.equal(edited.createdOn, "2026-08-31");
  assert.equal(edited.createdAt, habit.createdAt);
  assert.equal(history.habitForDate(base({ createdAt: 0 }), "2025-01-01").name, "Read");
  assert.equal(streaks.isScheduledForDate(habit, "2026-02-31"), false);
});

function harness(initial = []) {
  const records = new Map(initial.map((habit) => [`habits/${habit.id}`, structuredClone(habit)]));
  const writes = [];
  const snap = (ref) => ({ id: ref.split("/").at(-1), exists: () => records.has(ref), data: () => structuredClone(records.get(ref)) });
  const persist = (ref, data) => {
    // Firestore rejects undefined recursively, including inside historical snapshots.
    const check = (item) => { assert.notEqual(item, undefined); if (item && typeof item === "object") Object.values(item).forEach(check); };
    check(data); records.set(ref, structuredClone(data)); writes.push(ref);
  };
  const firestore = {
    doc: (_, col, id) => `${col}/${id}`, collection: (_, col) => col, where: () => null, query: (col) => col,
    runTransaction: async (_, action) => action({ get: async (ref) => snap(ref), set: persist }),
    getDoc: async (ref) => snap(ref), setDoc: async (ref, data) => persist(ref, data),
    getDocs: async () => ({ docs: [] }),
    onSnapshot: (col, callback) => { callback({ docs: [...records.keys()].filter((key) => key.startsWith(`${col}/`)).map(snap) }); return () => {}; },
  };
  const service = load("src/lib/habits-service.ts", { "@/lib/firebase": { db: {} }, "@/lib/habit-history": history, "firebase/firestore": firestore });
  return { service, records, writes };
}

test("service transaction preserves persisted history and serializes legacy defaults", async () => {
  const original = base();
  const h = harness([original]);
  await h.service.saveHabit({ ...original, name: "Renamed" });
  const saved = h.records.get("habits/habit-a");
  assert.equal(saved.history[history.localDateString()].name, "Read");
  await h.service.saveHabit({ ...original, name: "Another name", history: {} });
  assert.deepEqual(h.records.get("habits/habit-a").history, saved.history);
});

test("service creates a local start date, soft-deletes, and hides deleted habits only in active lists", async () => {
  const h = harness([base()]);
  await h.service.createHabit(base({ id: "new" }));
  assert.equal(h.records.get("habits/new").createdOn, history.localDateString());
  await h.service.deleteHabit("habit-a");
  assert.ok(h.records.has("habits/habit-a"));
  let active, all;
  h.service.subscribeToHabits("user-a", (items) => { active = items; });
  h.service.subscribeToHabits("user-a", (items) => { all = items; }, { includeDeleted: true });
  assert.deepEqual(active.map((habit) => habit.id), ["new"]);
  assert.equal(all.length, 2);
  await assert.rejects(h.service.saveHabit(base()), /deleted/);
  const writeCount = h.writes.length;
  await h.service.deleteHabit("habit-a");
  assert.equal(h.writes.length, writeCount);
});

test("all completion entry points reject closed days; delayed mapping makes no writes", async () => {
  const h = harness([base()]);
  for (const date of ["2000-01-01", "2999-01-01"]) {
    await assert.rejects(h.service.saveCompletion(completion({ date })), /frozen/);
    await assert.rejects(h.service.toggleCheckbox(base(), date, null), /frozen/);
    await assert.rejects(h.service.incrementCounter(base(), date, null), /frozen/);
    await assert.rejects(h.service.addTimerSeconds(base(), date, null, 60), /frozen/);
    assert.equal(await h.service.markHabitComplete("user-a", "habit-a", date), null);
  }
  assert.equal(h.writes.length, 0);
  await h.service.saveCompletion(completion({ date: history.localDateString() }));
  assert.equal(h.writes.length, 1);
});

test("streak calculation keeps the old schedule when today's weekdays change", () => {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const date = history.localDateString(yesterday);
  const original = base({ createdAt: 1 });
  const renamed = history.preserveHabitHistory(original, { ...original, monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false });
  assert.deepEqual(streaks.calculateStreak(renamed, [completion({ date })]), { currentStreak: 1, currentAntiStreak: 0 });
});


test("manual past corrections preserve the original roster and reject newly created habits", async () => {
  const original = base({ completionType: "counter", createdAt: 1 });
  const deleted = history.preserveHabitHistory(original, { ...original, deletedOn: history.localDateString() });
  const newer = history.preserveHabitHistory(null, base({ id: "new" }));
  const h = harness([deleted, newer]);
  await h.service.editHabitCompletion("user-a", "habit-a", "2026-09-02", true);
  let saved = h.records.get("habit_completions/habit-day-habit-a-2026-09-02");
  assert.equal(history.habitDay([deleted, newer], [saved], "2026-09-02").percentage, 100);
  const frozen = structuredClone(h.records.get("habits/habit-a"));
  h.records.set("habit_completions/habit-day-habit-a-2026-09-02", { ...saved, counterValue: 10 });
  await h.service.editHabitCompletion("user-a", "habit-a", "2026-09-02", false, saved.id);
  saved = h.records.get("habit_completions/habit-day-habit-a-2026-09-02");
  const corrected = history.habitDay([deleted, newer], [saved], "2026-09-02");
  assert.equal(corrected.percentage, 0);
  assert.equal(corrected.scheduled, 1);
  assert.equal(saved.counterValue, 0);
  assert.deepEqual(h.records.get("habits/habit-a"), frozen);
  await assert.rejects(h.service.editHabitCompletion("user-a", "new", "2026-09-02", true), /not part/);
  await assert.rejects(h.service.editHabitCompletion("user-a", "habit-a", "2999-01-01", true), /past date/);
  await assert.rejects(h.service.editHabitCompletion("user-a", "habit-a", "2026-02-31", true), /past date/);
});

test("unchecking an originally completed off-schedule habit keeps it in the day's denominator", async () => {
  const original = base({ createdAt: 1, wednesday: false, completionType: "timer" });
  const h = harness([original]);
  h.records.set("habit_completions/off-schedule", completion({ id: "off-schedule", timerSeconds: 300 }));
  await h.service.editHabitCompletion("user-a", "habit-a", "2026-09-02", false, "off-schedule");
  let saved = h.records.get("habit_completions/off-schedule");
  assert.equal(saved.timerSeconds, 0);
  assert.equal(history.habitDay([original], [saved], saved.date).scheduled, 1);
  assert.equal(history.habitDay([original], [saved], saved.date).percentage, 0);
  await h.service.editHabitCompletion("user-a", "habit-a", "2026-09-02", true, saved.id);
  saved = h.records.get("habit_completions/off-schedule");
  assert.equal(history.habitDay([original], [saved], saved.date).percentage, 100);
  await assert.rejects(h.service.editHabitCompletion("user-a", "habit-a", "2026-09-09", true), /not part|past date/);
});
