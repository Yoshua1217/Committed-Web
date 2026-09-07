# Stable habit history and editable completions

Habit history now resolves the definition that applied on each local calendar day. Before a habit changes on a new day, its previous definition is saved in `history`, keyed by the exclusive end date. Multiple edits on the same day retain that saved definition. This works even when the app was closed at midnight; no background midnight job is required.

- New habits start on their saved `createdOn` date. Legacy habits use their existing `createdAt` timestamp until the next edit captures a stable local date.
- Editing names, schedules, completion types, targets, or pause periods affects today and subsequent days.
- Deletion retains the record with `deletedOn`. Active lists hide it; history and the graph still include its earlier definitions, including missed days.
- Resume preserves earlier paused days. A completed habit remains counted on its completion day even if paused that day.
- Dashboard, graph, and history use the same partial-progress calculation. Explicitly completed counters/timers contribute 100%.
- Past days have an Edit control for explicit completion corrections. The editor resolves the original habit definitions, including habits now paused or deleted. It saves only changed completions and recalculates the selected day; habit definitions and other days remain unchanged.
- New habits cannot be inserted into earlier days. Unchecking a previously counted off-schedule habit retains its place in the denominator. Unchecking a counter or timer clears its progress so its percentage decreases.
- Automatic completion paths, delayed check-ins and workout mappings still reject past writes. Manual corrections use a separate validated service and rules path.
- Automatic completion records keep an immutable next-midnight deadline. Explicit manual corrections can update past results after that deadline. The graph subscribes to history changes so corrections appear across open views.
- Explicit account reset remains able to erase history; ordinary habit deletion cannot.

## Existing affected days

The new-habit denominator bug is corrected on read for every available date. No bulk completion rewrite or invented completion is needed. For example, a habit created September 6 is excluded from September 5 and every earlier day, and percentages are recalculated accordingly.

Previously overwritten names, targets, or schedules cannot be reconstructed exactly without a backup. Previously hard-deleted habit definitions also cannot be recovered from completion records alone: the missing records do not reveal names, schedules, or missed-day denominators. Unknown legacy creation dates remain unknown rather than receiving a guessed start date. The next edit preserves the best available definition before any further changes.

## Release

Ship the updated web build and Android wrapper together with `firestore.rules`. Deploy the rules with `firebase deploy --only firestore:rules --project committed-2f3a9`. Publish/rebuild the clients through the project's existing release process. These changes have been tested locally; this task has not deployed rules, published the website, rebuilt an APK, or modified production account data.

The rules intentionally reject older clients' habit writes that omit history metadata or attempt hard deletion. Coordinate the client update and rules rollout; old installed Android builds must be updated. Transactions require connectivity, and the habit editor retains its form and shows an error if saving fails.

## Validation

- `npm test`: regression tests for creation-date repair, historical definitions and percentages, pause/resume, deletion, stale form history, service serialization, automatic closed-day protection, and manual past corrections, alongside the existing test suite.
- `npm run test:habit-rules`: Firestore emulator tests for ownership, immutable history, server-time day checks and explicit historical corrections, deletion protection, legacy upgrades, explicit reset, and the real habit service against the rules. Requires Firebase CLI and Java 21+; uses only the `demo-habit-history` emulator project.
- `npm run build`: production static build and TypeScript validation.

The server checks use Firebase's documented [timestamp methods](https://firebase.google.com/docs/reference/rules/rules.Timestamp_) and [map-difference methods](https://firebase.google.com/docs/reference/rules/rules.MapDiff).

Targeted lint passes for the changed habit services and views. The repository-wide lint command still reports pre-existing errors in generated Android bundles and existing source, including the habit editor's pre-existing prop-to-form state initialization effect.
