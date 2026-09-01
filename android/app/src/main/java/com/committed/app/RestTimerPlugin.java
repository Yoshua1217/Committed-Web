package com.committed.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RestTimer")
public class RestTimerPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Long endAt = call.getLong("endAt");
        if (endAt == null) {
            call.reject("A rest end time is required.");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, RestTimerService.class)
            .putExtra(RestTimerService.EXTRA_END_AT, endAt)
            .putExtra(RestTimerService.EXTRA_EXERCISE_NAME, call.getString("exerciseName", "Workout"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RestTimerService.stop(getContext(), call.getBoolean("clearCompletion", true));
        call.resolve();
    }
}
