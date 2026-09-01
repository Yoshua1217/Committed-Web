package com.committed.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/** A short-lived foreground service for one rest interval (90 or 120 seconds). */
public class RestTimerService extends Service {
    public static final String EXTRA_END_AT = "endAt";
    public static final String EXTRA_EXERCISE_NAME = "exerciseName";

    private static final int REST_NOTIFICATION_ID = 731_001;
    private static final int COMPLETE_NOTIFICATION_ID = 731_002;
    // A new channel is intentional: Android keeps a channel's importance after
    // installation, so the previous low-priority channel cannot be promoted.
    private static final String REST_CHANNEL_ID = "active_rest_timer_v2";
    private static final String COMPLETE_CHANNEL_ID = "rest_timer_complete";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long endAt;
    private String exerciseName = "Workout";
    private boolean tenSecondCueSent;
    private boolean completionSent;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            long remaining = endAt - System.currentTimeMillis();
            if (remaining <= 0) {
                finishRest();
                return;
            }
            if (remaining <= 10_000 && !tenSecondCueSent) {
                tenSecondCueSent = true;
                vibrateOnce();
            }
            updateRestNotification(remaining);
            // Match the web timer's ceil-to-the-next-second formatting exactly.
            long delayUntilNextSecond = (remaining % 1_000L) + 24L;
            handler.postDelayed(this, Math.max(50L, delayUntilNextSecond));
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !intent.hasExtra(EXTRA_END_AT)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        endAt = intent.getLongExtra(EXTRA_END_AT, System.currentTimeMillis());
        exerciseName = intent.getStringExtra(EXTRA_EXERCISE_NAME);
        if (exerciseName == null || exerciseName.trim().isEmpty()) exerciseName = "Workout";
        tenSecondCueSent = false;
        completionSent = false;
        handler.removeCallbacks(ticker);
        notificationManager().cancel(COMPLETE_NOTIFICATION_ID);

        // Even if permission was granted after the interval elapsed, promote
        // the service before the next ticker finishes it; Android requires a
        // foreground service to post its notification promptly.
        long remaining = Math.max(0L, endAt - System.currentTimeMillis());

        Notification notification = buildRestNotification(remaining);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(REST_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
        } else {
            startForeground(REST_NOTIFICATION_ID, notification);
        }
        // startForeground makes the first countdown visible immediately; the
        // ticker then updates the same notification ID rather than creating a
        // stream of new notifications.
        handler.post(ticker);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(ticker);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static void stop(Context context, boolean clearCompletion) {
        context.stopService(new Intent(context, RestTimerService.class));
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(REST_NOTIFICATION_ID);
        if (clearCompletion) manager.cancel(COMPLETE_NOTIFICATION_ID);
    }

    private void finishRest() {
        if (completionSent) return;
        completionSent = true;
        notificationManager().notify(COMPLETE_NOTIFICATION_ID, buildCompletionNotification());
        vibrateTwice();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private void updateRestNotification(long remaining) {
        notificationManager().notify(REST_NOTIFICATION_ID, buildRestNotification(remaining));
    }

    private Notification buildRestNotification(long remaining) {
        Intent launchIntent = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(this, REST_NOTIFICATION_ID, launchIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new NotificationCompat.Builder(this, REST_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_committed)
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(getResources(), R.drawable.ic_notification_committed))
            .setColor(0xFF41E987)
            .setContentTitle("Rest timer")
            .setContentText(exerciseName + " · " + formatCountdown(remaining) + " remaining")
            .setSubText("Rest timer")
            .setContentIntent(openApp)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .build();
    }

    private Notification buildCompletionNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(this, COMPLETE_NOTIFICATION_ID, launchIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_committed)
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(getResources(), R.drawable.ic_notification_committed))
            .setColor(0xFF41E987)
            .setContentTitle("Rest complete")
            .setContentText(exerciseName + " · Ready for your next set.")
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = notificationManager();

        NotificationChannel restChannel = new NotificationChannel(REST_CHANNEL_ID, "Rest timer", NotificationManager.IMPORTANCE_DEFAULT);
        restChannel.setDescription("Shows the current workout rest countdown.");
        restChannel.enableVibration(false);
        restChannel.setSound(null, null);
        restChannel.setShowBadge(false);
        manager.createNotificationChannel(restChannel);

        NotificationChannel completeChannel = new NotificationChannel(COMPLETE_CHANNEL_ID, "Rest complete", NotificationManager.IMPORTANCE_HIGH);
        completeChannel.setDescription("Alerts when it is time for the next set.");
        completeChannel.enableVibration(false);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build();
        completeChannel.setSound(sound, attributes);
        manager.createNotificationChannel(completeChannel);
    }

    private NotificationManager notificationManager() {
        return (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private String formatCountdown(long remaining) {
        long totalSeconds = Math.max(0L, (remaining + 999L) / 1_000L);
        long minutes = totalSeconds / 60L;
        long seconds = totalSeconds % 60L;
        return String.format(java.util.Locale.US, "%dm %02ds", minutes, seconds);
    }

    private void vibrateOnce() {
        Vibrator vibrator = vibrator();
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(90, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(90);
        }
    }

    private void vibrateTwice() {
        Vibrator vibrator = vibrator();
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 100, 180, 120};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vibrator.vibrate(pattern, -1);
        }
    }

    @Nullable
    private Vibrator vibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }
}
