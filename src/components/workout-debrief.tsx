import MaterialIcon from "@/components/material-icon";
import { workoutReview, workingSets } from "@/lib/workout-coaching";
import type { WorkoutSession } from "@/lib/types";
import styles from "./workout-coaching.module.css";

export default function WorkoutDebrief({ session }: { session: WorkoutSession }) {
  const reviews = workoutReview(session);
  const complete = session.exercises.reduce((sum, exercise) => sum + workingSets(exercise).length, 0);
  const planned = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.kind !== "warmup").length, 0);
  return <section className={styles.review} aria-label="Workout coaching review">
    <div className={styles.reviewIntro}><p className={styles.eyebrow}><MaterialIcon name="check_circle" size={16} />Your session, reviewed</p><h2>{complete > 0 && complete === planned ? "You followed through." : "Your work counts."}</h2><p className={styles.muted}>{complete ? `${complete} working set${complete === 1 ? "" : "s"} completed.${complete < planned ? " A partial session still counts; unfinished sets aren’t treated as lost strength." : " Consistency matters alongside personal records."}` : "Your logged entries are saved. Checked working sets will help make next time’s guidance more specific."}</p>{session.adjustedFromSetCount && complete > 0 && complete === planned && <p className={styles.muted}>You completed the shorter session you chose. Your saved routine is unchanged.</p>}</div>
    {reviews.map((review) => <article className={styles.reviewCard} key={review.exerciseId}><span className={`${styles.eyebrow} ${review.outcome === "improved" || review.outcome === "consistent" ? styles.positive : ""}`}>{review.outcome === "improved" ? "Progress made" : review.outcome === "consistent" ? "Consistency built" : review.outcome === "adjust" ? "Room to adjust" : "Learning your baseline"}</span><h3>{review.name}</h3><p className={styles.muted}>{review.observation}</p><div className={styles.nextFocus}><strong>Next session</strong>{review.next}<details className={styles.explanation}><summary>Why this next step?</summary><p>{review.nextWhy}</p></details></div></article>)}
  </section>;
}
