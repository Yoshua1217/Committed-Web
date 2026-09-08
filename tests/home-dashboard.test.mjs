import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

process.env.TZ = "America/Edmonton";
const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/home-dashboard.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { homeTasks, homeEvents, recentHomeNotes } = module.exports;
const task = (id, changes = {}) => ({ id, type: "task", completed: false, archived: false, priority: "medium", sortOrder: 0, dueDate: null, startDateTime: null, dueDateTime: null, ...changes });
const event = (id, start, end, changes = {}) => ({ id, calendarId: "personal", start, end, ...changes });
const today = "2026-09-06";

test("Home separates overdue and today's work without duplicates or inactive tasks", () => {
  const result = homeTasks([
    task("overdue", { dueDate: "2026-09-01", startDateTime: "2026-09-06T09:00" }),
    task("due-today", { dueDateTime: "2026-09-06T17:00" }),
    task("planned-today", { startDateTime: "2026-09-06T10:00", dueDate: "2026-09-10" }),
    task("unscheduled"), task("future", { dueDate: "2026-09-07" }),
    ...["completed", "archived", "deleted"].map((field) => task(field, { [field]: true, dueDate: "2026-09-01" })),
  ], today);
  assert.deepEqual(result.overdue.map((item) => item.id), ["overdue"]);
  assert.deepEqual(result.today.map((item) => item.id), ["due-today", "planned-today"]);
});

test("Home interprets offset task times on the local day and honors legacy date-only tasks", () => {
  const result = homeTasks([task("local-today", { dueDateTime: "2026-09-07T02:00:00Z" }), task("legacy", { dueDate: "2026-09-05" }), task("invalid", { dueDateTime: "bad date" })], today);
  assert.deepEqual(result.today.map((item) => item.id), ["local-today"]);
  assert.deepEqual(result.overdue.map((item) => item.id), ["legacy"]);
});

test("Events honor the mapped layer, exclusive all-day ends, midnight overlaps and cancellations", () => {
  const events = [
    event("all-day", { date: today }, { date: "2026-09-07" }),
    event("multi-day", { date: "2026-09-05" }, { date: "2026-09-08" }),
    event("ended", { date: "2026-09-05" }, { date: today }),
    event("overnight", { dateTime: "2026-09-05T23:30:00-06:00" }, { dateTime: "2026-09-06T01:00:00-06:00" }),
    event("ends-midnight", { dateTime: "2026-09-05T23:00:00-06:00" }, { dateTime: "2026-09-06T00:00:00-06:00" }),
    event("tomorrow", { dateTime: "2026-09-07T00:00:00-06:00" }, { dateTime: "2026-09-07T01:00:00-06:00" }),
    event("meeting", { dateTime: "2026-09-06T18:00:00Z" }, { dateTime: "2026-09-06T19:00:00Z" }),
    event("cancelled", { date: today }, { date: "2026-09-07" }, { status: "cancelled" }),
    event("other-layer", { date: today }, { date: "2026-09-07" }, { calendarId: "work" }),
  ];
  assert.deepEqual(homeEvents([...events, events[0]], "personal", today).map((item) => item.id), ["multi-day", "all-day", "overnight", "meeting"]);
  assert.deepEqual(homeEvents(events, null, today), []);
});

test("Events use local calendar days across the daylight-saving transition", () => {
  const events = [event("late", { dateTime: "2026-11-02T06:30:00Z" }, { dateTime: "2026-11-02T06:45:00Z" }), event("next", { dateTime: "2026-11-02T07:00:00Z" }, { dateTime: "2026-11-02T07:15:00Z" })];
  assert.deepEqual(homeEvents(events, "personal", "2026-11-01").map((item) => item.id), ["late"]);
});

test("Recent notes are the latest five edits regardless of manual notebook ordering", () => {
  const notes = Array.from({ length: 8 }, (_, i) => ({ id: String(i), updatedAt: i * 100, createdAt: i, sortOrder: 8 - i }));
  const original = [...notes];
  assert.deepEqual(recentHomeNotes(notes).map((item) => item.id), ["7", "6", "5", "4", "3"]);
  assert.deepEqual(notes, original);
  assert.deepEqual(recentHomeNotes([]), []);
});
