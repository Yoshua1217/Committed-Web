import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as firestore from "firebase/firestore";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";

let env;
const now = new Date();
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = localDate(now);
const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
const offset = -now.getTimezoneOffset();
const dayEndsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
const habit = { id: "habit", userId: "alice", name: "Read", createdAt: 1, createdOn: "2020-01-01", effectiveFrom: yesterday, deletedOn: null, history: {}, utcOffsetMinutes: offset };
const completion = { id: "entry", habitId: "habit", userId: "alice", date: today, completed: false, counterValue: 0, timerSeconds: 0, completedAt: null, utcOffsetMinutes: offset, dayEndsAt };
const db = () => env.authenticatedContext("alice").firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-habit-history", firestore: { host: "127.0.0.1", port: 8085, rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
after(async () => { await env?.cleanup(); });

async function seed(records) {
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [path, data] of Object.entries(records)) await setDoc(doc(context.firestore(), path), data);
  });
}

test("new habit transactions can read missing IDs and require today's creation date", async () => {
  const ref = doc(db(), "habits/new");
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { ...habit, id: "new", createdOn: today, effectiveFrom: today }));
  await assertFails(setDoc(doc(db(), "habits/backdated"), { ...habit, id: "backdated", effectiveFrom: yesterday }));
});

test("editing or deleting must archive the previous definition and preserve frozen versions", async () => {
  await seed({ "habits/habit": habit });
  const ref = doc(db(), "habits/habit");
  await assertFails(setDoc(ref, { ...habit, name: "Changed", effectiveFrom: today }));
  const { history: ignored, ...definition } = habit;
  const edited = { ...habit, name: "Changed", effectiveFrom: today, history: { [today]: definition } };
  await assertFails(setDoc(ref, { ...edited, history: { [today]: { ...definition, name: "Changed past" } } }));
  await assertSucceeds(setDoc(ref, edited));
  await assertFails(setDoc(ref, { ...edited, history: {} }));
  await assertFails(setDoc(ref, { ...edited, history: { [today]: { ...definition, name: "Tampered" } } }));
  await assertSucceeds(setDoc(ref, { ...edited, name: "Second edit" }));
  await assertFails(deleteDoc(ref));
  await assertSucceeds(setDoc(ref, { ...edited, deletedOn: today }));
  await assertFails(setDoc(ref, edited));
  const all = await assertSucceeds(getDocs(query(collection(db(), "habits"), where("userId", "==", "alice"))));
  assert.ok(all.docs.some((item) => item.id === "habit"));
});

test("legacy habits can be upgraded but old clients cannot overwrite history", async () => {
  const legacy = { id: "legacy", userId: "alice", name: "Legacy", createdAt: 1 };
  await seed({ "habits/legacy": legacy });
  const ref = doc(db(), "habits/legacy");
  await assertSucceeds(setDoc(ref, { ...legacy, name: "Edited", createdOn: "1970-01-01", effectiveFrom: today, deletedOn: null, history: { [today]: { ...legacy, createdOn: "1970-01-01" } }, utcOffsetMinutes: offset }));
  await assertFails(setDoc(ref, { ...legacy, name: "Old client write" }));
});

test("completion writes cannot create, edit, delete or move closed-day records", async () => {
  await seed({ "habits/habit": habit, "habit_completions/old": { ...completion, id: "old", date: yesterday } });
  const current = doc(db(), "habit_completions/current");
  await assertSucceeds(setDoc(current, { ...completion, id: "current" }));
  await assertSucceeds(updateDoc(current, { completed: true }));
  await assertFails(setDoc(doc(db(), "habit_completions/backdated"), { ...completion, date: yesterday }));
  const old = doc(db(), "habit_completions/old");
  await assertFails(updateDoc(old, { completed: true }));
  await assertFails(updateDoc(old, { date: today }));
  await assertFails(deleteDoc(old));
  await assertFails(updateDoc(current, { utcOffsetMinutes: 900 }));
  await assertFails(updateDoc(current, { dayEndsAt: dayEndsAt + 3600000 }));
  await seed({ "habit_completions/expired": { ...completion, dayEndsAt: Date.now() - 1000 } });
  await assertFails(updateDoc(doc(db(), "habit_completions/expired"), { completed: true }));
  await assertFails(setDoc(doc(env.authenticatedContext("bob").firestore(), "habit_completions/other"), completion));
});

test("legacy completions can be edited only today; deleted habits reject new completions", async () => {
  const { utcOffsetMinutes: ignored, ...legacy } = completion;
  await seed({ "habit_completions/legacy-today": legacy, "habit_completions/legacy-old": { ...legacy, date: yesterday }, "habits/deleted": { ...habit, id: "deleted", deletedOn: today } });
  await assertSucceeds(updateDoc(doc(db(), "habit_completions/legacy-today"), { utcOffsetMinutes: offset, completed: true }));
  await assertFails(updateDoc(doc(db(), "habit_completions/legacy-old"), { utcOffsetMinutes: offset, completed: true }));
  await assertFails(setDoc(doc(db(), "habit_completions/deleted"), { ...completion, habitId: "deleted" }));
});

test("explicit account reset may delete history while other accounts stay protected", async () => {
  await seed({ "habits/reset": { ...habit, id: "reset" }, "habit_completions/reset": { ...completion, date: yesterday }, "habits/bob": { ...habit, id: "bob", userId: "bob" } });
  await assertSucceeds(setDoc(doc(db(), "userSettings/alice"), { resettingHabits: true }));
  await assertSucceeds(deleteDoc(doc(db(), "habit_completions/reset")));
  await assertSucceeds(deleteDoc(doc(db(), "habits/reset")));
  await assertFails(deleteDoc(doc(db(), "habits/bob")));
  await deleteDoc(doc(db(), "userSettings/alice"));
});

// Run the real persistence code against the deployed-rule shape, not only hand-written writes.
function loadModule(file, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}

test("real service creates, upgrades legacy defaults, completes, edits and soft-deletes under the rules", async () => {
  const client = db();
  const history = loadModule("src/lib/habit-history.ts");
  const service = loadModule("src/lib/habits-service.ts", { "@/lib/firebase": { db: client }, "@/lib/habit-history": history, "firebase/firestore": firestore });
  const definition = { id: "integration", userId: "alice", name: "Charge laptop", bucketId: "", goalId: "", iconName: "Check", completionType: "checkbox", counterIncrement: 1, counterGoal: 10, timerGoalSeconds: 300, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true, pausePeriods: [], reminderTime: null, sortOrder: 0, createdAt: 1 };
  await service.createHabit(definition);
  await service.saveCompletion({ ...completion, id: "integration", habitId: definition.id });
  await service.saveHabit({ ...definition, name: "Rename" });
  await service.deleteHabit(definition.id);
  assert.equal((await getDoc(doc(client, "habits/integration"))).data().deletedOn, today);
  // Simulate an old document that predates optional fields and even the stored ID.
  await seed({ "habits/integration-legacy": { userId: "alice", name: "Legacy", monday: 0 } });
  await service.saveHabit({ ...definition, id: "integration-legacy", name: "Updated" });
  const migrated = (await getDoc(doc(client, "habits/integration-legacy"))).data();
  assert.equal(migrated.history[today].name, "Legacy");
  assert.equal(migrated.history[today].monday, false);
  await service.deleteHabit("integration-legacy");
  assert.equal((await getDoc(doc(client, "habits/integration-legacy"))).data().history[today].name, "Legacy");
});


test("creation works with owner-only reads, including reminders, without weakening ownership", async () => {
  // Reproduce the production failure: a nonexistent document has no owner.
  const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    .replaceAll("(isSignedIn() && resource == null) || isOwner(resource.data)", "isOwner(resource.data)");
  const strictEnv = await initializeTestEnvironment({
    projectId: "demo-habit-creation",
    firestore: { host: "127.0.0.1", port: 8085, rules },
  });
  try {
    const client = strictEnv.authenticatedContext("alice").firestore();
    const history = loadModule("src/lib/habit-history.ts");
    const service = loadModule("src/lib/habits-service.ts", {
      "@/lib/firebase": { db: client }, "@/lib/habit-history": history, "firebase/firestore": firestore,
    });
    const definition = {
      id: "new-reminder", userId: "alice", name: "Morning walk", bucketId: "", goalId: "",
      iconName: "CheckCircle", completionType: "checkbox", counterIncrement: 1, counterGoal: 10,
      timerGoalSeconds: 300, monday: true, tuesday: true, wednesday: true, thursday: true,
      friday: true, saturday: true, sunday: true, reminderTime: "05:00", sortOrder: 0, createdAt: 1,
    };
    await assertFails(service.saveHabit(definition));
    await assertSucceeds(service.createHabit(definition));
    const ref = doc(client, "habits", definition.id);
    const saved = (await getDoc(ref)).data();
    assert.equal(saved.reminderTime, "05:00");
    assert.equal(saved.createdOn, today);
    assert.equal(saved.effectiveFrom, today);
    assert.deepEqual(saved.history, {});
    await assertSucceeds(service.createHabit({ ...definition, id: "no-reminder", reminderTime: null }));
    assert.equal((await getDoc(doc(client, "habits/no-reminder"))).data().reminderTime, null);
    await assertSucceeds(service.saveHabit({ ...definition, name: "Evening walk", reminderTime: "17:00" }));
    assert.equal((await getDoc(ref)).data().reminderTime, "17:00");
    await assertFails(service.createHabit({ ...definition, id: "foreign-owner", userId: "bob" }));
    await assertFails(getDoc(doc(strictEnv.authenticatedContext("bob").firestore(), "habits", definition.id)));
    await assertFails(setDoc(doc(strictEnv.unauthenticatedContext().firestore(), "habits/anonymous"), { ...saved, id: "anonymous" }));
  } finally {
    await strictEnv.cleanup();
  }
});

test("manual corrections edit past results and retained deleted habits without backdating new habits", async () => {
  const original = { ...habit, id: "past-edit", createdAt: 1, createdOn: "2020-01-01" };
  await seed({
    "habits/past-edit": original,
    "habits/created-today": { ...habit, id: "created-today", createdOn: today, effectiveFrom: today },
    "habits/past-deleted": { ...original, id: "past-deleted", deletedOn: today, history: { [today]: { ...original, id: "past-deleted", monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true, pausePeriods: [] } } },
    "habit_completions/past-edit": { ...completion, id: "past-edit", habitId: "past-edit", date: yesterday, dayEndsAt: 1 },
  });
  const ref = doc(db(), "habit_completions/past-edit");
  await assertSucceeds(updateDoc(ref, { completed: true, manualHistoryEdit: true, includedInDay: true }));
  await assertSucceeds(updateDoc(ref, { completed: false }));
  await assertFails(updateDoc(ref, { date: today }));
  await assertFails(updateDoc(ref, { habitId: "created-today" }));
  const correction = { ...completion, date: yesterday, manualHistoryEdit: true, includedInDay: true };
  await assertSucceeds(setDoc(doc(db(), "habit_completions/deleted-correction"), { ...correction, habitId: "past-deleted" }));
  await assertFails(setDoc(doc(db(), "habit_completions/new-correction"), { ...correction, habitId: "created-today" }));
  await assertFails(setDoc(doc(db(), "habit_completions/future-correction"), { ...correction, habitId: "past-edit", date: "2999-01-01" }));
  await assertFails(setDoc(doc(env.authenticatedContext("bob").firestore(), "habit_completions/foreign-correction"), correction));

  const client = db();
  const history = loadModule("src/lib/habit-history.ts");
  const service = loadModule("src/lib/habits-service.ts", { "@/lib/firebase": { db: client }, "@/lib/habit-history": history, "firebase/firestore": firestore });
  const before = (await getDoc(doc(client, "habits/past-deleted"))).data();
  await service.editHabitCompletion("alice", "past-deleted", yesterday, true);
  const savedRef = doc(client, `habit_completions/habit-day-past-deleted-${yesterday}`);
  assert.equal((await getDoc(savedRef)).data().completed, true);
  await service.editHabitCompletion("alice", "past-deleted", yesterday, false, savedRef.id);
  assert.equal((await getDoc(savedRef)).data().completed, false);
  assert.deepEqual((await getDoc(doc(client, "habits/past-deleted"))).data(), before);
  await assert.rejects(service.editHabitCompletion("alice", "created-today", yesterday, true), /not part/);
});
