import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/training-dashboard.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
const schedule = { exports: {} };
new Function("module", "exports", ts.transpileModule(fs.readFileSync(new URL("../src/lib/workout-schedule.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(schedule, schedule.exports);
new Function("require", "module", "exports", compiled)((name) => { if (name === "@/lib/workout-schedule") return schedule.exports; throw new Error(name); }, loaded, loaded.exports);
const { weeklyTraining, todayTraining, filterTrainingHistory, groupTrainingHistory, latestRoutineSessions, nextScheduledWorkout, latestTrainingRecords, trainingPreview } = loaded.exports;
const session = (id, day, type = "workout", seconds = 600) => ({
  id, userId: "owner", sessionType: type, workoutId: "routine", workoutNameSnapshot: "Upper body", status: "completed",
  completedDate: day, completedAt: new Date(`${day}T12:00:00`).getTime(), durationSeconds: seconds,
  startedAt: new Date(`${day}T12:00:00`).getTime() - seconds * 1000,
  exercises: [{ exerciseId: "row", exerciseNameSnapshot: "Chest-Supported Row", sets: [] }], stretches: [], personalRecords: [],
});
const routine = (id, scheduledDays = []) => ({ id, name: id, description: "", scheduledDays, exercises: [], sortOrder: 0 });

test("scheduled days allow any saved selection and retain today's completed workout before tomorrow", () => {
  const workouts = [routine("today", [0]), routine("tomorrow", [1]), routine("unscheduled")];
  const done = { ...session("done", "2026-09-07"), workoutId: "today" };
  assert.equal(trainingPreview(workouts, [], "2026-09-07").workout.id, "today");
  assert.equal(trainingPreview(workouts, [done], "2026-09-07").workout.id, "today");
  assert.equal(trainingPreview(workouts, [done], "2026-09-07", "unscheduled").workout.id, "unscheduled");
  assert.equal(trainingPreview(workouts, [done], "2026-09-08").workout.id, "tomorrow");
});

test("recaps use actual sessions, ignore other types and future dates, and persist after midnight", () => {
  const done = session("done", "2026-09-07");
  const logs = [session("old", "2026-09-06"), done, session("future", "2026-09-10"), session("activity", "2026-09-08", "activity"), { ...done, id: "draft", status: "active" }];
  const original = structuredClone(logs);
  assert.equal(loaded.exports.latestWorkoutRecap(logs, "routine", "2026-09-07"), done);
  assert.equal(loaded.exports.latestWorkoutRecap(logs, "routine", "2026-09-08"), done);
  assert.equal(loaded.exports.latestWorkoutRecap(logs, "missing", "2026-09-08"), undefined);
  assert.deepEqual(logs, original);
});

test("rest-day coaching defaults to the next scheduled workout and allows unscheduled selections", () => {
  const workouts = [routine("freestyle"), routine("push", [0]), routine("pull", [2])];
  const original = structuredClone(workouts);
  assert.deepEqual(trainingPreview(workouts, [], "2026-09-06"), { workout: workouts[1], label: "Up next · Tomorrow" });
  assert.deepEqual(trainingPreview(workouts, [], "2026-09-06", "freestyle"), { workout: workouts[0], label: "Selected workout" });
  assert.equal(trainingPreview(workouts, [], "2026-09-06", "deleted").workout.id, "push");
  assert.deepEqual(workouts, original);
});

test("without a schedule coaching uses recent saved routines, then routine order, with a true empty state", () => {
  const workouts = [{ ...routine("first"), sortOrder: 2 }, { ...routine("second"), sortOrder: 1 }];
  const history = [{ ...session("old", "2026-09-04"), workoutId: "first" }, { ...session("deleted", "2026-09-05"), workoutId: "removed" }];
  assert.equal(trainingPreview(workouts, history, "2026-09-06").workout.id, "first");
  assert.equal(trainingPreview(workouts, [], "2026-09-06").workout.id, "second");
  assert.equal(trainingPreview([], history, "2026-09-06"), null);
});

test("up next skips completed strength workouts, respects schedule order, and rolls into the next week", () => {
  const workouts = [routine("first", [6]), { ...routine("second", [6]), sortOrder: 1 }, routine("unscheduled")];
  const done = { ...session("done", "2026-09-06"), workoutId: "first" };
  assert.equal(nextScheduledWorkout(workouts, [done], "2026-09-06").workout.id, "second");
  assert.equal(nextScheduledWorkout(workouts, [{ ...done, sessionType: "activity" }], "2026-09-06").workout.id, "first");
  const upcoming = nextScheduledWorkout(workouts, [done, { ...done, workoutId: "second" }], "2026-09-06");
  assert.equal(upcoming.day, "2026-09-13");
  assert.equal(upcoming.workout.id, "first");
  assert.equal(nextScheduledWorkout([routine("monday", [0])], [], "2026-09-06").label, "Tomorrow");
  assert.equal(nextScheduledWorkout([routine("unscheduled")], [], "2026-09-06"), null);
});

test("sidebar records show the latest three distinct exercises by performed date", () => {
  const older = { ...session("older", "2026-08-31"), personalRecords: [{ exerciseId: "row", weightLbs: 100 }, { exerciseId: "curl" }, { exerciseId: "press" }, { exerciseId: "squat" }] };
  const newer = { ...session("newer", "2026-09-06"), personalRecords: [{ exerciseId: "row", weightLbs: 140 }] };
  const records = latestTrainingRecords([older, newer, { ...newer, status: "active" }, { ...newer, sessionType: "activity" }]);
  assert.deepEqual(records.map(({ record }) => record.exerciseId), ["row", "curl", "press"]);
  assert.equal(records[0].record.weightLbs, 140);
  assert.equal(records[0].session.id, "newer");
});

test("weekly totals include today and multiple lifting sessions, with separate activity and stretching totals", () => {
  const logs = [session("mon", "2026-09-07"), session("tue1", "2026-09-08", "workout", 1200), session("tue2", "2026-09-08", "workout", 1800), session("walk", "2026-09-08", "activity", 900), session("stretch", "2026-09-08", "stretch", 300)];
  logs[2].personalRecords = [{ exerciseId: "row" }, { exerciseId: "bench" }];
  logs.push(session("past", "2026-09-06"), session("future", "2026-09-09"), { ...session("draft", "2026-09-08"), status: "active" });
  const original = structuredClone(logs);
  const result = weeklyTraining(logs, "2026-09-08");
  assert.deepEqual(result.workouts, { count: 3, seconds: 3600 });
  assert.deepEqual(result.activities, { count: 1, seconds: 900 });
  assert.deepEqual(result.stretching, { count: 1, seconds: 300 });
  assert.equal(result.prs, 2);
  assert.deepEqual(result.days.map((day) => day.count), [1, 2, 0, 0, 0, 0, 0]);
  assert.equal(result.days[1].today, true);
  assert.deepEqual(logs, original);
});

test("week and year boundaries use local calendar days, including backdated entries", () => {
  const backdated = { ...session("previous", "2025-12-31"), entryMode: "previous", createdAt: Date.now() };
  const result = weeklyTraining([backdated, session("sun", "2025-12-28"), session("jan", "2026-01-01")], "2026-01-04");
  assert.equal(result.workouts.count, 2);
  assert.equal(result.days[0].day, "2025-12-29");
  assert.equal(result.days[6].day, "2026-01-04");
  assert.equal(weeklyTraining([session("sunday", "2026-01-04")], "2026-01-05").workouts.count, 0);
  assert.equal(weeklyTraining([], "2026-03-09").days[0].day, "2026-03-09");
});

test("all today's routines are shown and completion requires a matching strength workout", () => {
  const workouts = [routine("one", [1]), routine("two", [1]), routine("three", [2]), routine("unscheduled")];
  const activity = { ...session("activity", "2026-09-08", "activity"), workoutId: "two" };
  const logs = [{ ...session("completed", "2026-09-08"), workoutId: "one" }, activity];
  const result = todayTraining(workouts, logs, "2026-09-08");
  assert.deepEqual(result.todayWorkouts.map((item) => [item.workout.id, item.completed]), [["one", true], ["two", false]]);
  assert.equal(workouts.length, 4);
  assert.deepEqual(todayTraining(workouts, logs, "2026-09-09").todayWorkouts.map((item) => item.workout.id), ["three"]);
});

test("recent routines include unscheduled saved workouts, deduplicate sessions, and exclude deleted routines", () => {
  const workouts = [routine("one"), routine("two"), routine("three"), routine("four"), routine("unused")];
  const logs = ["one", "two", "three", "four", "one", "deleted"].map((id, index) => ({ ...session(String(index), `2026-09-0${index + 1}`), workoutId: id }));
  const result = todayTraining(workouts, logs, "2026-09-08");
  assert.deepEqual(result.recent.map((item) => item.id), ["one", "four", "three"]);
  assert.equal(latestRoutineSessions(logs)["workout:one"].id, "4");
  assert.deepEqual(result.todayWorkouts, []);
});

test("history search combines type and PR filters and finds exercise or stretch names", () => {
  const lifting = session("lift", "2026-09-08"); lifting.personalRecords = [{ exerciseId: "row" }];
  const activity = { ...session("walk", "2026-09-07", "activity"), workoutNameSnapshot: "Evening walk", exercises: [] };
  const stretch = { ...session("stretch", "2026-08-31", "stretch"), workoutNameSnapshot: "Unwind", exercises: [], stretches: [{ stretchNameSnapshot: "Figure-Four Stretch" }] };
  const logs = [stretch, activity, lifting, { ...lifting, id: "draft", status: "active" }];
  assert.deepEqual(filterTrainingHistory(logs, "  CHEST-supported ", "workout", true).map((item) => item.id), ["lift"]);
  assert.deepEqual(filterTrainingHistory(logs, "figure-four", "all", false).map((item) => item.id), ["stretch"]);
  assert.deepEqual(filterTrainingHistory(logs, "evening", "activity", false).map((item) => item.id), ["walk"]);
  assert.deepEqual(filterTrainingHistory(logs, "", "activity", true), []);
  assert.deepEqual(filterTrainingHistory(logs, "no match", "all", false), []);
  assert.deepEqual(groupTrainingHistory(filterTrainingHistory(logs, "", "all", false)).map((group) => [group.month, group.sessions.map((item) => item.id)]), [["2026-09", ["lift", "walk"]], ["2026-08", ["stretch"]]]);
});
