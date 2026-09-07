export const REPEAT_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type RepeatDay = typeof REPEAT_DAYS[number];
export type RepeatPreset = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";
export type RepeatRule = {
  preset: RepeatPreset;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  days: RepeatDay[];
  monthlyMode: "date" | "weekday" | "last";
  ends: "never" | "on" | "after";
  until: string;
  count: number;
};

export function zonedValues(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (name: string) => parts.find((part) => part.type === name)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}`, seconds: value("second") };
}

// Resolve civil time using IANA offsets, including the offset at the target date
// rather than today's offset. Reject nonexistent spring-forward times.
export function zonedDateTime(date: string, time: string, timeZone: string): Date {
  const desired = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(desired)) throw new Error("Choose a valid date and time.");
  let instant = desired;
  for (let index = 0; index < 4; index++) {
    const local = zonedValues(new Date(instant), timeZone);
    const delta = desired - Date.parse(`${local.date}T${local.time}:${local.seconds}Z`);
    if (!delta) return new Date(instant);
    instant += delta;
  }
  throw new Error("That time does not exist because the clocks change. Choose another time.");
}

export function repeatDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

export function defaultRepeat(startDate: string): RepeatRule {
  return { preset: "none", frequency: "WEEKLY", interval: 1, days: [REPEAT_DAYS[repeatDate(startDate).getUTCDay()]], monthlyMode: "date", ends: "never", until: startDate, count: 10 };
}

export function selectRepeatPreset(rule: RepeatRule, preset: RepeatPreset, startDate: string): RepeatRule {
  const days = [REPEAT_DAYS[repeatDate(startDate).getUTCDay()]];
  if (preset === "custom" || preset === "none") return { ...rule, preset };
  return { ...rule, preset, frequency: preset === "daily" ? "DAILY" : preset === "monthly" ? "MONTHLY" : preset === "yearly" ? "YEARLY" : "WEEKLY", interval: preset === "biweekly" ? 2 : 1, days: preset === "weekdays" ? ["MO", "TU", "WE", "TH", "FR"] : days, monthlyMode: "date" };
}

export function repeatError(rule: RepeatRule, startDate: string): string | null {
  if (rule.preset === "none") return null;
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 999) return "Repeat interval must be a whole number from 1 to 999.";
  if (rule.frequency === "WEEKLY" && !rule.days.length) return "Choose at least one repeat day.";
  if (rule.frequency === "WEEKLY" && !rule.days.includes(REPEAT_DAYS[repeatDate(startDate).getUTCDay()])) return "The start date must fall on one of the selected repeat days.";
  if (rule.ends === "on" && (!/^\d{4}-\d{2}-\d{2}$/.test(rule.until) || !Number.isFinite(repeatDate(rule.until).getTime()) || repeatDate(rule.until).toISOString().slice(0, 10) !== rule.until || rule.until < startDate)) return "The repeat end date must be a valid date on or after the event's start date.";
  if (rule.ends === "after" && (!Number.isInteger(rule.count) || rule.count < 1 || rule.count > 9999)) return "Enter a whole number of occurrences from 1 to 9,999.";
  return null;
}

export function buildRecurrence(rule: RepeatRule, startDate: string, allDay: boolean, timeZone: string): string[] {
  const error = repeatError(rule, startDate);
  if (error) throw new Error(error);
  if (rule.preset === "none") return [];
  const start = repeatDate(startDate);
  const fields = [`FREQ=${rule.frequency}`, `INTERVAL=${rule.interval}`];
  if (rule.frequency === "WEEKLY") fields.push(`BYDAY=${REPEAT_DAYS.filter((day) => rule.days.includes(day)).join(",")}`, "WKST=MO");
  if (rule.frequency === "MONTHLY") {
    if (rule.monthlyMode === "date") fields.push(`BYMONTHDAY=${start.getUTCDate()}`);
    else fields.push(`BYDAY=${rule.monthlyMode === "last" ? -1 : Math.ceil(start.getUTCDate() / 7)}${REPEAT_DAYS[start.getUTCDay()]}`);
  }
  if (rule.ends === "after") fields.push(`COUNT=${rule.count}`);
  if (rule.ends === "on") {
    const until = allDay ? rule.until.replaceAll("-", "") : zonedDateTime(rule.until, "23:59", timeZone).toISOString().replace(/[-:]/g, "").replace(".000", "").replace(/00Z$/, "59Z");
    fields.push(`UNTIL=${until}`);
  }
  return [`RRULE:${fields.join(";")}`];
}

// Only expose rules this editor can represent faithfully. Preserve all other
// imported RRULE/RDATE/EXDATE combinations verbatim until explicitly replaced.
export function readRecurrence(lines: string[] | undefined, startDate: string, timeZone: string): RepeatRule | null {
  const rule = defaultRepeat(startDate);
  if (!lines?.length) return rule;
  if (lines.length !== 1 || !lines[0].startsWith("RRULE:")) return null;
  const entries = lines[0].slice(6).split(";").map((entry) => entry.split("="));
  if (entries.some((entry) => entry.length !== 2) || new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  const fields = Object.fromEntries(entries);
  if (Object.keys(fields).some((key) => !["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "WKST", "COUNT", "UNTIL"].includes(key))) return null;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(fields.FREQ) || (fields.WKST && fields.WKST !== "MO") || (fields.COUNT && fields.UNTIL)) return null;
  rule.frequency = fields.FREQ as RepeatRule["frequency"];
  rule.interval = Number(fields.INTERVAL ?? 1);
  rule.preset = "custom";
  if (rule.frequency === "WEEKLY") {
    rule.days = fields.BYDAY ? fields.BYDAY.split(",") as RepeatDay[] : rule.days;
    if (rule.days.some((day) => !REPEAT_DAYS.includes(day)) || fields.BYMONTHDAY) return null;
  } else if (rule.frequency === "MONTHLY") {
    const start = repeatDate(startDate);
    if (fields.BYDAY) {
      if (fields.BYMONTHDAY) return null;
      if (fields.BYDAY === `-1${REPEAT_DAYS[start.getUTCDay()]}` && start.getUTCDate() + 7 > new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()) rule.monthlyMode = "last";
      else if (fields.BYDAY === `${Math.ceil(start.getUTCDate() / 7)}${REPEAT_DAYS[start.getUTCDay()]}`) rule.monthlyMode = "weekday";
      else return null;
    } else if (fields.BYMONTHDAY && fields.BYMONTHDAY !== String(start.getUTCDate())) return null;
  } else if (fields.BYDAY || fields.BYMONTHDAY) return null;
  if (fields.COUNT) { rule.ends = "after"; rule.count = Number(fields.COUNT); }
  if (fields.UNTIL) {
    rule.ends = "on";
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(fields.UNTIL);
    if (!match) return null;
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    const instant = match[4] ? new Date(`${date}T${match[4]}:${match[5]}:${match[6]}Z`) : null;
    if (instant && !Number.isFinite(instant.getTime())) return null;
    rule.until = instant ? zonedValues(instant, timeZone).date : date;
  }
  if (repeatError(rule, startDate)) return null;
  if (rule.interval === 1 && rule.frequency === "DAILY") rule.preset = "daily";
  if (rule.interval === 1 && rule.frequency === "YEARLY") rule.preset = "yearly";
  if (rule.interval === 1 && rule.frequency === "MONTHLY" && rule.monthlyMode === "date") rule.preset = "monthly";
  if (rule.frequency === "WEEKLY") {
    if (rule.days.length === 1 && rule.interval === 1) rule.preset = "weekly";
    if (rule.days.length === 1 && rule.interval === 2) rule.preset = "biweekly";
    if (rule.interval === 1 && rule.days.length === 5 && ["MO", "TU", "WE", "TH", "FR"].every((day) => rule.days.includes(day as RepeatDay))) rule.preset = "weekdays";
  }
  return rule;
}
