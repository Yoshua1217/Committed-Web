package com.committed.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReminderNotifications")
public class ReminderNotificationsPlugin extends Plugin {
    @Override public void load() { opened(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) { opened(intent); }
    @Override protected void handleOnResume() {
        try { ReminderScheduler.restore(getContext(), false); }
        catch (Exception error) { Log.e("CommittedReminders", "Could not restore reminders", error); }
    }
    private void opened(Intent intent) {
        if (intent == null || !intent.hasExtra(ReminderScheduler.EXTRA_KIND)) return;
        JSObject data = new JSObject();
        data.put("kind", intent.getStringExtra(ReminderScheduler.EXTRA_KIND));
        data.put("userId", intent.getStringExtra(ReminderScheduler.EXTRA_OWNER));
        notifyListeners("opened", data, true);
        intent.removeExtra(ReminderScheduler.EXTRA_KIND);
    }
    @PluginMethod public void setOwner(PluginCall call) {
        try { ReminderScheduler.setOwner(getContext(), call.getString("userId", "")); call.resolve(); }
        catch (Exception error) { call.reject("Could not change reminder account", error); }
    }
    @PluginMethod public void sync(PluginCall call) {
        try {
            if (call.getArray("reminders") == null) { call.reject("Reminders are required"); return; }
            ReminderScheduler.sync(getContext(), call.getString("userId", ""), call.getArray("reminders"));
            call.resolve();
        } catch (Exception error) { call.reject("Could not schedule reminders", error); }
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject status = new JSObject();
        status.put("enabled", ReminderScheduler.enabled(getContext()));
        status.put("exact", ReminderScheduler.exact(getContext()));
        call.resolve(status);
    }
    @PluginMethod public void openSettings(PluginCall call) {
        try {
            Intent intent;
            if (call.getBoolean("exact", false) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) { call.reject("Could not open reminder settings", error); }
    }
}
