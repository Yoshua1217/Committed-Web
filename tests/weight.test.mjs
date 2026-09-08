import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function setup() {
  const records = new Map();
  let day = "2026-09-07";
  let fail = false;
  const completed = new Set();
  const snapshot = (ref) => ({ exists: () => records.has(ref), data: () => structuredClone(records.get(ref)) });
  const sdk = {
    doc: (_db, collection, id) => `${collection}/${id}`,
    getDoc: async (ref) => snapshot(ref),
    setDoc: async (ref, data) => { records.set(ref, { ...records.get(ref), ...structuredClone(data) }); },
    runTransaction: async (_db, run) => { if (fail) throw new Error("offline"); return run({ get: async (ref) => snapshot(ref), set: (ref, data) => records.set(ref, structuredClone(data)) }); },
  };
  function load(name, extra = {}) {
    const js = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    const mocks = { "firebase/firestore": sdk, "@/lib/firebase": { db: {} }, ...extra };
    new Function("require", "module", "exports", js)((dependency) => { if (!(dependency in mocks)) throw new Error(dependency); return mocks[dependency]; }, mod, mod.exports);
    return mod.exports;
  }
  const settings = load("settings-service");
  const service = load("weight-service", {
    "@/lib/settings-service": settings,
    "@/lib/habits-service": { todayString: () => day, markHabitComplete: async (user, habit, date) => { if (habit === "deleted" || date !== day) return null; completed.add(`${user}/${habit}/${date}`); return { completed: true }; } },
  });
  return { ...service, settings, records, completed, setDay: (value) => { day = value; }, fail: () => { fail = true; } };
}

test("weight input accepts pounds and decimals and rejects empty, negative and non-numeric values", () => {
  const { parseWeightLbs } = setup();
  for (const value of ["", " ", "0", "-1", "NaN", "Infinity", "1e2", "180lbs", "2001", "180.123"]) assert.equal(parseWeightLbs(value), null, value);
  assert.equal(parseWeightLbs(" 180.25 "), 180.25);
  assert.equal(parseWeightLbs("180"), 180);
});

test("weight persists by owner and day; correction replaces only today and retains creation time", async () => {
  const service = setup();
  assert.equal(await service.getDailyWeight("alice", "2026-09-07"), null);
  const first = await service.saveDailyWeight("alice", "2026-09-07", 180.5);
  await service.saveDailyWeight("alice", "2026-09-07", 181);
  assert.equal(service.records.size, 1);
  assert.equal((await service.getDailyWeight("alice", "2026-09-07")).createdAt, first.createdAt);
  assert.equal((await service.getDailyWeight("alice", "2026-09-07")).weightLbs, 181);
  assert.equal(await service.getDailyWeight("bob", "2026-09-07"), null);
  service.setDay("2026-09-08");
  assert.equal(await service.getDailyWeight("alice", "2026-09-08"), null);
  await service.saveDailyWeight("alice", "2026-09-08", 180);
  assert.equal(service.records.size, 2);
  await assert.rejects(service.saveDailyWeight("alice", "2026-09-07", 179), /new day/);
  service.fail();
  await assert.rejects(service.saveDailyWeight("alice", "2026-09-08", 179), /offline/);
  assert.equal((await service.getDailyWeight("alice", "2026-09-08")).weightLbs, 180);
});

test("weight mapping is optional, remembers selection, completes only its habit and preserves other settings", async () => {
  const service = setup();
  assert.equal(await service.completeWeightHabit("alice", "2026-09-07"), "choose");
  service.records.set("userSettings/alice", { darkMode: true, workoutHabitMappingHabitId: "training" });
  await service.settings.saveWeightHabitMapping("alice", "weigh-in");
  const settings = await service.settings.getSettings("alice");
  assert.equal(settings.darkMode, true);
  assert.equal(settings.workoutHabitMappingHabitId, "training");
  await service.saveDailyWeight("alice", "2026-09-07", 180);
  assert.equal(await service.completeWeightHabit("alice", "2026-09-07"), "completed");
  assert.equal(await service.completeWeightHabit("alice", "2026-09-07"), "completed");
  assert.equal(service.completed.size, 1);
  await service.settings.saveWeightHabitMapping("alice", null);
  assert.equal(await service.completeWeightHabit("alice", "2026-09-07"), "disabled");
  await service.settings.saveWeightHabitMapping("alice", "deleted");
  assert.equal(await service.completeWeightHabit("alice", "2026-09-07"), "unavailable");
  assert.equal((await service.getDailyWeight("alice", "2026-09-07")).weightLbs, 180);
});
