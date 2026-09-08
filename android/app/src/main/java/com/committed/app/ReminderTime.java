package com.committed.app;

import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** Calendar math shared by scheduling and JVM tests; never add 24h across DST. */
final class ReminderTime {
    static String date(long millis, TimeZone zone) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(zone);
        return format.format(new Date(millis));
    }

    static long task(String value, TimeZone zone) {
        if (!value.matches("\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d")) return -1;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
        format.setTimeZone(zone);
        format.setLenient(false);
        ParsePosition position = new ParsePosition(0);
        Date parsed = format.parse(value, position);
        return parsed == null || position.getIndex() != value.length() ? -1 : parsed.getTime();
    }

    static long habit(String time, Set<Integer> days, List<String[]> pauses, Set<String> completed,
                      String createdOn, String lastDate, long now, TimeZone zone) {
        if (!time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d") || days.stream().noneMatch(day -> day >= 1 && day <= 7)) return -1;
        Calendar day = Calendar.getInstance(zone);
        day.setTimeInMillis(now);
        if (!createdOn.isEmpty() && date(now, zone).compareTo(createdOn) < 0) {
            long start = task(createdOn + "T00:00", zone);
            if (start < 0) return -1;
            day.setTimeInMillis(start);
        }
        while (true) {
            String localDate = date(day.getTimeInMillis(), zone);
            boolean skipped = false;
            for (String[] pause : pauses) {
                if (localDate.compareTo(pause[0]) >= 0 && (pause[1] == null || localDate.compareTo(pause[1]) <= 0)) {
                    if (pause[1] == null) return -1;
                    long end = task(pause[1] + "T12:00", zone);
                    if (end < 0) return -1;
                    day.setTimeInMillis(end);
                    day.add(Calendar.DATE, 1);
                    skipped = true;
                    break;
                }
            }
            if (skipped) continue;
            Calendar candidate = (Calendar) day.clone();
            candidate.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time.substring(0, 2)));
            candidate.set(Calendar.MINUTE, Integer.parseInt(time.substring(3)));
            candidate.set(Calendar.SECOND, 0);
            candidate.set(Calendar.MILLISECOND, 0);
            if (days.contains(day.get(Calendar.DAY_OF_WEEK)) && !completed.contains(localDate)
                && localDate.compareTo(lastDate) > 0 && candidate.getTimeInMillis() > now) return candidate.getTimeInMillis();
            day.add(Calendar.DATE, 1);
        }
    }
}
