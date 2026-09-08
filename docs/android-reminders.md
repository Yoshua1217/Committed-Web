# Android habit and task reminders

Habit and task time fields previously only persisted to Firestore. The root `Reminders` component now subscribes for the signed-in account and sends rules to `ReminderNotificationsPlugin`. Web builds do not schedule notifications.

The native scheduler persists rules in `committed_reminders` SharedPreferences and registers one AlarmManager wake-up for the earliest occurrence. Its receiver posts all due reminders and schedules the next occurrence without starting the WebView. Habit rules have no rolling expiry. Weekdays, inclusive pause periods, creation dates, and completed dates are evaluated in the device's local calendar, including daylight-saving changes. Tasks fire once; past times newly synced to the device are skipped. Habit completion cancels today's reminder while retaining later occurrences. Completed, archived, deleted, or reminder-free tasks and deleted habits are removed. Removing records also clears their delivered notifications. Rest timer notifications use separate identities and channels.

Reboot, app update, time/time-zone changes, and granting exact-alarm permission restore scheduling. Exact alarms use `setExactAndAllowWhileIdle`; without access, `setAndAllowWhileIdle` keeps reminders scheduled with Android-controlled timing. The app requests notification permission when reminders exist and shows a settings action if notification delivery or exact timing is blocked. Tapping a reminder opens Habits or Tasks for the matching signed-in account. Sign-out or account changes clear the previous owner's alarms and notifications.

Local scheduling reflects the last data synced to this device. Changes made elsewhere require the Android app to reconnect. Android force-stop suppresses alarms until the app is opened again; device battery policies can delay delivery. Reminders over 24 hours late are skipped after downtime. See [Android alarm behavior and permissions](https://developer.android.com/develop/background-work/services/alarms).

## Validation

- `npm test`: reminder rule projection, cancellations, identities, edits, and completion suppression, alongside the existing suite.
- `android/gradlew.bat :app:testDebugUnitTest`: native weekday recurrence, pauses, completed/delivered dates, invalid dates, future creation, and daylight-saving transitions.
- `npm run android:sync`, followed by `android/gradlew.bat :app:assembleDebug`: web export, Capacitor sync, and APK build.

On an Android device, verify:

1. Create a task and habit a few minutes ahead. Grant notifications and Alarms & reminders via the in-app prompt/settings action. Lock the phone and confirm delivery and tap navigation.
2. Edit times, clear reminders, complete items, pause habits, delete items, and sign out before delivery. Confirm old alarms no longer appear; uncomplete before the reminder time and confirm it returns.
3. Set multiple reminders to the same minute and confirm each is posted. Verify rest timer notifications still work independently.
4. Reboot before delivery. Change time zone and check local reminder times. Leave the app closed across habit recurrence days.
5. Deny notification permission or disable the reminder channel; verify the settings message. Deny exact-alarm access and verify scheduling remains active, with potentially delayed delivery. Restore permissions and return to the app.
