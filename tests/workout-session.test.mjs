import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, doc, writeBatch, terminate } from "firebase/firestore";

// Use the real SDK serializer without committing any writes or accessing a server.
const validationApp = initializeApp({ projectId: "demo-workout-serialization" }, "workout-serialization-test");
const validationDb = getFirestore(validationApp);
after(async () => { await terminate(validationDb); await deleteApp(validationApp); });
function validateWrite(path, value) {
  writeBatch(validationDb).set(doc(validationDb, path), value);
}

function load(file, mocks) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}

const catalogue = JSON.parse(fs.readFileSync(new URL("../src/data/exercise-catalogue.json", import.meta.url), "utf8"));
const stretchCatalogue = JSON.parse(fs.readFileSync(new URL("../src/data/stretching-catalogue.json", import.meta.url), "utf8"));
const coaching = load("src/lib/workout-coaching.ts", {});
const debrief = load("src/components/workout-debrief.tsx", {
  "react/jsx-runtime": jsxRuntime,
  "@/lib/workout-coaching": coaching,
  "@/components/material-icon": { default: () => null, __esModule: true },
  "./workout-coaching.module.css": {},
});
const records = load("src/lib/workout-personal-records.ts", {});
const { withHistoricalPersonalRecords } = records;
const recordsDropdown = load("src/components/workout-personal-records-dropdown.tsx", {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@/components/material-icon": { default: () => null, __esModule: true },
});
const builders = load("src/lib/workout-session.ts", { "@/data/exercise-catalogue.json": catalogue });
const { createWorkoutSession, createPreviousWorkoutSession, setPreviousWorkoutTiming, hasValidPreviousWorkoutTiming, addExercisesToSession, removeExerciseFromSession, hasWorkoutData, getPreviousSetSuggestion } = builders;
const workout = () => ({ id: "saved-routine", userId: "owner", name: "Upper body", description: "My routine", scheduledDays: [0, 3], sortOrder: 0, createdAt: 1, updatedAt: 1, exercises: [{ exerciseId: catalogue[0].id, sortOrder: 4, plannedSets: 2, plannedReps: 8 }] });

test("removing an added exercise preserves saved routines and other logged sets", () => {
  const preset = workout();
  const original = structuredClone(preset);
  const session = addExercisesToSession(createWorkoutSession("owner", preset), catalogue.slice(1, 3));
  session.exercises[0].sets[0].reps = 8;
  const next = removeExerciseFromSession(session, catalogue[1].id);
  assert.deepEqual(next.exercises, [session.exercises[0], session.exercises[2]]);
  assert.equal(session.exercises.length, 3);
  assert.deepEqual(preset, original);
  const withoutPresetExercise = removeExerciseFromSession(next, catalogue[0].id);
  assert.deepEqual(withoutPresetExercise.exercises, [session.exercises[2]]);
  assert.deepEqual(preset, original);
  assert.equal(createWorkoutSession("owner", preset).exercises[0].exerciseId, catalogue[0].id);
  assert.equal(removeExerciseFromSession(next, "missing"), next);
  const completed = { ...next, status: "completed" };
  assert.equal(removeExerciseFromSession(completed, catalogue[2].id), completed);
});

test("removing the last freestyle exercise leaves an empty session and allows re-adding it", () => {
  const session = addExercisesToSession(createWorkoutSession("owner"), [catalogue[0]]);
  session.exercises[0].sets[0].reps = 10;
  const empty = removeExerciseFromSession(session, catalogue[0].id);
  assert.deepEqual(empty.exercises, []);
  const addedAgain = addExercisesToSession(empty, [catalogue[0]]);
  assert.equal(addedAgain.exercises.length, 1);
  assert.equal(addedAgain.exercises[0].sets[0].reps, null);
  assert.notEqual(addedAgain.exercises[0].sets[0].id, session.exercises[0].sets[0].id);
});

test("blank workouts start active, empty, and independent of saved routines", () => {
  const first = createWorkoutSession("owner");
  const second = createWorkoutSession("owner");
  assert.equal(first.status, "active");
  assert.equal(first.sessionType, "workout");
  assert.equal(first.workoutNameSnapshot, "Freestyle workout");
  assert.deepEqual(first.exercises, []);
  assert.notEqual(first.workoutId, second.workoutId);
  assert.equal(first.completedAt, null);
  const added = addExercisesToSession(first, catalogue.slice(0, 3));
  assert.equal(added.exercises.length, 3);
  assert.deepEqual(added.exercises.map((exercise) => exercise.sortOrder), [0, 1, 2]);
  assert.equal(first.exercises.length, 0);
});

test("adding and logging exercises cannot change a saved routine or the next session", () => {
  const preset = workout();
  const original = structuredClone(preset);
  Object.freeze(preset.exercises[0]);
  Object.freeze(preset.exercises);
  Object.freeze(preset);
  const session = createWorkoutSession("owner", preset);
  session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], reps: 8, weightLbs: 45, completed: true };
  const next = addExercisesToSession(session, [catalogue[1], catalogue[2]]);
  assert.deepEqual(next.exercises[0], session.exercises[0]);
  assert.deepEqual(next.exercises.map((exercise) => exercise.sortOrder), [4, 5, 6]);
  assert.ok(next.exercises.slice(1).every((exercise) => exercise.addedDuringSession));
  assert.equal(next.exercises[0].addedDuringSession, undefined);
  assert.deepEqual(preset, original);
  const restarted = createWorkoutSession("owner", preset);
  assert.equal(restarted.exercises.length, 1);
  assert.equal(restarted.exercises[0].sets.length, 2);
  assert.equal(restarted.exercises[0].plannedReps, 8);
  assert.equal(restarted.exercises[0].sets[0].completed, false);
  assert.equal(session.exercises.length, 1);
});

test("multi-select avoids duplicates and uses each exercise's load and rest settings", () => {
  const session = createWorkoutSession("owner", workout());
  const bodyweight = catalogue.find((exercise) => exercise.loadType === "bodyweight");
  const added = addExercisesToSession(session, [catalogue[0], bodyweight, bodyweight, catalogue[1]]);
  assert.equal(added.exercises.length, 3);
  const entry = added.exercises.find((exercise) => exercise.exerciseId === bodyweight.id);
  assert.equal(entry.loadType, "bodyweight");
  assert.equal(entry.restSeconds, bodyweight.restSeconds);
  assert.equal(entry.sets.length, 3);
  assert.ok(entry.sets.every((set) => set.reps === null && set.weightLbs === null && !set.completed));
  const ids = added.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(addExercisesToSession(added, [bodyweight]), added);
  assert.equal(addExercisesToSession(added, []), added);
});

function serviceHarness({ failCompletion = false } = {}) {
  const writes = [];
  const store = new Map();
  const save = (ref, value) => { validateWrite(ref.path, value); writes.push(ref.path); store.set(ref.path, structuredClone(value)); };
  const snapshot = (query) => ({ docs: [...store]
    .filter(([path, value]) => path.startsWith(`${query.name}/`) && query.filters.every(([field, expected]) => value[field] === expected))
    .map(([, value]) => ({ data: () => structuredClone(value) })) });
  const service = load("src/lib/workouts-service.ts", {
    "@/lib/firebase": { db: {} },
    "@/lib/workout-session": builders,
    "@/lib/workout-personal-records": records,
    "@/lib/workout-coaching": coaching,
    "@/data/exercise-catalogue.json": catalogue,
    "@/data/stretching-catalogue.json": stretchCatalogue,
    "firebase/firestore": {
      doc: (_, collection, id) => ({ id, path: `${collection}/${id}` }),
      setDoc: async (ref, value) => {
        if (failCompletion && value.status === "completed") throw new Error("Simulated write failure");
        save(ref, value);
      },
      deleteDoc: async (ref) => { store.delete(ref.path); },
      collection: (_, name) => name,
      where: (field, _operator, expected) => [field, expected],
      query: (name, ...filters) => ({ name, filters }),
      getDocs: async (query) => snapshot(query),
      onSnapshot: (query, callback) => { callback(snapshot(query)); return () => {}; },
    },
  });
  return { service, store, writes };
}

test("coaching evidence, weight increments, effort and warm-up labels survive saving and finishing", async () => {
  const { service, store } = serviceHarness();
  const source = createWorkoutSession("owner", workout());
  source.startedAt = 100; source.completedAt = 200; source.status = "completed";
  source.exercises[0].sets = source.exercises[0].sets.map((set) => ({ ...set, weightLbs: 40, reps: 8, completed: true }));
  source.exercises[0].weightIncrementLbs = 2.5;
  await service.saveWorkoutSession(source);
  const session = coaching.attachWorkoutCoaching(createWorkoutSession("owner", workout()), [source]);
  session.adjustedFromSetCount = 4;
  session.exercises[0].effort = "harder";
  session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], weightLbs: 40, reps: 8, completed: true, kind: "warmup" };
  await service.saveWorkoutSession(session);
  store.delete(`workout_sessions/${source.id}`);
  let resumed;
  service.subscribeToActiveWorkoutSession("owner", (value) => { resumed = value; });
  assert.equal(resumed.adjustedFromSetCount, 4);
  assert.deepEqual(resumed.exercises, session.exercises);
  const finished = await service.completeWorkoutSessionWithPersonalRecords(resumed);
  assert.equal(finished.exercises[0].effort, "harder");
  assert.equal(finished.exercises[0].coaching.previous.sessionId, source.id);
  const repeated = builders.createRepeatedTrainingSession("owner", finished);
  assert.equal(repeated.exercises[0].effort, undefined);
  assert.equal(repeated.exercises[0].coaching, undefined);
  assert.equal(repeated.exercises[0].weightIncrementLbs, 2.5);
  assert.equal(repeated.exercises[0].sets[0].kind, "warmup");
  assert.equal(repeated.exercises[0].sets[0].completed, false);
});

test("finishing recovers missing coaching evidence from history without changing the logged sets", async () => {
  const { service } = serviceHarness();
  const before = createWorkoutSession("owner", workout());
  before.id = "before-coaching"; before.startedAt = 100; before.completedAt = 200; before.status = "completed";
  before.exercises[0].sets = before.exercises[0].sets.map((set) => ({ ...set, weightLbs: 40, reps: 8, completed: true }));
  await service.saveWorkoutSession(before);
  const session = createWorkoutSession("owner", workout());
  session.exercises[0].sets = session.exercises[0].sets.map((set) => ({ ...set, weightLbs: 40, reps: 9, completed: true }));
  const finished = await service.completeWorkoutSessionWithPersonalRecords(session);
  assert.equal(finished.exercises[0].coaching.previous.sessionId, before.id);
  assert.deepEqual(finished.exercises[0].sets, session.exercises[0].sets);
  assert.match(coaching.workoutReview(finished)[0].observation, /2 more reps/);
});

test("session additions survive saving, completion with PRs, and history loading without preset writes", async () => {
  const { service, writes } = serviceHarness();
  const session = addExercisesToSession(createWorkoutSession("owner", workout()), [catalogue[1]]);
  session.exercises[1].sets[0] = { ...session.exercises[1].sets[0], completed: true, reps: 10, weightLbs: 25 };
  await service.saveWorkoutSession(session);
  let resumed;
  service.subscribeToActiveWorkoutSession("owner", (value) => { resumed = value; });
  assert.deepEqual(resumed.exercises, session.exercises);
  await service.saveWorkoutSession(resumed);
  const completed = await service.completeWorkoutSessionWithPersonalRecords(resumed);
  assert.equal(completed.status, "completed");
  assert.equal(completed.personalRecords[0].exerciseId, catalogue[1].id);
  let history;
  service.subscribeToCompletedWorkoutSessions("owner", (value) => { history = value; });
  assert.deepEqual(history[0].exercises, coaching.attachWorkoutCoaching(session, []).exercises);
  assert.equal(history[0].exercises[1].addedDuringSession, true);
  assert.ok(writes.every((path) => path.startsWith("workout_sessions/") || path.startsWith("workout_personal_records/")));
  assert.equal(addExercisesToSession(completed, [catalogue[2]]), completed);
});

test("previous exercise logs come from the latest workout containing each exercise", async () => {
  const { service } = serviceHarness();
  const older = addExercisesToSession(createWorkoutSession("owner"), catalogue.slice(0, 2));
  Object.assign(older, { status: "completed", completedAt: 100, completedDate: "2025-01-01" });
  Object.assign(older.exercises[0].sets[0], { weightLbs: 95, reps: 8 });
  Object.assign(older.exercises[1].sets[0], { weightLbs: 40, reps: 10 });
  const newer = addExercisesToSession(createWorkoutSession("owner"), [catalogue[0]]);
  Object.assign(newer, { status: "completed", completedAt: 200, completedDate: "2025-01-02" });
  Object.assign(newer.exercises[0].sets[0], { weightLbs: 115, reps: 6 });
  const active = addExercisesToSession(createWorkoutSession("owner"), [catalogue[1]]);
  Object.assign(active.exercises[0].sets[0], { weightLbs: 50, reps: 12 });

  await Promise.all([older, newer, active].map((session) => service.saveWorkoutSession(session)));
  const previous = await service.getMostRecentCompletedExerciseLogs("owner");

  assert.equal(previous[catalogue[0].id].sets[0].weightLbs, 115);
  assert.equal(previous[catalogue[0].id].sets[0].reps, 6);
  assert.equal(previous[catalogue[1].id].sets[0].weightLbs, 40);
  assert.equal(previous[catalogue[1].id].sets[0].reps, 10);
});

for (const kind of ["freestyle", "saved"]) {
  for (const state of ["fully completed", "partially completed", "unchecked entries"]) {
    test(`${kind} workouts save and finish with ${state} after loading from Firestore`, async () => {
      const { service, store } = serviceHarness();
      const preset = workout();
      const original = structuredClone(preset);
      const initial = kind === "saved" ? createWorkoutSession("owner", preset) : addExercisesToSession(createWorkoutSession("owner"), [catalogue[0]]);
      initial.exercises[0].sets[0] = { ...initial.exercises[0].sets[0], weightLbs: 25, reps: 8, completed: state !== "unchecked entries" };
      if (state === "fully completed") initial.exercises[0].sets.forEach((set) => { set.weightLbs = 25; set.reps = 8; set.completed = true; });
      await service.saveWorkoutSession(initial);
      let resumed;
      service.subscribeToActiveWorkoutSession("owner", (value) => { resumed = value; });
      assert.ok(!Object.values(resumed).includes(undefined));
      assert.equal(hasWorkoutData(resumed), true);
      await service.saveWorkoutSession(resumed);
      const completed = await service.completeWorkoutSessionWithPersonalRecords(resumed);
      assert.equal(completed.status, "completed");
      assert.deepEqual(completed.exercises, coaching.attachWorkoutCoaching(initial, []).exercises);
      assert.equal(completed.personalRecords.length, state === "unchecked entries" ? 0 : 1);
      assert.equal(store.get(`workout_sessions/${initial.id}`).status, "completed");
      assert.deepEqual(preset, original);
    });
  }
}

test("no exercises, untouched plans, or removed logs cannot be finished", async () => {
  const { service, writes } = serviceHarness();
  const empty = createWorkoutSession("owner");
  const untouched = createWorkoutSession("owner", workout());
  const noSets = { ...untouched, exercises: untouched.exercises.map((exercise) => ({ ...exercise, sets: [] })) };
  for (const session of [empty, untouched, noSets]) {
    assert.equal(hasWorkoutData(session), false);
    await service.saveWorkoutSession(session); // Empty active drafts are still valid.
    const count = writes.length;
    await assert.rejects(service.completeWorkoutSessionWithPersonalRecords(session), /Log weight or reps/);
    assert.equal(writes.length, count);
  }
});

test("bodyweight reps, weight-only entries, and explicit zero loads count without checking sets off", async () => {
  const { service } = serviceHarness();
  const bodyweight = catalogue.find((exercise) => exercise.loadType === "bodyweight");
  for (const [exercise, values] of [[bodyweight, { reps: 6 }], [catalogue[0], { weightLbs: 25 }], [catalogue[0], { weightLbs: 0, reps: 8 }]]) {
    const session = addExercisesToSession(createWorkoutSession("owner"), [exercise]);
    Object.assign(session.exercises[0].sets[0], values);
    const completed = await service.completeWorkoutSessionWithPersonalRecords(session);
    assert.equal(completed.status, "completed");
    assert.equal(completed.exercises[0].sets[0].completed, false);
    assert.deepEqual(completed.personalRecords, []);
  }
});

test("already-open sessions with undefined optional fields can be saved and finished", async () => {
  const { service, store } = serviceHarness();
  const session = createWorkoutSession("owner", workout());
  Object.assign(session, { activityId: undefined, activityCategorySnapshot: undefined, activityIconSnapshot: undefined, activityDescriptionSnapshot: undefined, stretchRoutineId: undefined, stretchRoutineDescriptionSnapshot: undefined });
  session.exercises[0].sets[0].reps = 8;
  await service.saveWorkoutSession(session);
  await service.completeWorkoutSessionWithPersonalRecords(session);
  const stored = store.get(`workout_sessions/${session.id}`);
  assert.equal(stored.status, "completed");
  assert.equal("activityId" in stored, false);
  assert.equal(stored.exercises[0].sets[0].weightLbs, null);
});

test("a failed completion keeps the active session and logged data available for retry", async () => {
  const { service, store } = serviceHarness({ failCompletion: true });
  const session = createWorkoutSession("owner", workout());
  Object.assign(session.exercises[0].sets[0], { reps: 8, weightLbs: 25, completed: true });
  await service.saveWorkoutSession(session);
  await assert.rejects(service.completeWorkoutSessionWithPersonalRecords(session), /Simulated write failure/);
  assert.deepEqual(store.get(`workout_sessions/${session.id}`), session);
  assert.equal(session.status, "active");
  assert.equal([...store.keys()].some((path) => path.startsWith("workout_personal_records/")), false);
});

test("stretch routines and activities still finish without strength-training sets", async () => {
  const { service } = serviceHarness();
  for (const sessionType of ["stretch", "activity"]) {
    const session = sessionType === "stretch" ? builders.addStretchToSession(service.createStretchRoutineSession("owner"), stretchCatalogue[0], 30) : { ...createWorkoutSession("owner"), sessionType };
    const completed = service.completeWorkoutSession(session);
    assert.equal(completed.status, "completed");
    await service.saveWorkoutSession(completed);
  }
});

for (const kind of ["freestyle", "saved"]) {
  test(`previous ${kind} workouts retain their entered date and duration through resume and completion`, async () => {
    const { service, store } = serviceHarness();
    const preset = workout();
    const original = structuredClone(preset);
    let session = createPreviousWorkoutSession("owner", kind === "saved" ? preset : undefined);
    if (kind === "freestyle") session = addExercisesToSession(session, [catalogue[0]]);
    const performedAt = new Date(2025, 5, 12, 18, 30).getTime();
    session = setPreviousWorkoutTiming(session, performedAt, 4530);
    session.exercises[0].sets[0].reps = 8;
    await service.saveWorkoutSession(session);
    let resumed;
    service.subscribeToActiveWorkoutSession("owner", (value) => { resumed = value; });
    assert.equal(resumed.entryMode, "previous");
    assert.equal(resumed.performedAt, performedAt);
    assert.equal(resumed.durationSeconds, 4530);
    const completed = await service.completeWorkoutSessionWithPersonalRecords(resumed);
    assert.equal(completed.completedAt, performedAt);
    assert.equal(completed.completedDate, "2025-06-12");
    assert.equal(completed.durationSeconds, 4530);
    assert.equal(completed.startedAt, performedAt - 4530 * 1000);
    assert.deepEqual(completed.exercises, session.exercises);
    assert.equal(store.get(`workout_sessions/${session.id}`).durationSeconds, 4530);
    assert.deepEqual(preset, original);
  });
}

test("previous workouts need a valid entered duration and cannot be future dated", async () => {
  const { service } = serviceHarness();
  const session = createPreviousWorkoutSession("owner", workout());
  session.exercises[0].sets[0].reps = 8;
  assert.equal(hasValidPreviousWorkoutTiming(session), false);
  await assert.rejects(service.completeWorkoutSessionWithPersonalRecords(session), /date and duration/);
  for (const [performedAt, seconds] of [[Date.now(), 0], [Date.now(), -1], [Date.now(), 1.5], [Date.now(), NaN], [Date.now() + 86400000, 60], [NaN, 60]]) {
    assert.throws(() => setPreviousWorkoutTiming(session, performedAt, seconds), /past workout time/);
  }
  assert.throws(() => setPreviousWorkoutTiming(createWorkoutSession("owner"), Date.now(), 60), /past workout time/);
  const withTiming = setPreviousWorkoutTiming(session, Date.now() - 86400000, 90);
  const withoutData = removeExerciseFromSession(withTiming, catalogue[0].id);
  await assert.rejects(service.completeWorkoutSessionWithPersonalRecords(withoutData), /Log weight or reps/);
});

test("previous activities retain edited dates, durations, and intensity after saving and resuming", async () => {
  const { service, store } = serviceHarness();
  const activity = { id: "walk", name: "Walking", category: "Outdoors", icon: "directions_walk", description: "A walk" };
  const draft = service.createActivitySession("owner", activity, true);
  assert.equal(draft.entryMode, "previous");
  assert.throws(() => service.completeActivitySession(draft, "steady"), /date and duration/);
  const ended = new Date(2025, 5, 12, 18, 30).getTime();
  const timed = setPreviousWorkoutTiming(draft, ended, 4500);
  await service.saveWorkoutSession(timed);
  let resumed;
  service.subscribeToActiveWorkoutSession("owner", (session) => { resumed = session; });
  const finished = service.completeActivitySession(resumed, "hard");
  await service.saveWorkoutSession(finished);
  assert.equal(finished.completedAt, ended);
  assert.equal(finished.completedDate, "2025-06-12");
  assert.equal(finished.durationSeconds, 4500);
  assert.equal(finished.startedAt, ended - 4500000);
  assert.equal(finished.activityIntensity, "hard");
  assert.equal(store.get(`workout_sessions/${draft.id}`).durationSeconds, 4500);
  let history;
  service.subscribeToCompletedWorkoutSessions("owner", (sessions) => { history = sessions; });
  assert.equal(history[0].completedAt, ended);
  assert.deepEqual(history[0].personalRecords, []);
});

for (const previous of [false, true]) {
  test(`${previous ? "previous" : "live"} blank stretching supports session-only additions and persistence`, async () => {
    const { service } = serviceHarness();
    let session = service.createStretchRoutineSession("owner", undefined, previous);
    assert.equal(session.sessionType, "stretch");
    assert.deepEqual(session.stretches, []);
    assert.throws(() => service.completeWorkoutSession(session), /at least one stretch/);
    const empty = structuredClone(session);
    session = builders.addStretchToSession(session, stretchCatalogue[0], 45);
    session = builders.addStretchToSession(session, stretchCatalogue[1], 60);
    assert.deepEqual(empty.stretches, []);
    assert.equal(builders.addStretchToSession(session, stretchCatalogue[0], 90), session);
    for (const seconds of [0, -1, NaN, 1.5]) assert.throws(() => builders.addStretchToSession(session, stretchCatalogue[2], seconds), /hold time/);
    if (previous) session = setPreviousWorkoutTiming(session, new Date(2025, 5, 12, 12).getTime(), 900);
    await service.saveWorkoutSession(session);
    let resumed;
    service.subscribeToActiveWorkoutSession("owner", (value) => { resumed = value; });
    assert.deepEqual(resumed.stretches, session.stretches);
    const completed = service.completeWorkoutSession(resumed);
    await service.saveWorkoutSession(completed);
    assert.equal(completed.status, "completed");
    if (previous) { assert.equal(completed.durationSeconds, 900); assert.equal(completed.completedAt, session.performedAt); }
    assert.equal(builders.addStretchToSession(completed, stretchCatalogue[2], 30), completed);
  });
}

test("saved stretching routines stay unchanged when session stretches are added or removed", async () => {
  const { service, writes } = serviceHarness();
  const routine = { id: "saved-stretch", userId: "owner", name: "Evening stretch", description: "Unwind", scheduledDays: [1], stretches: [{ stretchId: stretchCatalogue[0].id, holdSeconds: 40, sortOrder: 0 }], sortOrder: 0, createdAt: 1, updatedAt: 1 };
  const original = structuredClone(routine);
  let session = service.createStretchRoutineSession("owner", routine, true);
  session = builders.addStretchToSession(session, stretchCatalogue[1], 55);
  session = { ...session, stretches: session.stretches.filter((item) => item.stretchId !== stretchCatalogue[0].id) };
  session = setPreviousWorkoutTiming(session, Date.now() - 86400000, 600);
  await service.saveWorkoutSession(service.completeWorkoutSession(session));
  assert.deepEqual(routine, original);
  assert.deepEqual(service.createStretchRoutineSession("owner", routine).stretches.map((item) => [item.stretchId, item.holdSeconds]), [[stretchCatalogue[0].id, 40]]);
  assert.ok(writes.every((path) => path.startsWith("workout_sessions/")));
});

test("failed previous activity and stretching saves preserve their editable drafts", async () => {
  const { service, store } = serviceHarness({ failCompletion: true });
  for (const kind of ["activity", "stretch"]) {
    let session = kind === "activity"
      ? service.createActivitySession("owner", { id: "walk", name: "Walk", category: "Outdoor", icon: "directions_walk", description: "A walk" }, true)
      : builders.addStretchToSession(service.createStretchRoutineSession("owner", undefined, true), stretchCatalogue[0], 45);
    session = setPreviousWorkoutTiming(session, Date.now() - 86400000, 1800);
    await service.saveWorkoutSession(session);
    const completed = kind === "activity" ? service.completeActivitySession(session, "easy") : service.completeWorkoutSession(session);
    await assert.rejects(service.saveWorkoutSession(completed), /Simulated write failure/);
    assert.deepEqual(store.get(`workout_sessions/${session.id}`), session);
  }
});

test("repeated workouts start blank and preserve selected-history Prev snapshots across saves and deletion", async () => {
  const { service, store } = serviceHarness();
  const source = loggedWorkout("source", 1000, [[140, 9], [140, 8], [100, 12, false]]);
  Object.assign(source, { entryMode: "previous", performedAt: 1000, durationSeconds: 900, personalRecords: [{ exerciseId: source.exercises[0].exerciseId, weightLbs: 140, reps: 9, previousBestWeightLbs: null, previousBestReps: null, setIds: ["source-set-1"] }] });
  source.exercises[0].addedDuringSession = true;
  const original = structuredClone(source);
  store.set("workout_sessions/source", source);
  const repeat = builders.createRepeatedTrainingSession("owner", source);
  assert.notEqual(repeat.id, source.id);
  assert.equal(repeat.workoutId, source.workoutId);
  assert.equal(repeat.status, "active");
  assert.equal(repeat.entryMode, undefined);
  assert.equal(repeat.performedAt, undefined);
  assert.equal(repeat.completedAt, null);
  assert.equal(repeat.completedDate, null);
  assert.equal(repeat.durationSeconds, null);
  assert.deepEqual(repeat.personalRecords, []);
  assert.equal(repeat.exercises[0].plannedSets, 3);
  assert.equal(repeat.exercises[0].addedDuringSession, false);
  assert.ok(repeat.exercises[0].sets.every((set) => set.weightLbs === null && set.reps === null && set.completed === false));
  assert.equal(new Set(repeat.exercises[0].sets.map((set) => set.id)).size, 3);
  assert.ok(repeat.exercises[0].sets.every((set) => !source.exercises[0].sets.some((original) => original.id === set.id)));
  await service.saveWorkoutSession(repeat);
  await service.deleteWorkoutSession(source.id);
  let resumed;
  service.subscribeToActiveWorkoutSession("owner", (session) => { resumed = session; });
  assert.deepEqual(resumed.repeatPreviousExercises, original.exercises);
  const newer = structuredClone(original.exercises[0]); newer.sets[0].weightLbs = 200;
  const other = { ...newer, exerciseId: "new-exercise" };
  const prev = builders.mergePreviousExerciseLogs({ [newer.exerciseId]: newer, [other.exerciseId]: other }, resumed.repeatPreviousExercises);
  assert.equal(prev[newer.exerciseId].sets[0].weightLbs, 140);
  assert.equal(prev[other.exerciseId].sets[0].weightLbs, 200);
  assert.equal(getPreviousSetSuggestion(resumed.exercises[0], prev[newer.exerciseId], 0).reps, 9);
  repeat.repeatPreviousExercises[0].sets[0].reps = 0;
  assert.deepEqual(source, original);
});

test("repeating activities and stretching resets timing and intensity while copying content", async () => {
  const { service } = serviceHarness();
  const activity = service.createActivitySession("owner", { id: "walk", name: "Walk", category: "Outside", icon: "directions_walk", description: "A walk" }, true);
  const stretch = builders.addStretchToSession(service.createStretchRoutineSession("owner", undefined, true), stretchCatalogue[0], 45);
  for (const source of [activity, stretch]) {
    Object.assign(source, { status: "completed", activityIntensity: "hard", durationSeconds: 500, performedAt: 12345, completedAt: 12345, completedDate: "2026-01-01" });
    const original = structuredClone(source);
    const repeated = builders.createRepeatedTrainingSession("owner", source);
    assert.equal(repeated.sessionType, source.sessionType);
    assert.equal(repeated.workoutNameSnapshot, source.workoutNameSnapshot);
    assert.equal(repeated.entryMode, undefined);
    assert.equal(repeated.performedAt, undefined);
    assert.equal(repeated.completedAt, null);
    assert.equal(repeated.durationSeconds, null);
    assert.deepEqual(repeated.personalRecords, []);
    if (source.sessionType === "activity") assert.equal(repeated.activityIntensity, null);
    else { assert.deepEqual(repeated.stretches, source.stretches); repeated.stretches[0].holdSeconds = 99; }
    await service.saveWorkoutSession(repeated);
    assert.deepEqual(source, original);
    assert.throws(() => builders.createRepeatedTrainingSession("stranger", source), /your completed/);
  }
  assert.throws(() => builders.createRepeatedTrainingSession("owner", createWorkoutSession("owner")), /your completed/);
});

function loggedWorkout(id, completedAt, sets) {
  const session = createWorkoutSession("owner", workout());
  return { ...session, id, completedAt, createdAt: completedAt, status: "completed", exercises: [{
    ...session.exercises[0],
    sets: sets.map(([weightLbs, reps, completed = true], index) => ({ id: `${id}-set-${index + 1}`, weightLbs, reps, completed })),
  }] };
}

for (const [name, sets, weight, index] of [
  ["Chest-Supported Row", [[90, 12], [140, 8], [140, 9], [140, 8]], 140, 3],
  ["Incline Dumbbell Bicep Curl", [[20, 7], [20, 6], [17.5, 7]], 20, 1],
  ["Seated Cable Row", [[50, 12], [90, 7], [90, 8], [90, 7]], 90, 3],
]) {
  test(`${name}: only the highest-rep set at the highest weight receives a PR`, () => {
    const session = loggedWorkout("example", 1000, sets);
    session.exercises[0].exerciseNameSnapshot = name;
    // Legacy records deliberately identify the wrong set(s).
    session.personalRecords = [{ exerciseId: session.exercises[0].exerciseId, reps: 12, previousBestReps: null, setIds: ["example-set-1", "example-set-3"] }];
    const original = structuredClone(session);
    const [result] = withHistoricalPersonalRecords([session]);
    assert.equal(result.personalRecords.length, 1);
    assert.equal(result.personalRecords[0].weightLbs, weight);
    assert.equal(result.personalRecords[0].reps, sets[index - 1][1]);
    assert.deepEqual(result.personalRecords[0].setIds, [`example-set-${index}`]);
    assert.deepEqual(session, original);
    for (const file of ["completed-workout-detail-modal", "workout-completion-summary"]) {
      const Component = load(`src/components/${file}.tsx`, {
        react: React, "react/jsx-runtime": jsxRuntime,
        "@/components/workout-debrief": debrief,
        "@/components/completed-session-actions": { __esModule: true, default: () => null },
        "@/components/workout-personal-records-dropdown": recordsDropdown,
        "@/components/material-icon": { default: () => null, __esModule: true },
      }).default;
      const html = renderToStaticMarkup(React.createElement(Component, { session: result }));
      assert.ok(html.includes(`${weight} lbs × ${sets[index - 1][1]} reps`));
      const rows = html.split('class="completed-set-grid completed-set-row"').slice(1);
      const winningRows = rows.map((row, rowIndex) => row.includes('>PR<') ? rowIndex + 1 : null).filter(Boolean);
      assert.deepEqual(winningRows, [index], `${file} should highlight exactly one correct row`);
    }
  });
}

test("higher reps at the record weight earn a PR, while lighter weights and exact ties do not", () => {
  const baseline = loggedWorkout("baseline", 1000, [[140, 8]]);
  const lighter = loggedWorkout("lighter", 2000, [[90, 30]]);
  const moreReps = loggedWorkout("more-reps", 3000, [[140, 8], [140, 9], [140, 9]]);
  const equal = loggedWorkout("equal", 4000, [[140, 9]]);
  const fewerReps = loggedWorkout("fewer-reps", 5000, [[140, 8]]);
  const heavier = loggedWorkout("heavier", 6000, [[140, 30], [145, 1], [145, 1]]);
  const results = withHistoricalPersonalRecords([heavier, equal, baseline, lighter, moreReps, fewerReps]);
  assert.deepEqual(results.map((session) => session.personalRecords.length), [1, 0, 0, 1, 0, 1]);
  const repRecord = results.find((session) => session.id === "more-reps").personalRecords[0];
  assert.equal(repRecord.previousBestWeightLbs, 140);
  assert.equal(repRecord.previousBestReps, 8);
  assert.equal(repRecord.reps, 9);
  assert.deepEqual(repRecord.setIds, ["more-reps-set-2"]);
  assert.equal(results[0].personalRecords[0].previousBestWeightLbs, 140);
  assert.equal(results[0].personalRecords[0].previousBestReps, 9);
  assert.deepEqual(results[0].personalRecords[0].setIds, ["heavier-set-2"]);
});

test("unchecked, invalid, zero, and bodyweight loads cannot establish weight PRs", () => {
  const session = loggedWorkout("invalid", 1000, [[200, 10, false], [null, 50], [NaN, 20], [Infinity, 20], [-5, 20], [0, 20], [50, null]]);
  const [result] = withHistoricalPersonalRecords([session]);
  assert.deepEqual(result.personalRecords[0].setIds, ["invalid-set-7"]);
  session.exercises[0].loadType = "bodyweight";
  assert.deepEqual(withHistoricalPersonalRecords([session])[0].personalRecords, []);
  session.exercises[0].loadType = "external_weight";
  session.status = "active";
  assert.deepEqual(withHistoricalPersonalRecords([session])[0].personalRecords, []);
});

test("repeated exercise entries produce just one record, and users have separate baselines", () => {
  const session = loggedWorkout("repeated", 2000, [[50, 20]]);
  session.exercises.push({ ...session.exercises[0], sortOrder: 5, sets: [{ id: "winning-set", weightLbs: 100, reps: 1, completed: true }] });
  const otherUser = { ...loggedWorkout("other", 1000, [[500, 10]]), userId: "other-user" };
  const [result] = withHistoricalPersonalRecords([session, otherUser]);
  assert.equal(result.personalRecords.length, 1);
  assert.deepEqual(result.personalRecords[0].setIds, ["winning-set"]);
});

test("finishing and history ignore old rep caches and agree on weight PRs", async () => {
  const { service, store } = serviceHarness();
  const baseline = loggedWorkout("baseline", 1000, [[100, 5]]);
  store.set(`workout_sessions/${baseline.id}`, baseline);
  store.set(`workout_personal_records/owner_${baseline.exercises[0].exerciseId}`, { bestReps: 999 });
  const session = { ...loggedWorkout("new", 2000, [[90, 20], [110, 2], [110, 10]]), status: "active", completedAt: null };
  const finished = await service.completeWorkoutSessionWithPersonalRecords(session);
  assert.equal(finished.personalRecords[0].weightLbs, 110);
  assert.equal(finished.personalRecords[0].previousBestWeightLbs, 100);
  assert.deepEqual(finished.personalRecords[0].setIds, ["new-set-3"]);
  assert.equal(finished.personalRecords[0].reps, 10);
  let history;
  service.subscribeToCompletedWorkoutSessions("owner", (value) => { history = value; });
  assert.deepEqual(history[0].personalRecords, finished.personalRecords);
  assert.deepEqual(store.get("workout_sessions/new").personalRecords, finished.personalRecords);

  const nextSession = { ...loggedWorkout("next", Date.now() + 1, [[110, 10], [110, 11], [110, 11]]), status: "active", completedAt: null };
  const nextFinished = await service.completeWorkoutSessionWithPersonalRecords(nextSession);
  assert.equal(nextFinished.personalRecords[0].weightLbs, 110);
  assert.equal(nextFinished.personalRecords[0].reps, 11);
  assert.equal(nextFinished.personalRecords[0].previousBestReps, 10);
  assert.deepEqual(nextFinished.personalRecords[0].setIds, ["next-set-2"]);
  service.subscribeToCompletedWorkoutSessions("owner", (value) => { history = value; });
  assert.deepEqual(history.find((session) => session.id === "next").personalRecords, nextFinished.personalRecords);
});

test("previous set suggestions match history by set number", () => {
  const current = createWorkoutSession("owner", workout()).exercises[0];
  const previous = structuredClone(current);
  previous.sets[0] = { ...previous.sets[0], weightLbs: 115, reps: 6, completed: true };
  previous.sets[1] = { ...previous.sets[1], weightLbs: 105, reps: 8, completed: true };

  assert.equal(getPreviousSetSuggestion(current, previous, 0), previous.sets[0]);
  assert.equal(getPreviousSetSuggestion(current, previous, 1), previous.sets[1]);
  assert.equal(getPreviousSetSuggestion(current, previous, 2), null);
});

test("an exercise with no history repeats the latest entered set in the current workout", () => {
  const current = createWorkoutSession("owner", workout()).exercises[0];
  current.sets.push({ id: "third-set", weightLbs: null, reps: null, completed: false });
  current.sets[0] = { ...current.sets[0], weightLbs: 115, reps: 6 };

  assert.equal(getPreviousSetSuggestion(current, null, 0), null);
  assert.equal(getPreviousSetSuggestion(current, null, 1), current.sets[0]);
  assert.equal(getPreviousSetSuggestion(current, null, 2), current.sets[0]);
  assert.equal(getPreviousSetSuggestion(current, undefined, 1), null);
});

test("current-workout fallback is not used when the exercise has prior history", () => {
  const current = createWorkoutSession("owner", workout()).exercises[0];
  current.sets[0] = { ...current.sets[0], weightLbs: 115, reps: 6 };
  const previous = structuredClone(current);
  previous.sets = [previous.sets[0]];

  assert.equal(getPreviousSetSuggestion(current, previous, 1), null);
});

test("backdated workouts and deletion recalculate historical weight records", async () => {
  const { service, store } = serviceHarness();
  const later = loggedWorkout("later", 200000, [[100, 8]]);
  store.set("workout_sessions/later", later);
  const earlier = { ...loggedWorkout("earlier", 100000, [[120, 2]]), entryMode: "previous", performedAt: 100000, durationSeconds: 60, status: "active", completedAt: null };
  const finished = await service.completeWorkoutSessionWithPersonalRecords(earlier);
  assert.equal(finished.personalRecords[0].weightLbs, 120);
  assert.equal(finished.personalRecords[0].previousBestWeightLbs, null);
  let history;
  const readHistory = () => service.subscribeToCompletedWorkoutSessions("owner", (value) => { history = value; });
  readHistory();
  assert.deepEqual(history.map((session) => session.personalRecords.length), [0, 1]);
  await service.deleteCompletedWorkoutSession(finished);
  readHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].personalRecords[0].weightLbs, 100);
  assert.equal(history[0].personalRecords[0].previousBestWeightLbs, null);
});
