"use client";

import { useEffect, useState } from "react";
import TrainingWeekCard from "@/components/training-week-card";
import { subscribeToCompletedWorkoutSessions } from "@/lib/workouts-service";
import type { WorkoutSession } from "@/lib/types";

export default function HomeTrainingWeekCard({ userId, today }: { userId: string; today: string }) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => subscribeToCompletedWorkoutSessions(userId, (items) => {
    setSessions(items);
    setLoading(false);
    setError(false);
  }, () => {
    setLoading(false);
    setError(true);
  }), [userId]);

  return <TrainingWeekCard sessions={sessions} today={today} loading={loading} error={error} showHeading={false} />;
}
