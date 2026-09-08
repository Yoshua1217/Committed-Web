package com.committed.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            if (ReminderScheduler.ACTION.equals(intent.getAction())) ReminderScheduler.deliver(context);
            else ReminderScheduler.restore(context, Intent.ACTION_TIME_CHANGED.equals(intent.getAction()) || Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction()));
        } catch (Exception error) { Log.e("CommittedReminders", "Could not restore or deliver reminders", error); }
    }
}
