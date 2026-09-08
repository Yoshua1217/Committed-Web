import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/reminder-plan.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { buildReminderPlan } = module.exports;
const habit = { id: "same-id", name: "Walk", reminderTime: "09:15", monday: true, friday: true, completionType: "checkbox", pausePeriods: [] };
const task = { id: "same-id", title: "Call", type: "task", notificationDateTime: "2026-09-07T14:30" };

test("habit rules preserve weekdays, pauses, and local times without a finite scheduling horizon", () => {
  const pauses = [{ startedOn: "2026-09-08", endedOn: null }];
  const [rule] = buildReminderPlan([{ ...habit, pausePeriods: pauses }], [], []);
  assert.deepEqual(rule.days, [2, 6]);
  assert.equal(rule.time, "09:15");
  assert.deepEqual(rule.pauses, pauses);
});

test("task and habit identities never collide and edits replace their existing rule", () => {
  const rules = buildReminderPlan([habit], [task], []);
  assert.deepEqual(rules.map((rule) => rule.key), ["habit:same-id", "task:same-id"]);
  const edited = buildReminderPlan([], [{ ...task, notificationDateTime: "2026-09-08T15:45" }], []);
  assert.equal(edited[0].key, rules[1].key);
  assert.equal(edited[0].time, "2026-09-08T15:45");
});

test("deleted habits and completed, archived, deleted, unscheduled, and todo tasks cancel", () => {
  assert.deepEqual(buildReminderPlan([{ ...habit, deletedOn: "2026-09-07" }], [], []), []);
  for (const patch of [{ completed: true }, { archived: true }, { deleted: true }, { notificationDateTime: null }, { type: "todo" }]) {
    assert.deepEqual(buildReminderPlan([], [{ ...task, ...patch }], []), []);
  }
  assert.equal(buildReminderPlan([], [{ ...task, completed: false }], []).length, 1);
});

test("habit completion suppresses only the completed date, including full counters and timers", () => {
  const completion = { habitId: habit.id, date: "2026-09-07", completed: true };
  assert.deepEqual(buildReminderPlan([habit], [], [completion])[0].completedDates, ["2026-09-07"]);
  assert.deepEqual(buildReminderPlan([habit], [], [{ ...completion, completed: false }])[0].completedDates, []);
  for (const [type, target, progress] of [["counter", "counterGoal", "counterValue"], ["timer", "timerGoalSeconds", "timerSeconds"]]) {
    assert.deepEqual(buildReminderPlan([{ ...habit, completionType: type, [target]: 10 }], [], [{ ...completion, completed: false, [progress]: 10 }])[0].completedDates, ["2026-09-07"]);
  }
});

test("bad time strings and disabled weekdays don't reach the native scheduler", () => {
  for (const time of ["", "25:00", "09:70", "9:00"]) assert.deepEqual(buildReminderPlan([{ ...habit, reminderTime: time }], [], []), []);
  assert.deepEqual(buildReminderPlan([{ ...habit, monday: false, friday: false }], [], []), []);
  assert.deepEqual(buildReminderPlan([], [{ ...task, notificationDateTime: "2026-09-07T25:00" }], []), []);
});

test("subscription errors preserve native reminder inputs instead of publishing empty lists", () => {
  const sourceErrors = [];
  const firestore = {
    collection: () => ({}), query: () => ({}), where: () => ({}),
    onSnapshot: (_query, _next, error) => { sourceErrors.push(error); return () => {}; },
  };
  const load = (file, mocks) => {
    const js = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const result = { exports: {} };
    new Function("require", "module", "exports", js)((name) => {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    }, result, result.exports);
    return result.exports;
  };
  const mocks = { "firebase/firestore": firestore, "@/lib/firebase": { db: {} }, "@/lib/habit-history": {},
    "@/lib/projects-service": { subscribeToProjects: () => () => {} }, "@/lib/task-planning": {} };
  const habits = load("src/lib/habits-service.ts", mocks);
  const tasks = load("src/lib/tasks-service.ts", mocks);
  let published = 0;
  let failed = 0;
  const next = () => { published++; };
  const error = () => { failed++; };
  habits.subscribeToHabits("user", next, { onError: error, keepPreviousOnError: true });
  habits.subscribeToCompletionsForDate("user", "2026-09-07", next, error);
  tasks.subscribeToTasks("user", next, false, error);
  const originalError = console.error;
  try {
    console.error = () => {};
    for (const fail of sourceErrors) fail(new Error("Disconnected"));
  } finally { console.error = originalError; }
  assert.equal(failed, 3);
  assert.equal(published, 0);
});
