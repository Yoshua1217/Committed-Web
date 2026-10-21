package com.committed.app;

import android.view.InputDevice;
import android.view.MotionEvent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class StylusMotionEventsInstrumentedTest {
    private MotionEvent event(int tool, int action, int buttons) {
        MotionEvent.PointerProperties pointer = new MotionEvent.PointerProperties();
        pointer.id = 7;
        pointer.toolType = tool;
        MotionEvent.PointerCoords point = new MotionEvent.PointerCoords();
        point.x = 80;
        point.y = 120;
        point.pressure = .4f;
        point.setAxisValue(MotionEvent.AXIS_TILT, .3f);
        return MotionEvent.obtain(100, 110, action, 1,
            new MotionEvent.PointerProperties[] { pointer }, new MotionEvent.PointerCoords[] { point },
            0, buttons, 1, 1, 3, 0, InputDevice.SOURCE_STYLUS, 0);
    }

    @Test public void barrelHeldContactKeepsTipGeometryAndHistoryWithoutSelectionButtons() {
        MotionEvent original = event(MotionEvent.TOOL_TYPE_STYLUS, MotionEvent.ACTION_MOVE,
            MotionEvent.BUTTON_STYLUS_PRIMARY);
        MotionEvent.PointerCoords next = new MotionEvent.PointerCoords();
        original.getPointerCoords(0, next);
        next.x = 90;
        next.pressure = .6f;
        original.addBatch(120, new MotionEvent.PointerCoords[] { next }, 0);
        next.x = 100;
        next.pressure = .8f;
        original.addBatch(130, new MotionEvent.PointerCoords[] { next }, 0);
        MotionEvent copy = StylusMotionEvents.forWebView(original);
        try {
            assertNotSame(original, copy);
            assertEquals(0, copy.getButtonState());
            assertEquals(MotionEvent.BUTTON_STYLUS_PRIMARY, original.getButtonState());
            assertEquals(original.getAction(), copy.getAction());
            assertEquals(original.getDownTime(), copy.getDownTime());
            assertEquals(original.getEventTime(), copy.getEventTime());
            assertEquals(original.getSource(), copy.getSource());
            assertEquals(original.getDeviceId(), copy.getDeviceId());
            assertEquals(7, copy.getPointerId(0));
            assertEquals(MotionEvent.TOOL_TYPE_STYLUS, copy.getToolType(0));
            assertEquals(2, copy.getHistorySize());
            for (int sample = 0; sample < 2; sample++) {
                assertEquals(original.getHistoricalEventTime(sample), copy.getHistoricalEventTime(sample));
                assertEquals(original.getHistoricalX(sample), copy.getHistoricalX(sample), 0);
                assertEquals(original.getHistoricalPressure(sample), copy.getHistoricalPressure(sample), 0);
            }
            assertEquals(100, copy.getX(), 0);
            assertEquals(.8f, copy.getPressure(), 0);
            assertEquals(.3f, copy.getAxisValue(MotionEvent.AXIS_TILT), 0);
        } finally {
            copy.recycle();
            original.recycle();
        }
    }

    @Test public void contactAndLiftRemainADownMoveUpSequenceWhileHeld() {
        for (int action : new int[] { MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP }) {
            MotionEvent original = event(MotionEvent.TOOL_TYPE_STYLUS, action, MotionEvent.BUTTON_STYLUS_PRIMARY);
            MotionEvent copy = StylusMotionEvents.forWebView(original);
            try {
                assertEquals(action, copy.getActionMasked());
                assertEquals(0, copy.getButtonState());
            } finally {
                copy.recycle();
                original.recycle();
            }
        }
    }

    @Test public void mouseRightClickAndOrdinaryPenReturnTheOriginalEvent() {
        for (int tool : new int[] { MotionEvent.TOOL_TYPE_MOUSE, MotionEvent.TOOL_TYPE_STYLUS }) {
            int buttons = tool == MotionEvent.TOOL_TYPE_MOUSE ? MotionEvent.BUTTON_SECONDARY : 0;
            MotionEvent original = event(tool, MotionEvent.ACTION_DOWN, buttons);
            try {
                assertSame(original, StylusMotionEvents.forWebView(original));
            } finally {
                original.recycle();
            }
        }
    }
}
