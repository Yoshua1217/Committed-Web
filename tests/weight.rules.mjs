import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: "demo-weight-logging", firestore: { host: "127.0.0.1", port: 8085, rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } }); });
after(async () => { await env?.cleanup(); });
const entry = { id: "alice_2026-09-07", userId: "alice", date: "2026-09-07", weightLbs: 180.5, createdAt: 1, updatedAt: 1 };

test("daily weight permits owner reads, corrections and reset deletion; denies other users and anonymous access", async () => {
  const db = env.authenticatedContext("alice").firestore();
  const ref = doc(db, "weight_logs", entry.id);
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, entry));
  await assertSucceeds(setDoc(ref, { ...entry, weightLbs: 181, updatedAt: 2 }));
  assert.equal((await getDoc(ref)).data().weightLbs, 181);
  await assertSucceeds(getDocs(query(collection(db, "weight_logs"), where("userId", "==", "alice"))));
  for (const stranger of [env.authenticatedContext("bob").firestore(), env.unauthenticatedContext().firestore()]) {
    const other = doc(stranger, "weight_logs", entry.id);
    await assertFails(getDoc(other));
    await assertFails(setDoc(other, entry));
    await assertFails(deleteDoc(other));
  }
  await assertSucceeds(deleteDoc(ref));
});

test("weight rules reject invalid data, owner changes and alternate IDs for the same day", async () => {
  const db = env.authenticatedContext("alice").firestore();
  const ref = doc(db, "weight_logs", entry.id);
  for (const weightLbs of [0, -10, 2001, "180", null]) await assertFails(setDoc(ref, { ...entry, weightLbs }));
  await assertFails(setDoc(ref, { ...entry, extra: true }));
  await assertFails(setDoc(doc(db, "weight_logs", "duplicate"), entry));
  await assertFails(setDoc(ref, { ...entry, userId: "bob" }));
  await assertSucceeds(setDoc(ref, entry));
  await assertFails(setDoc(ref, { ...entry, createdAt: 2 }));
});
