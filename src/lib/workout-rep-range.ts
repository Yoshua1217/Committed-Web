export interface RepPlan { plannedReps: number; plannedRepsMax?: number }

/** A missing upper bound preserves the original fixed-rep target. */
export function repRange(plan: RepPlan) {
  const min = Number.isSafeInteger(plan.plannedReps) && plan.plannedReps > 0 ? plan.plannedReps : 10;
  const max = Number.isSafeInteger(plan.plannedRepsMax) && plan.plannedRepsMax! >= min ? plan.plannedRepsMax! : min;
  return { min, max };
}

export function formatRepRange(plan: RepPlan) {
  const { min, max } = repRange(plan);
  return min === max ? String(min) : `${min}–${max}`;
}

export function validRepRange(plan: RepPlan) {
  return Number.isSafeInteger(plan.plannedReps) && plan.plannedReps > 0
    && (plan.plannedRepsMax === undefined || (Number.isSafeInteger(plan.plannedRepsMax) && plan.plannedRepsMax >= plan.plannedReps));
}
