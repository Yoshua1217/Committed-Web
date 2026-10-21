package com.committed.app;

import android.view.MotionEvent;

/** Keep Chromium's built-in barrel-button text selector out of the ink stream. */
final class StylusMotionEvents {
    private StylusMotionEvents() {}

    static int webViewButtons(int tool, int buttons) {
        if (tool != MotionEvent.TOOL_TYPE_STYLUS && tool != MotionEvent.TOOL_TYPE_ERASER) return buttons;
        return buttons & ~(MotionEvent.BUTTON_STYLUS_PRIMARY
            | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY);
    }

    /** Returns the original event unless a copy with barrel buttons removed is needed. */
    static MotionEvent forWebView(MotionEvent event) {
        int buttons = event.getButtonState();
        for (int i = 0; i < event.getPointerCount(); i++) {
            buttons = webViewButtons(event.getToolType(i), buttons);
        }
        if (buttons == event.getButtonState()) return event;

        int count = event.getPointerCount();
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
        for (int i = 0; i < count; i++) {
            properties[i] = new MotionEvent.PointerProperties();
            coords[i] = new MotionEvent.PointerCoords();
            event.getPointerProperties(i, properties[i]);
        }
        // Retain every historical sample, including pressure and tilt, so a
        // button-held stroke has the same fidelity as an ordinary pen stroke.
        MotionEvent copy = null;
        int history = event.getHistorySize();
        for (int sample = 0; sample <= history; sample++) {
            boolean current = sample == history;
            for (int i = 0; i < count; i++) {
                if (current) event.getPointerCoords(i, coords[i]);
                else event.getHistoricalPointerCoords(i, sample, coords[i]);
            }
            long time = current ? event.getEventTime() : event.getHistoricalEventTime(sample);
            if (copy == null) {
                copy = MotionEvent.obtain(event.getDownTime(), time, event.getAction(), count,
                    properties, coords, event.getMetaState(), buttons, event.getXPrecision(),
                    event.getYPrecision(), event.getDeviceId(), event.getEdgeFlags(),
                    event.getSource(), event.getFlags());
            } else {
                copy.addBatch(time, coords, event.getMetaState());
            }
        }
        return copy;
    }
}
