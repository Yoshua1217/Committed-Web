import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/workout-coaching.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
const ranges = { exports: {} };
new Function("module", "exports", ts.transpileModule(fs.readFileSync(new URL("../src/lib/workout-rep-range.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(ranges, ranges.exports);
new Function("require", "module", "exports", compiled)((name) => { if (name === "@/lib/workout-rep-range") return ranges.exports; throw new Error(name); }, loaded, loaded.exports);
const { attachWorkoutCoaching, coachingEvidence, exerciseTarget, workingSets, workoutReview, estimateWorkoutMinutes } = loaded.exports;
const sets = (reps = [8, 9, 8], weight = 140) => reps.map((rep, i) => ({ id: `set-${i}`, reps: rep, weightLbs: weight, completed: true }));
const exercise = (reps = [8, 9, 8]) => ({ exerciseId: "row", exerciseNameSnapshot: "Row", loadType: "external_weight", plannedReps: 10, plannedSets: reps.length, restSeconds: 150, sortOrder: 0, sets: sets(reps) });
const log = (id, at, ex = exercise()) => ({ id, userId: "owner", workoutId: "routine", workoutNameSnapshot: "Pull", sessionType: "workout", status: "completed", startedAt: at - 1000, completedAt: at, createdAt: at, exercises: [ex], personalRecords: [], durationSeconds: 1800 });
const draft = () => ({ ...log("active", 300), status: "active", startedAt: 300, completedAt: null, exercises: [{ ...exercise(), sets: sets().map((set) => ({ ...set, reps: null, weightLbs: null, completed: false })) }] });
const coached = (history) => attachWorkoutCoaching(draft(), history).exercises[0];

test("rep ranges preserve legacy targets and reject invalid or inverted bounds", () => {
  assert.equal(ranges.exports.formatRepRange({ plannedReps: 8 }), "8");
  assert.equal(ranges.exports.formatRepRange({ plannedReps: 8, plannedRepsMax: 12 }), "8–12");
  assert.equal(ranges.exports.validRepRange({ plannedReps: 8, plannedRepsMax: 8 }), true);
  for (const plan of [{ plannedReps: 0 }, { plannedReps: 8.5 }, { plannedReps: 8, plannedRepsMax: 7 }, { plannedReps: 8, plannedRepsMax: 12.5 }]) assert.equal(ranges.exports.validRepRange(plan), false);
});

test("ranges build reps near the upper bound before raising weight and reset to the lower bound", () => {
  const current = (reps) => ({ ...coached([log("one", 100, { ...exercise(reps), effort: "easier" })]), plannedReps: 8, plannedRepsMax: 12, weightIncrementLbs: 5 });
  const building = exerciseTarget(current([8, 8, 8]));
  assert.equal(building.action, "reps");
  assert.deepEqual(building.sets.map((set) => [set.weightLbs, set.reps]), [[140, 9], [140, 8], [140, 8]]);
  assert.deepEqual(exerciseTarget(current([12, 12, 10])).sets.map((set) => set.reps), [12, 12, 11]);
  assert.deepEqual(exerciseTarget(current([14, 12, 10])).sets.map((set) => set.reps), [12, 12, 11]);
  assert.deepEqual(exerciseTarget(current([12, 12, 12])).sets, Array.from({ length: 3 }, () => ({ weightLbs: 145, reps: 8 })));
  assert.deepEqual(exerciseTarget({ ...coached([]), plannedReps: 8, plannedRepsMax: 12 }).sets.map((set) => set.reps), [8, 8, 8]);
});

test("range ceilings do not increase mixed working loads or exceed the range for large equipment steps", () => {
  const current = { ...coached([log("one", 100, { ...exercise([12, 12, 12]), effort: "easier" })]), plannedReps: 8, plannedRepsMax: 12, weightIncrementLbs: 30 };
  assert.deepEqual(exerciseTarget(current).sets.map((set) => set.reps), [12, 12, 12]);
  current.weightIncrementLbs = 5;
  current.coaching.previous.sets[0].weightLbs = 100;
  assert.equal(exerciseTarget(current).action, "repeat");
});

test("one completed session near the maximum qualifies every working set without extra effort feedback", () => {
  for (const reps of [[12, 12, 13], [13, 12, 11], [11, 11, 11]]) {
    const ex = { ...coached([log("one", 100, exercise(reps))]), plannedReps: 8, plannedRepsMax: 12, weightIncrementLbs: 5 };
    const before = structuredClone(ex);
    const result = exerciseTarget(ex);
    assert.equal(result.action, "weight");
    assert.deepEqual(result.sets, Array.from({ length: 3 }, () => ({ weightLbs: 145, reps: 8 })));
    assert.match(result.why, /All 3 working sets reached at least 11/);
    assert.deepEqual(ex, before);
  }
});

test("nearby sets get a heads-up but high sets cannot compensate for a low set", () => {
  const current = (reps) => ({ ...coached([log("one", 100, exercise(reps))]), plannedReps: 8, plannedRepsMax: 12, weightIncrementLbs: 5 });
  const close = exerciseTarget(current([13, 12, 10]));
  assert.equal(close.action, "reps");
  assert.equal(close.label, "Nearly ready to increase weight");
  assert.deepEqual(close.sets.map((set) => set.weightLbs), [140, 140, 140]);
  assert.equal(close.sets[2].reps, 11);
  assert.equal(exerciseTarget(current([15, 14, 8])).label, "Build your reps");
  const partial = current([12, 12, 12]); partial.coaching.previous.sets[2].completed = false;
  assert.equal(exerciseTarget(partial).action, "repeat");
  const harder = current([12, 12, 12]); harder.coaching.previous.effort = "harder";
  assert.equal(exerciseTarget(harder).action, "ease");
  const warmup = current([12, 12, 12]); warmup.coaching.previous.sets.unshift({ ...sets([4], 50)[0], kind: "warmup" });
  assert.equal(exerciseTarget(warmup).action, "weight");
});

test("readiness applies to the configured set count and uses the correct assistance direction", () => {
  const ex = { ...coached([log("one", 100, exercise([11, 12, 13, 10]))]), plannedReps: 8, plannedRepsMax: 12, weightIncrementLbs: 5, sets: sets([0, 0, 0, 0]), plannedSets: 4 };
  assert.equal(exerciseTarget(ex).action, "reps");
  ex.coaching.previous.sets[3].reps = 11;
  ex.loadType = "assistance";
  assert.equal(exerciseTarget(ex).label, "Reduce assistance");
  assert.ok(exerciseTarget(ex).sets.every((set) => set.weightLbs === 135));
  ex.weightIncrementLbs = undefined;
  assert.equal(exerciseTarget(ex).needsWeightStep, true);
});

test("no history gives explicit baseline guidance without invented weights", () => {
  const result = exerciseTarget(coached([]));
  assert.equal(result.action, "baseline");
  assert.deepEqual(result.sets, Array.from({ length: 3 }, () => ({ weightLbs: null, reps: 10 })));
});
test("targets add one rep to the weakest working set, rather than chase the best set PR", () => {
  const result = exerciseTarget(coached([log("before", 100)]));
  assert.equal(result.action, "reps");
  assert.deepEqual(result.sets, [{ weightLbs: 140, reps: 9 }, { weightLbs: 140, reps: 9 }, { weightLbs: 140, reps: 8 }]);
});
test("meeting the target once holds steady; twice allows a real available load step", () => {
  assert.equal(exerciseTarget(coached([log("one", 100, exercise([10, 10, 10]))])).action, "repeat");
  const ex = coached([log("one", 100, exercise([10, 10, 10])), log("two", 200, exercise([10, 10, 10]))]);
  assert.equal(exerciseTarget(ex).needsWeightStep, true);
  assert.deepEqual(exerciseTarget(ex).sets.map((set) => set.weightLbs), [140, 140, 140]);
  assert.deepEqual(exerciseTarget({ ...ex, weightIncrementLbs: 5 }).sets, Array.from({ length: 3 }, () => ({ weightLbs: 145, reps: 10 })));
});
test("effort changes next-session advice, not the already-frozen current targets", () => {
  const ex = coached([log("one", 100, { ...exercise([10, 10, 10]), effort: "easier" })]);
  assert.equal(exerciseTarget(ex).action, "weight");
  assert.deepEqual(exerciseTarget({ ...ex, effort: "harder" }), exerciseTarget(ex));
  const harder = coached([log("one", 100, { ...exercise(), effort: "harder" })]);
  assert.equal(exerciseTarget(harder).action, "ease");
  assert.deepEqual(exerciseTarget(harder).sets.map((set) => set.reps), [7, 8, 7]);
});
test("large or unknown equipment steps never invent a load", () => {
  const ex = coached([log("one", 100, { ...exercise([10, 10, 10]), effort: "easier" })]);
  assert.equal(exerciseTarget({ ...ex, weightIncrementLbs: 30 }).action, "reps");
  assert.equal(exerciseTarget({ ...ex, weightIncrementLbs: -5 }).needsWeightStep, true);
});
test("bodyweight progresses reps and assistance progresses toward less assistance", () => {
  for (const loadType of ["bodyweight", "assistance", "added_weight"]) {
    const source = { ...exercise([10, 10, 10]), loadType, effort: "easier" };
    const current = { ...exercise(), loadType, weightIncrementLbs: 5 };
    current.coaching = coachingEvidence(current, [log("one", 100, source)], "owner", 300);
    const target = exerciseTarget(current);
    assert.equal(target.action, loadType === "bodyweight" ? "reps" : "weight");
    assert.equal(target.sets[0].weightLbs, loadType === "bodyweight" ? null : loadType === "assistance" ? 135 : 145);
  }
});
test("partial sessions and changed set counts hold rather than imply failure or progression", () => {
  const partial = exercise(); partial.sets[2].completed = false;
  assert.equal(exerciseTarget(coached([log("one", 100, partial)])).action, "repeat");
  assert.equal(exerciseTarget(coached([log("one", 100, exercise([10, 10]))])).action, "repeat");
});
test("warm-ups, invalid reps, and incomplete sets do not drive guidance", () => {
  const ex = exercise(); ex.sets = [{ ...sets()[0], kind: "warmup" }, { ...sets()[1], reps: 1.5 }, { ...sets()[2], completed: false }];
  assert.deepEqual(workingSets(ex), []);
  assert.equal(exerciseTarget(coached([log("one", 100, ex)])).action, "baseline");
});
test("history respects owner, actual chronology, session type and load type", () => {
  const before = log("before", 100);
  const newer = log("newer", 200);
  const ex = coached([newer, before, { ...log("foreign", 299), userId: "other" }, log("future", 400), { ...log("activity", 290), sessionType: "activity" }, log("different", 295, { ...exercise(), loadType: "assistance" })]);
  assert.equal(ex.coaching.previous.sessionId, "newer");
  assert.equal(ex.coaching.earlier.sessionId, "before");
});
test("snapshots freeze targets through source deletion and new exercises use their own history", () => {
  const original = draft(); const history = [log("one", 100)]; const saved = structuredClone(history);
  const next = attachWorkoutCoaching(original, history);
  history[0].exercises[0].sets[0].reps = 100;
  const reloaded = JSON.parse(JSON.stringify(next));
  assert.deepEqual(attachWorkoutCoaching(reloaded, []).exercises, next.exercises);
  assert.equal(next.exercises[0].coaching.previous.sets[0].reps, saved[0].exercises[0].sets[0].reps);
  assert.equal(original.exercises[0].coaching, undefined);
  const added = { ...exercise(), exerciseId: "curl" };
  const withAdded = attachWorkoutCoaching({ ...next, exercises: [...next.exercises, added] }, [log("curl-before", 150, added)]);
  assert.equal(withAdded.exercises[1].coaching.previous.sessionId, "curl-before");
});
test("debrief recognizes total-rep gains and consistency without requiring a PR", () => {
  const ex = coached([log("before", 100)]);
  const completed = log("after", 400, { ...ex, sets: sets([9, 9, 8]) });
  const review = workoutReview(completed)[0];
  assert.equal(review.outcome, "improved");
  assert.match(review.observation, /1 more rep/);
  assert.equal(workoutReview(log("same", 400, { ...ex, sets: sets() }))[0].outcome, "consistent");
  assert.equal(workoutReview(log("less", 400, { ...ex, sets: sets([7, 8, 7]) }))[0].outcome, "adjust");
});
test("partial and different-load reviews avoid unsupported improvement claims", () => {
  const ex = coached([log("before", 100)]);
  const partial = { ...ex, sets: sets([10, 10, 10]) }; partial.sets[2].completed = false;
  assert.match(workoutReview(log("after", 400, partial))[0].observation, /not a like-for-like/);
  assert.match(workoutReview(log("after", 400, { ...ex, sets: sets([9, 9, 9], 120) }))[0].observation, /not a like-for-like/);
  const unchecked = { ...ex, sets: sets().map((set) => ({ ...set, completed: false })) };
  assert.match(workoutReview(log("after", 400, unchecked))[0].observation, /entries were saved/);
});
test("duration estimates follow actual routine history and scale when a session is shortened", () => {
  const workout = { id: "routine", userId: "owner", exercises: [{ plannedSets: 3 }] };
  assert.equal(estimateWorkoutMinutes(workout, [log("one", 100)]), 30);
  assert.equal(estimateWorkoutMinutes({ ...workout, exercises: [{ plannedSets: 2 }] }, [log("one", 100)]), 20);
});
