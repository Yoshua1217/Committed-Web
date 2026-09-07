import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}
const recurrence = load("src/lib/calendar-recurrence.ts");
const { defaultRepeat, selectRepeatPreset, buildRecurrence, readRecurrence, repeatError, zonedDateTime } = recurrence;
const writer = load("src/lib/calendar-event-write.ts", { "@/lib/calendar-recurrence": recurrence });
const api = load("src/lib/google-calendar-api.ts");
const zone = "America/Edmonton";
const start = "2026-09-07";
const preset = (name, date = start) => selectRepeatPreset(defaultRepeat(date), name, date);
const build = (rule, date = start, allDay = false) => buildRecurrence(rule, date, allDay, zone);
const draft = (patch = {}) => ({ summary: "Weekly planning", location: "", description: "", calendarId: "primary", allDay: false, startDate: start, endDate: start, startTime: "09:00", endTime: "10:00", timeZone: zone, ...patch });

test("presets serialize as a single Google series and round-trip", () => {
  for (const [name, expected] of [
    ["daily", "FREQ=DAILY;INTERVAL=1"],
    ["weekdays", "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;WKST=MO"],
    ["weekly", "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=MO"],
    ["biweekly", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;WKST=MO"],
    ["monthly", "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=7"],
    ["yearly", "FREQ=YEARLY;INTERVAL=1"],
  ]) {
    const lines = build(preset(name));
    assert.deepEqual(lines, [`RRULE:${expected}`]);
    assert.equal(readRecurrence(lines, start, zone).preset, name);
  }
  assert.deepEqual(build(preset("none")), []);
});

test("custom intervals, multiple weekdays, and occurrence limits include the first event", () => {
  const rule = { ...preset("custom"), interval: 3, days: ["FR", "MO", "WE"], ends: "after", count: 12 };
  assert.deepEqual(build(rule), ["RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,WE,FR;WKST=MO;COUNT=12"]);
  const parsed = readRecurrence(build(rule), start, zone);
  assert.equal(parsed.count, 12);
  assert.deepEqual(parsed.days, ["MO", "WE", "FR"]);
});

test("end dates are inclusive in the event timezone and date-only for all-day events", () => {
  const rule = { ...preset("weekly"), ends: "on", until: "2026-11-02" };
  assert.match(build(rule)[0], /UNTIL=20261103T065959Z$/);
  assert.match(build(rule, start, true)[0], /UNTIL=20261102$/);
  assert.equal(readRecurrence(build(rule), start, zone).until, "2026-11-02");
  assert.match(build({ ...rule, until: start })[0], /UNTIL=20260908T055959Z$/);
});

test("monthly day, ordinal weekday, last weekday, and leap day remain calendar based", () => {
  assert.match(build(preset("monthly", "2026-01-31"), "2026-01-31")[0], /BYMONTHDAY=31/);
  assert.match(build({ ...preset("monthly"), monthlyMode: "weekday" })[0], /BYDAY=1MO/);
  const last = { ...preset("monthly", "2026-09-28"), monthlyMode: "last" };
  assert.match(build(last, "2026-09-28")[0], /BYDAY=-1MO/);
  assert.equal(readRecurrence(build(last, "2026-09-28"), "2026-09-28", zone).monthlyMode, "last");
  assert.deepEqual(build(preset("yearly", "2028-02-29"), "2028-02-29"), ["RRULE:FREQ=YEARLY;INTERVAL=1"]);
});

test("invalid repeats fail before a request can be sent", () => {
  for (const patch of [{ interval: 0 }, { interval: 1.5 }, { interval: NaN }, { interval: 1000 }, { days: [] }, { days: ["TU"] }, { ends: "on", until: "" }, { ends: "on", until: "2026-09-06" }, { ends: "after", count: 0 }, { ends: "after", count: 1.5 }, { ends: "after", count: 10000 }]) {
    const rule = { ...preset("weekly"), ...patch };
    assert.ok(repeatError(rule, start));
    assert.throws(() => build(rule));
  }
});

test("advanced imported schedules are never silently simplified", () => {
  for (const lines of [
    ["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE:20260914T150000Z"],
    ["RDATE:20260914T150000Z"], ["RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2"],
    ["RRULE:FREQ=YEARLY;BYMONTH=2"], ["RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO"],
    ["RRULE:FREQ=MONTHLY;BYMONTHDAY=1,7"], ["RRULE:FREQ=DAILY;COUNT=2;UNTIL=20260910"],
  ]) assert.equal(readRecurrence(lines, start, zone), null);
});

test("IANA timezone survives winter, summer, fractional offsets and rejects skipped times", () => {
  assert.equal(zonedDateTime("2026-01-05", "09:00", zone).toISOString(), "2026-01-05T16:00:00.000Z");
  assert.equal(zonedDateTime(start, "09:00", zone).toISOString(), "2026-09-07T15:00:00.000Z");
  assert.equal(zonedDateTime(start, "09:00", "Asia/Kathmandu").toISOString(), "2026-09-07T03:15:00.000Z");
  assert.throws(() => zonedDateTime("2026-03-08", "02:30", zone), /clocks change/);
});

test("event payloads include recurrence, timezone, and exclusive multi-day all-day ends", () => {
  const lines = build(preset("biweekly"));
  const timed = writer.eventWriteFromDraft(draft({ recurrence: lines }));
  assert.deepEqual(timed.recurrence, lines);
  assert.deepEqual(timed.start, { dateTime: "2026-09-07T15:00:00.000Z", timeZone: zone });
  const allDay = writer.eventWriteFromDraft(draft({ allDay: true, startDate: "2026-12-30", endDate: "2026-12-31", recurrence: ["RRULE:FREQ=YEARLY"] }));
  assert.deepEqual(allDay.start, { date: "2026-12-30" });
  assert.deepEqual(allDay.end, { date: "2027-01-01" });
});

test("editing an occurrence cannot overwrite recurrence and untouched times are omitted", () => {
  const event = { id: "instance", calendarId: "primary", recurringEventId: "parent", start: { dateTime: "2026-09-07T09:00:00-06:00", timeZone: zone }, end: { dateTime: "2026-09-07T10:00:00-06:00", timeZone: zone } };
  const patch = writer.eventPatchFromDraft(draft({ recurrence: [] }), event);
  assert.equal("recurrence" in patch, false);
  assert.equal("start" in patch, false);
  assert.equal("end" in patch, false);
  const parent = { ...event, recurringEventId: undefined, recurrence: ["RRULE:FREQ=WEEKLY"] };
  assert.deepEqual(writer.eventPatchFromDraft(draft({ recurrence: [] }), parent).recurrence, []);
  assert.equal("recurrence" in writer.eventPatchFromDraft(draft(), parent), false);
});

test("Google insert and patch transmit repeat rules; list follows all instance pages", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    if (init.method) return new Response(JSON.stringify({ id: "parent" }));
    const second = new URL(url).searchParams.has("pageToken");
    return new Response(JSON.stringify(second ? { items: [{ id: "instance-2" }, { id: "cancelled", status: "cancelled" }] } : { items: [{ id: "instance-1" }], nextPageToken: "next +/" }));
  });
  const payload = writer.eventWriteFromDraft(draft({ recurrence: build(preset("weekly")) }));
  await api.insertGoogleEvent("test-token", "calendar/id", payload);
  assert.deepEqual(JSON.parse(calls[0].init.body).recurrence, payload.recurrence);
  await api.patchGoogleEvent("test-token", "calendar/id", "parent", { recurrence: [] }, "none", '"etag"');
  assert.deepEqual(JSON.parse(calls[1].init.body), { recurrence: [] });
  assert.equal(calls[1].init.headers["If-Match"], '"etag"');
  const events = await api.listGoogleEvents("test-token", "calendar/id", "2026-09-01", "2026-12-01", zone);
  assert.deepEqual(events.map((event) => event.id), ["instance-1", "instance-2"]);
  assert.equal(new URL(calls[2].url).searchParams.get("singleEvents"), "true");
  assert.equal(new URL(calls[3].url).searchParams.get("pageToken"), "next +/");
});

test("failed instance refresh is reported instead of silently clearing the calendar", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "Access expired" } }), { status: 401 }));
  await assert.rejects(api.listGoogleEvents("test-token", "primary", start, start, zone), /Access expired/);
});

test("changing an existing series to all-day clears Google's old datetime fields", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "parent" }));
  });
  await api.patchGoogleEvent("token", "primary", "parent", writer.eventWriteFromDraft(draft({ allDay: true, recurrence: build(preset("weekly"), start, true) })), "none");
  assert.deepEqual(body.start, { date: start, dateTime: null, timeZone: null });
  assert.deepEqual(body.end, { date: "2026-09-08", dateTime: null, timeZone: null });
  await api.patchGoogleEvent("token", "primary", "parent", writer.eventWriteFromDraft(draft()), "none");
  assert.equal(body.start.date, null);
  assert.equal(body.start.timeZone, zone);
});
