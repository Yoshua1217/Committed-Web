"use client";

import { useEffect, useMemo, useState } from "react";
import { Habit, HabitCompletion } from "@/lib/types";
import { getCompletionsForUser } from "@/lib/habits-service";
import { isScheduledForDate } from "@/lib/streak-calculator";

type Range = "week" | "month" | "year";

interface ChartPoint {
  date: string;
  label: string;
  value: number;
  scheduled: number;
}

const rangeDays: Record<Range, number> = { week: 7, month: 30, year: 365 };
const chartWidth = 680;
const chartHeight = 250;
const padding = { top: 24, right: 18, bottom: 34, left: 42 };

function toDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function colorFor(value: number) {
  if (value < 25) return "#ef4444";
  if (value <= 75) return "#f5b942";
  return "#28b66f";
}

function formatDate(date: string, range: Range) {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(range === "year" ? { year: "numeric" } : {}),
  }).format(parsed);
}

export default function HabitCompletionChart({ userId, habits, todayCompletions }: { userId: string; habits: Habit[]; todayCompletions: HabitCompletion[] }) {
  const [range, setRange] = useState<Range>("week");
  const [history, setHistory] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getCompletionsForUser(userId)
      .then((data) => { if (active) setHistory(data); })
      .catch((error) => console.error("Could not load habit history:", error))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const points = useMemo<ChartPoint[]>(() => {
    const completionMap = new Map(history.map((completion) => [`${completion.habitId}:${completion.date}`, completion]));
    todayCompletions.forEach((completion) => completionMap.set(`${completion.habitId}:${completion.date}`, completion));
    const days = rangeDays[range];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: days }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (days - 1 - index));
      const date = toDateString(day);
      const scheduled = habits.filter((habit) => {
        const createdOn = habit.createdAt ? toDateString(new Date(habit.createdAt)) : null;
        const completion = completionMap.get(`${habit.id}:${date}`);
        return (createdOn === null || date >= createdOn) && (isScheduledForDate(habit, date) || completion?.completed);
      });
      const progress = scheduled.reduce((total, habit) => {
        const completion = completionMap.get(`${habit.id}:${date}`);
        if (habit.completionType === "counter" && habit.counterGoal > 0) return total + Math.min((completion?.counterValue ?? 0) / habit.counterGoal, 1);
        if (habit.completionType === "timer" && habit.timerGoalSeconds > 0) return total + Math.min((completion?.timerSeconds ?? 0) / habit.timerGoalSeconds, 1);
        return total + (completion?.completed ? 1 : 0);
      }, 0);
      const value = scheduled.length ? Math.round((progress / scheduled.length) * 100) : 0;
      return { date, label: formatDate(date, range), value, scheduled: scheduled.length };
    });
  }, [habits, history, range, todayCompletions]);

  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const xFor = (index: number) => padding.left + (points.length === 1 ? 0 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) => padding.top + ((100 - value) / 100) * plotHeight;
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(point.value).toFixed(2)}`).join(" ");
  const hovered = hoveredIndex === null ? null : points[hoveredIndex];

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartWidth;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(((x - padding.left) / plotWidth) * (points.length - 1))));
    setHoveredIndex(index);
  };

  return (
    <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "20px 16px 14px", overflow: "hidden", boxShadow: "0 14px 34px rgba(0,0,0,0.04)" }}>
      <div className="habit-chart-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
        <div>
          <p style={{ color: "var(--primary)", fontSize: 16, fontWeight: 750, margin: 0 }}>Completion graph</p>
          <p style={{ color: "var(--secondary)", fontSize: 12, margin: "4px 0 0" }}>Daily habit progress · hover for details</p>
        </div>
        <div role="group" aria-label="Completion chart range" style={{ display: "flex", background: "var(--surface-variant)", padding: 3, borderRadius: 11 }}>
          {(["week", "month", "year"] as Range[]).map((option) => {
            const active = range === option;
            return <button key={option} onClick={() => setRange(option)} style={{ minHeight: 31, border: 0, borderRadius: 8, padding: "0 10px", cursor: "pointer", background: active ? "var(--surface)" : "transparent", color: active ? "var(--primary)" : "var(--secondary)", fontWeight: active ? 750 : 600, fontSize: 12, boxShadow: active ? "0 1px 4px rgba(0,0,0,0.12)" : "none", textTransform: "capitalize" }}>{option}</button>;
          })}
        </div>
      </div>

      {loading ? <div style={{ height: 250, display: "grid", placeItems: "center", color: "var(--secondary)", fontSize: 13 }}>Loading your progress…</div> : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Daily habit completion percentage" onPointerMove={onPointerMove} onPointerLeave={() => setHoveredIndex(null)} style={{ display: "block", width: "100%", height: "auto", minHeight: 210, cursor: "crosshair", overflow: "visible" }}>
            <defs>
              <linearGradient id="habit-line-gradient" x1="0" y1="0" x2="1" y2="0">
                {points.map((point, index) => <stop key={point.date} offset={`${(index / Math.max(points.length - 1, 1)) * 100}%`} stopColor={colorFor(point.value)} />)}
              </linearGradient>
            </defs>
            {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={padding.left} x2={chartWidth - padding.right} y1={yFor(value)} y2={yFor(value)} stroke="var(--border)" strokeWidth="1" strokeDasharray={value === 0 ? "0" : "3 5"} /><text x={padding.left - 8} y={yFor(value) + 4} textAnchor="end" fill="var(--secondary)" fontSize="10" fontWeight="600">{value}%</text></g>)}
            <path d={linePath} fill="none" stroke="url(#habit-line-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {hoveredIndex !== null && <><line x1={xFor(hoveredIndex)} x2={xFor(hoveredIndex)} y1={padding.top} y2={padding.top + plotHeight} stroke="var(--secondary)" opacity="0.3" strokeDasharray="3 4" /><circle cx={xFor(hoveredIndex)} cy={yFor(points[hoveredIndex].value)} r="6" fill="var(--surface)" stroke={colorFor(points[hoveredIndex].value)} strokeWidth="3" /></>}
            {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((index) => <text key={index} x={xFor(index)} y={chartHeight - 10} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="var(--secondary)" fontSize="10" fontWeight="600">{points[index].label}</text>)}
          </svg>
          {hovered && <div style={{ position: "absolute", left: `${(xFor(hoveredIndex!) / chartWidth) * 100}%`, top: Math.max(2, (yFor(hovered.value) / chartHeight) * 100 - 22) + "%", transform: "translate(-50%, -100%)", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 1, background: "var(--primary)", color: "var(--background)", padding: "7px 9px", borderRadius: 9, fontSize: 11, fontWeight: 700, boxShadow: "0 6px 18px rgba(0,0,0,0.18)" }}><span style={{ opacity: 0.7, fontWeight: 600 }}>{hovered.label}</span><span style={{ marginLeft: 7 }}>{hovered.value}%</span></div>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 2, color: "var(--secondary)", fontSize: 10, fontWeight: 600 }}><span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#ef4444", marginRight: 4 }} />Under 25%</span><span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#f5b942", marginRight: 4 }} />25–75%</span><span><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#28b66f", marginRight: 4 }} />Above 75%</span></div>
    </section>
  );
}
