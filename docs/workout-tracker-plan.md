# Workout tracker — product and implementation reference

## Purpose

Replace the existing Workout tab placeholder with a cloud-backed workout tracker.
Workout definitions and workout history belong to the signed-in user. The exercise
catalogue is a hardcoded application data source for the first release; it is not
editable in the app yet.

This document records the agreed product vision before implementation. It is not
the exercise catalogue — that will be added next.

## Workout tab

The page is a vertically scrolling dashboard with a prominent **Create workout**
action in the top area.

### 1. Today's workout card

At the top of the screen, show a large card for the workout scheduled for the
current local date. It contains:

- `Today's workout` and the full date.
- Workout name and a concise supporting detail such as the description or target
  muscles.
- A **Preview** button.
- A **Start** button.

If no workout is scheduled today, retain the card and explicitly show that no
workout is planned, with an appropriate route to create or choose one. Starting
should only be enabled when a scheduled workout exists.

### 2. This week's completion card

Show seven circular day indicators in Monday-to-Sunday order, labelled with first
letters: `M T W T F S S`.

- **Green / done**: the scheduled workout for that day was completed.
- **Red / missed**: a scheduled workout exists for a past day and it was not
  completed.
- **Yellow / pending**: today or a future scheduled workout is still pending.
- Days without a scheduled workout use a neutral treatment, rather than counting
  as done, missed, or pending.

Below the circles, show the percentage of scheduled workouts completed this week.
The denominator includes only scheduled days from Monday through today; future
days never lower the percentage. If no workout has been scheduled in that period,
show `0%` plus a helpful empty-state label rather than presenting an undefined
percentage.

### 3. Scheduled workouts

Below the weekly card, list the user's scheduled workouts in cyclic day-of-week
order beginning with today. Example: on Tuesday, display Tuesday, Wednesday,
Thursday, Friday, Saturday, Sunday, then Monday. Each item shows its scheduled
day, workout name, and enough detail to distinguish it; it opens its preview.

### 4. Exercise library

At the bottom of the tab, show all hardcoded exercises grouped by muscle group.
This is a browsable reference list, not a separate user-managed database.

## Create and edit workout

The create-workout flow must let a user give a workout a name and description,
choose its scheduled day(s), and add ordered exercises from the hardcoded exercise
catalogue. For each workout exercise, the user sets the planned number of sets and
repetitions. Editing an existing workout should use the same model and preserve
historical completed workout records.

### Create-workout interaction

**Create workout** opens a full-screen form. It begins with an editable `New
workout` title and a short description field, followed by the existing M–S circular
day selector used by Habits. Selecting a day determines when this cloud-saved
workout appears on the dashboard.

Below the schedule is an exercise search. It matches exercise names, summaries,
instructions, and muscle groups, while the unfiltered list is grouped by primary
muscle group. Tapping an exercise opens a detail popup with all catalogue content,
including every muscle group, summary, and instructions. The popup has close and
add-to-workout actions plus planned **sets** and **reps** inputs.

Added exercises move above search into green selected-exercise cards. These cards
allow the user to edit sets and reps or remove an exercise before saving. A sticky
bottom **Create workout** action is disabled until the workout has a name, at least
one training day, and at least one selected exercise.

## Workout preview sheet

Selecting **Preview** opens a full-screen mobile-first sheet that animates upward
from the bottom. It supports swipe-down dismissal on touch devices and an
equivalent visible close/exit control for accessibility and desktop use.

Content, in order:

1. Workout name.
2. Workout description.
3. Muscles hit (derived from the selected exercises, with a de-duplicated list).
4. Ordered exercises. Each includes its name, `Set <planned set count> × Rep
   <planned rep count>` summary, and a one-sentence hardcoded description of what
   it is good for.

The sticky bottom action area has **Exit** and **Start workout** buttons. Both the
top-card Start action and preview Start action create/open the same active workout
session.

## Active workout session

Starting a workout opens a separate full-screen tracking view. It is deliberately
not dismissible like a preview sheet: navigation away must warn the user about the
active session instead of silently discarding it. The active session must be
persisted immediately and restored on launch; when Capacitor support is added, a
native app reopened while an active session exists must route directly to this
screen.

### Visual direction

The active screen should use the supplied workout-app reference as its interaction
and information-density model, while looking unmistakably like Committed rather
than copying that app's dark purple/blue styling. In particular:

- Use Committed's existing surface, border, primary/secondary text, success, and
  accent tokens; support both of the app's themes. Avoid the reference's external
  bottom navigation, which belongs to that app rather than this full-screen flow.
- Keep a compact, sticky top bar with a guarded back/close action on the left, a
  large centred elapsed-time display, and a prominent completion/next action on
  the right. The exact right action should make completion unambiguous in
  Committed's icon and label style.
- Present each exercise in a clear card/section. Its header includes the exercise
  name, optional small exercise illustration only if the hardcoded catalogue later
  provides one, an expand/collapse chevron, and an overflow menu for exercise-level
  actions.
- Place optional rest-timer controls directly beneath the expanded exercise header:
  timer icon, editable rest duration, and an enabled toggle. This is a planned
  enhancement to the active flow; it should be designed now but may ship after the
  core set logger.
- Put a compact column header above the set table: `SET`, `PREV`, `LBS`, and
  `REPS`. Rows use large, easy-to-tap cells: a numbered set chip, prior-performance
  value (or `—` when unavailable), editable weight and rep fields, and a circular
  completion check control.
- Keep **+ Add set** as a full-width action below the set rows. It should use
  Committed's button treatment and sit inside the exercise section, matching the
  reference's fast one-handed logging rhythm.
- Make exercise cards independently collapsible so a long workout stays scannable.
  The current exercise should be visually strongest; collapsed exercises show only
  their name and compact progress state.
- On mobile, respect safe-area insets, keep the elapsed timer visible while logging,
  and ensure controls remain usable above the system gesture area.

For every exercise, display the planned number of set rows initially. Each row
captures:

- Set number.
- Weight in pounds.
- Actual repetitions.

Tapping/clicking a set number opens a small action popup with **Remove set** and
**Close**. Removing is allowed even for a planned row. An **Add set** button sits
below the final set row for that exercise. Set numbers are reindexed after a
removal, while the original plan remains intact in the session data.

The session also needs a clear completion action (for example, **Finish workout**)
that records the actual sets, completed timestamp, and duration; until it is
finished, it remains the user's active workout.

## Timer and notifications

Starting a session records an immutable `startedAt` timestamp. The displayed
elapsed time is always calculated from that timestamp, rather than counting only
while the web view is open. This makes it correct after the display sleeps, the
phone locks, or the app resumes.

For the upcoming Capacitor implementation, the active workout should use native
foreground/background support to present a persistent notification containing the
elapsed workout time. The app must update or restore the notification when resumed
and remove it when the workout is finished. A web-only build cannot reliably keep
a timer process or persistent notification alive while a phone is off; it can
correctly restore elapsed time from `startedAt` and should gracefully omit the
native notification behavior until Capacitor is available.

## Data model (cloud)

Use the existing per-user cloud-data pattern. Firestore collection names below are
proposed and can be adjusted to match the existing service conventions.

### Hardcoded exercise catalogue

`ExerciseDefinition` is now populated in
`src/data/exercise-catalogue.json`. It is a JSON array, not Markdown or a database
document, so any UI can read an exercise's name, summary, instructions, and muscle
groups directly without parsing text. IDs are stable lowercase slugs and must never
be derived at runtime from the display name.

```ts
type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Forearms"
  | "Core"
  | "Quadriceps"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Full body";

interface ExerciseDefinition {
  id: string;               // stable slug, e.g. "dumbbell-bench-press"
  name: string;
  loadType: "external_weight" | "bodyweight" | "assistance" | "added_weight";
  restSeconds: number;      // recommended rest between working sets
  primaryMuscleGroups: MuscleGroup[]; // controls library grouping and sorting
  secondaryMuscleGroups: MuscleGroup[];
  summary: string;          // one concise sentence for workout preview/library
  instructions: string;     // display-ready paragraph with setup and execution
}

```

The first 32 exercises are now catalogued. Their anatomical descriptions were
normalized into the controlled muscle-group list above. Stabilizers and minor
assist muscles are generally omitted from `secondaryMuscleGroups` unless they
meaningfully help a user browse the library.

### Future stretching catalogue

A separate hardcoded stretching catalogue will be added in the future, using the
same JSON shape and stable-ID approach as the exercise catalogue. Its records will
include `id`, `name`, `primaryMuscleGroups`, `secondaryMuscleGroups`, `summary`, and
`instructions`, allowing the app to retrieve and group stretch information exactly
as it does strength exercises. Keep it in a separate source file (proposed:
`src/data/stretching-catalogue.json`) so the workout and stretch libraries can be
browsed independently, then combined later if a workout can include stretches.

### Cloud workout definitions

Store at `users/{userId}/workouts/{workoutId}` (or equivalent user-scoped
collection):

```ts
interface WorkoutDefinition {
  id: string;
  userId: string;
  name: string;
  description: string;
  scheduledDays: number[];  // 0 = Monday through 6 = Sunday
  exercises: WorkoutExercisePlan[];
  createdAt: number;
  updatedAt: number;
}

interface WorkoutExercisePlan {
  exerciseId: string;       // references hardcoded ExerciseDefinition.id
  sortOrder: number;
  plannedSets: number;
  plannedReps: number;
}
```

### Cloud workout sessions and history

Store sessions separately from reusable workout definitions so later edits never
rewrite logged workout history. Keep at most one active session per user; the
active-session lookup can be a dedicated document or a query on `status`.

```ts
interface WorkoutSession {
  id: string;
  userId: string;
  workoutId: string;
  workoutNameSnapshot: string;
  startedAt: number;
  completedAt: number | null;
  status: "active" | "completed" | "abandoned";
  exercises: WorkoutExerciseLog[];
  createdAt: number;
  updatedAt: number;
}

interface WorkoutExerciseLog {
  exerciseId: string;
  exerciseNameSnapshot: string;
  loadType: "external_weight" | "bodyweight" | "assistance" | "added_weight";
  restSeconds: number;      // snapshot from the exercise catalogue
  sortOrder: number;
  plannedSets: number;
  plannedReps: number;
  sets: WorkoutSetLog[];
}

interface WorkoutSetLog {
  id: string;
  weightLbs: number | null;
  reps: number | null;
}
```

Completion for the weekly card is determined from completed session records whose
local completion date matches the scheduled date. A decision is still needed on
whether an unscheduled completed session should count toward the weekly goal; the
default proposed behavior is **no**, while it remains visible in workout history.

## Product rules and edge cases

- Time-zone calculations use the user's current local time zone; date-only values
  are stored as `YYYY-MM-DD` when a local calendar day must be compared.
- A workout may be scheduled on multiple days. The dashboard uses the same workout
  definition for each matching weekday.
- If several workouts are scheduled today, the top card shows the first by an
  explicit sort order and provides access to the others in the scheduled list.
  A future implementation may replace this with a multi-workout today card.
- An active session takes precedence over a new Start action: all Start buttons
  reopen it instead of creating a second active session.
- Sessions snapshot exercise names and planned sets/reps, protecting history from
  future catalogue or workout-definition edits.
- Weight and reps accept blank values while a workout is in progress. Validate
  entered values as non-negative numbers before completion.
- Missed status is derived live from schedule plus completed sessions; no nightly
  job is required.

## Delivery phases

1. Add types, hardcoded exercise catalogue, Firestore service, and security-rule
   access for user-owned workout documents.
2. Build the Workout dashboard, creation/editing flow, schedule ordering, and
   weekly completion calculation.
3. Build the accessible preview bottom sheet and active workout logging screen,
   including immediate cloud persistence and active-session restoration in the web
   app.
4. Add Capacitor lifecycle handling and persistent active-workout notification.
5. Verify desktop and mobile layouts; test week boundaries, future-day percentage
   handling, active-session recovery, set removal/reindexing, and completion.

## Deferred until the next task

- Populate the hardcoded exercise list, grouped by muscle group.
- Finalize precise muscle-group taxonomy and exercise descriptions.
- Decide whether unscheduled sessions count toward the weekly completion metric.
