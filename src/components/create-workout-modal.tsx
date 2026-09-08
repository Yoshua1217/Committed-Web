"use client";
import { useState } from "react";
import WorkoutEditor from "@/components/workout-editor";
import type { WorkoutDefinition } from "@/lib/types";
interface Props { isOpen: boolean; userId: string; nextSortOrder: number; onClose: () => void; onCreate: (workout: WorkoutDefinition) => Promise<void> }
export default function CreateWorkoutModal(props: Props) { return props.isOpen ? <NewWorkout key={props.userId} {...props} /> : null; }
function NewWorkout({ userId, nextSortOrder, onClose, onCreate }: Props) {
  const [initial] = useState<WorkoutDefinition>(() => ({ id: crypto.randomUUID(), userId, name: "New workout", description: "", scheduledDays: [], scheduledStartTimes: {}, exercises: [], sortOrder: nextSortOrder, createdAt: Date.now(), updatedAt: Date.now() }));
  return <WorkoutEditor initial={initial} creating onClose={onClose} onSave={onCreate} />;
}
