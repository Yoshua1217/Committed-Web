export function getProgressColor(percent: number): string {
  if (percent < 30) return "#EF4444";
  if (percent < 70) return "#FBBF24";
  return "#22C55E";
}
