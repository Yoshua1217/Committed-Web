import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
process.env.TZ = "America/Edmonton";
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)((id) => { if (id in mocks) return mocks[id]; throw new Error(id); }, mod, mod.exports);
  return mod.exports;
}
const schedule = load("workout-schedule");
const coaching = load("workout-coaching", { "@/lib/workout-rep-range": load("workout-rep-range") });
const dashboard = load("training-dashboard", { "@/lib/workout-schedule": schedule });
const calendar = load("workout-calendar", { "@/lib/workout-schedule": schedule, "@/lib/workout-coaching": coaching });
const routine = (id, days, times = {}, order = 0) => ({ id, userId: "alice", name: id, description: "", scheduledDays: days, scheduledStartTimes: times, sortOrder: order, exercises: [{ exerciseId: "press", plannedSets: 3, plannedReps: 10, sortOrder: 0 }] });

test("schedule normalization preserves selected valid times and drops cleared days or invalid times", () => {
  assert.deepEqual(schedule.normalizeWorkoutTimes([0, 2, 5], { 0: "06:30", 1: "08:00", 2: "24:00", 5: "18:05" }), { 0: "06:30", 5: "18:05" });
  assert.deepEqual(schedule.normalizeWorkoutTimes([], { 0: "06:30" }), {});
  assert.deepEqual(schedule.normalizeWorkoutTimes([0], undefined), {});
  assert.equal(schedule.workoutScheduleSummary(routine("blank", [])), "Not scheduled");
  assert.match(schedule.workoutScheduleSummary(routine("legacy", [0])), /Mon · Any time/);
  assert.match(schedule.workoutScheduleSummary(routine("shared", [0, 2], { 0: "18:00", 2: "18:00" })), /^Mon, Wed · /);
  assert.match(schedule.workoutScheduleSummary(routine("mixed", [0, 5], { 0: "18:00" })), /Sat · Any time/);
});

test("Train and Up next order timed workouts before untimed ones, keep overdue work, and skip completions", () => {
  const workouts = [routine("untimed", [0], {}, 0), routine("late", [0], { 0: "18:00" }, 1), routine("early", [0], { 0: "06:00" }, 2), routine("tie", [0], { 0: "06:00" }, 3)];
  assert.deepEqual(dashboard.todayTraining(workouts, [], "2026-09-07").todayWorkouts.map((item) => item.workout.id), ["early", "tie", "late", "untimed"]);
  const done = { userId: "alice", status: "completed", sessionType: "workout", workoutId: "early", completedDate: "2026-09-07", completedAt: 1 };
  assert.equal(dashboard.nextScheduledWorkout(workouts, [done], "2026-09-07").workout.id, "tie");
  assert.equal(dashboard.nextScheduledWorkout(workouts, [], "2026-09-06").workout.id, "early");
});

test("calendar derives local timed and all-day occurrences with stable IDs and no unscheduled entries", () => {
  const workouts = [routine("timed", [0, 5], { 0: "18:00", 5: "10:00" }), routine("any", [0]), routine("none", [])];
  const before = structuredClone(workouts);
  const events = calendar.workoutCalendarOccurrences(workouts, [], new Date(2026, 8, 7), new Date(2026, 8, 13));
  assert.equal(events.length, 3);
  assert.equal(new Date(events.find((e) => e.workoutId === "timed").start.dateTime).getHours(), 18);
  assert.deepEqual(events.find((e) => e.workoutId === "any").start, { date: "2026-09-07" });
  assert.ok(events.every((e) => e.locked && e.calendarId === "committed-workouts"));
  assert.deepEqual(workouts, before);
  assert.equal(calendar.workoutCalendarOccurrences([], [], new Date(2026, 8, 7), new Date(2026, 8, 13)).length, 0);
});

test("calendar includes previous-day blocks crossing midnight and completes only the matching workout/date/owner", () => {
  const workout = routine("night", [6], { 6: "23:50" });
  const history = [{ id: "done", userId: "alice", workoutId: "night", status: "completed", sessionType: "workout", completedDate: "2026-09-06", completedAt: 1, durationSeconds: 3600, exercises: [{ sets: [{}, {}, {}] }] }];
  const events = calendar.workoutCalendarOccurrences([workout], history, new Date(2026, 8, 7), new Date(2026, 8, 7));
  assert.equal(events.length, 1);
  assert.equal(events[0].estimatedMinutes, 60);
  assert.equal(new Date(events[0].end.dateTime).getDate(), 7);
  assert.equal(events[0].completed, true);
  assert.equal(calendar.workoutCalendarOccurrences([workout], [{ ...history[0], userId: "other" }], new Date(2026, 8, 6), new Date(2026, 8, 6))[0].completed, false);
});

test("recurring local times survive DST and month-grid adjacent dates; schedule edits regenerate entries", () => {
  const workout = routine("Sunday", [6], { 6: "08:00" });
  const events = calendar.workoutCalendarOccurrences([workout], [], new Date(2026, 2, 1), new Date(2026, 2, 15));
  assert.deepEqual(events.map((e) => new Date(e.start.dateTime).getHours()), [8, 8, 8]);
  assert.notEqual(new Date(events[0].start.dateTime).getTimezoneOffset(), new Date(events[1].start.dateTime).getTimezoneOffset());
  const grid = calendar.workoutCalendarOccurrences([workout], [], new Date(2026, 7, 31), new Date(2026, 9, 11));
  assert.ok(grid.some((e) => e.scheduledDate === "2026-10-11"));
  const edited = calendar.workoutCalendarOccurrences([{ ...workout, scheduledDays: [0], scheduledStartTimes: { 0: "09:00" } }], [], new Date(2026, 8, 7), new Date(2026, 8, 13));
  assert.equal(edited.length, 1);
  assert.equal(edited[0].scheduledDate, "2026-09-07");
});

test("one-occurrence time overrides affect only that date, including calendar and Train ordering", () => {
  const workout = { ...routine("weekly", [0], { 0: "11:00" }), scheduledTimeOverrides: { "2026-09-07": "16:00" } };
  assert.equal(schedule.workoutTimeOn(workout, "2026-09-07"), "16:00");
  assert.equal(schedule.workoutTimeOn(workout, "2026-09-14"), "11:00");
  assert.match(schedule.workoutScheduleSummary(workout), /11:00/);
  const other = routine("other", [0], { 0: "12:00" });
  assert.equal(dashboard.nextScheduledWorkout([workout, other], [], "2026-09-07").workout.id, "other");
  assert.deepEqual(dashboard.todayTraining([workout, other], [], "2026-09-07").todayWorkouts.map((item) => item.workout.id), ["other", "weekly"]);
  const events = calendar.workoutCalendarOccurrences([workout], [], new Date(2026, 8, 7), new Date(2026, 8, 14));
  assert.deepEqual(events.map((event) => new Date(event.start.dateTime).getHours()), [16, 11]);
  assert.equal(schedule.workoutTimeOn({ ...workout, scheduledTimeOverrides: {} }, "2026-09-07"), "11:00");
  assert.deepEqual(schedule.normalizeWorkoutTimeOverrides({ bad: "10:00", "2026-09-07": "25:00" }), {});
});

test("saving a single occurrence writes only that date and restoring deletes only its override", async () => {
  const writes = [];
  const service = load("workout-schedule-service", { "@/lib/firebase": { db: {} }, "@/lib/workout-schedule": schedule, "firebase/firestore": { doc: (_db, collection, id) => `${collection}/${id}`, deleteField: () => "DELETE", updateDoc: async (ref, value) => { writes.push({ ref, value }); } } });
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const workout = routine("weekly", [(now.getDay() + 6) % 7]);
  await service.saveWorkoutOccurrenceTime(workout, date, "16:30");
  assert.deepEqual(Object.keys(writes[0].value).sort(), [`scheduledTimeOverrides.${date}`, "updatedAt"].sort());
  assert.equal(writes[0].value[`scheduledTimeOverrides.${date}`], "16:30");
  await service.saveWorkoutOccurrenceTime(workout, date, null);
  assert.equal(writes[1].value[`scheduledTimeOverrides.${date}`], "DELETE");
  await assert.rejects(service.saveWorkoutOccurrenceTime(workout, "2020-01-01", "09:00"));
  await assert.rejects(service.saveWorkoutOccurrenceTime(workout, date, "25:00"));
  assert.equal(writes.length, 2);
});
