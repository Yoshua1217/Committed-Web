import { ActivityIntensity } from "@/lib/types";

export const activityIntensities: Array<{ value: ActivityIntensity; label: string; description: string; icon: string }> = [
  { value: "easy", label: "Easy", description: "Relaxed, restorative, or comfortably conversational.", icon: "spa" },
  { value: "steady", label: "Steady", description: "Purposeful effort you could sustain for a while.", icon: "directions_run" },
  { value: "hard", label: "Hard", description: "Challenging and focused, with limited room to coast.", icon: "bolt" },
  { value: "all_out", label: "All out", description: "Maximum effort or a truly demanding day.", icon: "local_fire_department" },
];

export function activityIntensityMeta(value: ActivityIntensity | null | undefined) {
  return activityIntensities.find((intensity) => intensity.value === value) ?? null;
}
