package com.committed.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/** Durable rules and one batched wake-up, independent of the WebView's lifetime. */
final class ReminderScheduler {
    static final String CHANNEL = "habit-task-reminders-v1";
    static final String ACTION = "com.committed.app.REMINDERS";
    static final String EXTRA_KIND = "reminderKind";
    static final String EXTRA_OWNER = "reminderOwner";
    private static final int ALARM_ID = 720001;
    private static final String PREFS = "committed_reminders";

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static AlarmManager alarms(Context context) { return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE); }
    private static NotificationManager notifications(Context context) { return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE); }
    private static PendingIntent alarmIntent(Context context) {
        return PendingIntent.getBroadcast(context, ALARM_ID, new Intent(context, ReminderReceiver.class).setAction(ACTION), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private static JSONObject read(Context context) throws JSONException {
        return new JSONObject(prefs(context).getString("records", "{}"));
    }
    private static void write(Context context, JSONObject records) {
        // Receiver must finish with durable state, including its next alarm and delivered dates.
        if (!prefs(context).edit().putString("records", records.toString()).commit()) throw new IllegalStateException("Could not save reminder schedule");
    }
    static void channel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Habit and task reminders", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Reminders at the times you choose for habits and tasks");
            channel.enableVibration(true);
            notifications(context).createNotificationChannel(channel);
        }
    }
    static boolean enabled(Context context) {
        channel(context);
        return NotificationManagerCompat.from(context).areNotificationsEnabled() && (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || notifications(context).getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE);
    }
    static boolean exact(Context context) { return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms(context).canScheduleExactAlarms(); }

    static synchronized void setOwner(Context context, String owner) throws JSONException {
        if (owner.equals(prefs(context).getString("owner", ""))) return;
        JSONObject old = read(context);
        for (java.util.Iterator<String> keys = old.keys(); keys.hasNext();) notifications(context).cancel(keys.next(), ALARM_ID);
        alarms(context).cancel(alarmIntent(context));
        if (!prefs(context).edit().putString("owner", owner).putString("records", "{}").commit()) throw new IllegalStateException("Could not clear reminders");
    }

    static synchronized void sync(Context context, String owner, JSONArray reminders) throws JSONException {
        // Reject stale bridge work from a previous authentication session.
        if (owner.isEmpty() || !owner.equals(prefs(context).getString("owner", ""))) return;
        JSONObject old = read(context);
        JSONObject next = new JSONObject();
        long now = System.currentTimeMillis();
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject rule = reminders.getJSONObject(i);
            String key = rule.getString("key");
            JSONObject previous = old.optJSONObject(key);
            JSONObject record = new JSONObject().put("rule", rule).put("lastDate", previous == null ? "" : previous.optString("lastDate"));
            // Preserve an overdue alarm across identical snapshots so Android's delayed delivery isn't lost.
            boolean unchanged = previous != null && previous.getJSONObject("rule").toString().equals(rule.toString());
            record.put("next", unchanged ? previous.optLong("next", -1) : nextTime(record, now));
            next.put(key, record);
            if (!unchanged) notifications(context).cancel(key, ALARM_ID);
        }
        for (java.util.Iterator<String> keys = old.keys(); keys.hasNext();) {
            String key = keys.next();
            if (!next.has(key)) notifications(context).cancel(key, ALARM_ID);
        }
        write(context, next);
        schedule(context, next);
    }

    private static long nextTime(JSONObject record, long now) throws JSONException {
        JSONObject rule = record.getJSONObject("rule");
        TimeZone zone = TimeZone.getDefault();
        if (rule.getString("kind").equals("task")) {
            long at = ReminderTime.task(rule.getString("time"), zone);
            return record.optString("lastDate").equals(rule.getString("time")) || at <= now ? -1 : at;
        }
        Set<Integer> days = new HashSet<>();
        JSONArray dayArray = rule.getJSONArray("days");
        for (int i = 0; i < dayArray.length(); i++) days.add(dayArray.getInt(i));
        Set<String> completed = new HashSet<>();
        JSONArray completionArray = rule.getJSONArray("completedDates");
        for (int i = 0; i < completionArray.length(); i++) completed.add(completionArray.getString(i));
        List<String[]> pauses = new ArrayList<>();
        JSONArray pauseArray = rule.getJSONArray("pauses");
        for (int i = 0; i < pauseArray.length(); i++) {
            JSONObject pause = pauseArray.getJSONObject(i);
            pauses.add(new String[] { pause.getString("startedOn"), pause.isNull("endedOn") ? null : pause.getString("endedOn") });
        }
        return ReminderTime.habit(rule.getString("time"), days, pauses, completed, rule.optString("createdOn"), record.optString("lastDate"), now, zone);
    }

    private static void schedule(Context context, JSONObject records) throws JSONException {
        long first = Long.MAX_VALUE;
        for (java.util.Iterator<String> keys = records.keys(); keys.hasNext();) {
            long at = records.getJSONObject(keys.next()).optLong("next", -1);
            if (at > 0) first = Math.min(first, at);
        }
        PendingIntent intent = alarmIntent(context);
        if (first == Long.MAX_VALUE) { alarms(context).cancel(intent); return; }
        first = Math.max(first, System.currentTimeMillis() + 100);
        if (exact(context)) {
            try { alarms(context).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, first, intent); return; }
            catch (SecurityException ignored) { /* Permission changed: still deliver with an inexact alarm. */ }
        }
        alarms(context).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, first, intent);
    }

    static synchronized void restore(Context context, boolean clockChanged) throws JSONException {
        JSONObject records = read(context);
        if (clockChanged) {
            for (java.util.Iterator<String> keys = records.keys(); keys.hasNext();) {
                JSONObject record = records.getJSONObject(keys.next());
                record.put("next", nextTime(record, System.currentTimeMillis()));
            }
            write(context, records);
        }
        schedule(context, records);
    }

    static synchronized void deliver(Context context) throws JSONException {
        JSONObject records = read(context);
        long now = System.currentTimeMillis();
        boolean enabled = enabled(context);
        for (java.util.Iterator<String> keys = records.keys(); keys.hasNext();) {
            String key = keys.next();
            JSONObject record = records.getJSONObject(key);
            long at = record.optLong("next", -1);
            if (at <= 0 || at > now) continue;
            JSONObject rule = record.getJSONObject("rule");
            String occurrence = rule.getString("kind").equals("habit") ? ReminderTime.date(at, TimeZone.getDefault()) : rule.getString("time");
            // Don't dump old reminders after a device was powered off for several days.
            if (enabled && now - at < 24 * 60 * 60 * 1000L && !occurrence.equals(record.optString("lastDate"))) post(context, key, rule);
            record.put("lastDate", occurrence);
            record.put("next", nextTime(record, now));
        }
        write(context, records);
        schedule(context, records);
    }

    private static void post(Context context, String key, JSONObject rule) throws JSONException {
        String kind = rule.getString("kind");
        Intent launch = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("committed://reminder/" + Uri.encode(key)))
            .putExtra(EXTRA_KIND, kind).putExtra(EXTRA_OWNER, prefs(context).getString("owner", ""))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_committed).setColor(Color.rgb(65, 233, 135))
            .setContentTitle(rule.getString("title")).setContentText(kind.equals("habit") ? "Time for your habit" : "Task reminder")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_REMINDER).setAutoCancel(true).setContentIntent(content);
        try { notifications(context).notify(key, ALARM_ID, notification.build()); }
        catch (SecurityException ignored) { /* Notifications were disabled while delivering. */ }
    }
}
