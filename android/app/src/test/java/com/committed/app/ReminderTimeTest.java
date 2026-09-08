package com.committed.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;

public class ReminderTimeTest {
    private final TimeZone zone = TimeZone.getTimeZone("America/Edmonton");
    private final Set<Integer> daily = new HashSet<>(Arrays.asList(1, 2, 3, 4, 5, 6, 7));
    private long at(String time) { return ReminderTime.task(time, zone); }

    @Test public void weekdaysAndPassedTimes() {
        Set<Integer> monday = Collections.singleton(2);
        assertEquals(at("2026-09-07T09:00"), ReminderTime.habit("09:00", monday, Collections.emptyList(), Collections.emptySet(), "", "", at("2026-09-06T10:00"), zone));
        assertEquals(at("2026-09-14T09:00"), ReminderTime.habit("09:00", monday, Collections.emptyList(), Collections.emptySet(), "", "", at("2026-09-07T09:00"), zone));
    }
    @Test public void completedAndAlreadyDeliveredDaysAreSkipped() {
        assertEquals(at("2026-09-08T09:00"), ReminderTime.habit("09:00", daily, Collections.emptyList(), Collections.singleton("2026-09-07"), "", "", at("2026-09-07T08:00"), zone));
        assertEquals(at("2026-09-08T09:00"), ReminderTime.habit("09:00", daily, Collections.emptyList(), Collections.emptySet(), "", "2026-09-07", at("2026-09-07T08:00"), zone));
    }
    @Test public void pausesIncludeEndDateAndCanBeIndefinite() {
        assertEquals(at("2026-10-02T09:00"), ReminderTime.habit("09:00", daily, Collections.singletonList(new String[]{"2026-09-07", "2026-10-01"}), Collections.emptySet(), "", "", at("2026-09-07T08:00"), zone));
        assertEquals(-1, ReminderTime.habit("09:00", daily, Collections.singletonList(new String[]{"2026-09-07", null}), Collections.emptySet(), "", "", at("2026-09-07T08:00"), zone));
        assertEquals(at("2026-09-07T09:00"), ReminderTime.habit("09:00", daily, Collections.singletonList(new String[]{"2026-09-08", null}), Collections.emptySet(), "", "", at("2026-09-07T08:00"), zone));
    }
    @Test public void calendarRecurrencePreservesWallTimeAcrossDst() {
        long spring = ReminderTime.habit("09:00", daily, Collections.emptyList(), Collections.emptySet(), "", "", at("2026-03-07T09:00"), zone);
        assertEquals(at("2026-03-08T09:00"), spring);
        assertEquals(23 * 60 * 60 * 1000L, spring - at("2026-03-07T09:00"));
        long fall = ReminderTime.habit("09:00", daily, Collections.emptyList(), Collections.emptySet(), "", "", at("2026-10-31T09:00"), zone);
        assertEquals(at("2026-11-01T09:00"), fall);
        assertEquals(25 * 60 * 60 * 1000L, fall - at("2026-10-31T09:00"));
    }
    @Test public void futureCreationAndInvalidRules() {
        assertEquals(at("2027-01-01T09:00"), ReminderTime.habit("09:00", daily, Collections.emptyList(), Collections.emptySet(), "2027-01-01", "", at("2026-09-07T08:00"), zone));
        assertEquals(-1, ReminderTime.habit("25:00", daily, Collections.emptyList(), Collections.emptySet(), "", "", at("2026-09-07T08:00"), zone));
        assertEquals(-1, ReminderTime.habit("09:00", Collections.emptySet(), Collections.emptyList(), Collections.emptySet(), "", "", at("2026-09-07T08:00"), zone));
        assertEquals(-1, at("2026-02-30T09:00"));
        assertEquals(-1, at("2026-09-07T24:00"));
    }
}
