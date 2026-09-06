# Projects and task time blocks

The former Idea Bank route (`/dashboard/ideas`) now opens Projects, with the original Idea Bank available in a sibling tab. A project has a name, a finished outcome, a required deadline, and an optional goal. Existing tasks belong to a project through `task.projectId`; they are not copied. Archiving a project preserves its tasks and their history.

Linked tasks inherit their project's goal, including when that goal changes or is cleared. The task editor labels this goal as inherited and manages it through the project. Task subscriptions resolve the current project goal for existing tasks, while saving a task also records the current goal in its `goalId` field. Removing the project retains the current goal as an independently editable task goal.

## Effort and scheduling

- `estimatedMinutes` is a positive whole-minute effort estimate. Existing tasks default to no estimate.
- Project progress is completed estimated minutes divided by all estimated minutes. A completed 10-minute task and an incomplete 120-minute task yield 8% progress. Tasks without estimates are counted and explicitly flagged, but contribute no fabricated time. Project completion still requires every member task to be complete.
- `startDateTime` plus the estimate defines a timed work block. `dueDateTime` / `dueDate` remain the deadline. No date migration or new estimates are applied to existing tasks.
- An estimated task without a timed start, including one with an all-day start, appears in Calendar → Unscheduled. Completed and archived tasks do not appear in this queue.
- Calendar's Tasks layer works without Google. Tasks with dates but no timed block appear in the all-day area. Timed blocks can be moved and resized; resizing also updates the estimate.
- Drag an Unscheduled card onto the day or week time grid to preview its estimated duration and drop to save, snapped to 15 minutes. The grid scrolls at its edges. Dropping outside the grid leaves the task unchanged. In month view, dropping onto a date opens the scheduling dialog. Choose time remains available for keyboard and touch use.
- Clicking a task in any calendar view opens the same task details preview as the Tasks page, with its Edit action. Google events keep their existing event details view.

## Google Calendar

Connect Google on the Calendar page and select a writable calendar under **App calendar mapping → Task schedules**. Scheduled tasks sync while Calendar is open and on **Refresh Sync**. This is a client-side integration, not a background server job; edits made elsewhere are reconciled on the next Calendar visit with a valid Google connection.

Each task retains a Google event link. New event IDs are reserved in Firestore before insertion so a lost response can be retried without duplicating events. Local task changes update the event. When the task has no pending local change, changes to the event title, description, start, and duration are pulled from Google. A deleted Google event returns an unchanged task to Unscheduled. Pending local edits take precedence over remote edits.

Removing a time block removes its Google event and retains the task and estimate. Task deletion retains a hidden tombstone only when it has a Google event to remove. Failed Google deletions remain retryable. Changing or clearing the task calendar mapping removes the old exported event. Completed tasks retain their scheduled blocks with a checkmark in the event title.

Google event copies are hidden from the other calendar layers when their task is present, so the Tasks checkbox controls one visual copy.

## Deployment and verification

Deploy the updated `firestore.rules` with the application release. The new owner-scoped `projects` collection cannot be used under the previous rules. Account data reset now includes projects. No Firestore index or backfill is required.

Automated checks:

```sh
npm test
npm run lint -- --quiet
npm run build
```

The tests use the actual planning and sync modules with isolated Google and Firestore boundaries. They do not contact a real account.

Authenticated smoke check before release:

1. Create a project with a deadline and optional goal. Add an existing task and create a second task in the project. Confirm that both also appear in Tasks.
2. Estimate tasks at 120 and 10 minutes. Complete the 10-minute task: project progress should be 8%. Undo completion and confirm that progress returns to 0%.
3. Give the 120-minute task an all-day start. Confirm it appears in Calendar → Unscheduled. Choose a timed start and confirm a two-hour block appears. Its deadline should stay unchanged.
4. Toggle the Tasks layer in day, week, and month views. Move and resize a timed task, then inspect its saved start and estimate.
5. Connect Google and map Task schedules. Confirm exactly one matching Google event. Refresh twice, then edit its time in Google and refresh again; the task block should follow the edit.
6. Remove a block and confirm that the task returns to Unscheduled and its Google event disappears. Re-schedule it and verify a single new event.
7. Check Projects, Idea Bank, task editing, and both calendar sidebar tabs at desktop and phone widths.

The production build and 22 isolated tests pass, covering drop coordinates, scheduling, sync, and project goal inheritance. An isolated browser fixture verified dragging a card onto the real time grid and preserving its estimate and deadline. Full repository lint reports existing errors in generated Android assets and unrelated components; lint on the changed calendar files passes. Authenticated visual checks and real Google writes remain unverified.
