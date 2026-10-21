package com.committed.app;

import android.view.MotionEvent;
import org.junit.Test;
import static org.junit.Assert.*;

public class StylusMotionEventsTest {
    @Test public void stylusBarrelButtonsDoNotReachChromiumTextSelection() {
        for (int tool : new int[] { MotionEvent.TOOL_TYPE_STYLUS, MotionEvent.TOOL_TYPE_ERASER }) {
            for (int button : new int[] { MotionEvent.BUTTON_STYLUS_PRIMARY,
                MotionEvent.BUTTON_STYLUS_SECONDARY, MotionEvent.BUTTON_SECONDARY }) {
                assertEquals(0, StylusMotionEvents.webViewButtons(tool, button));
                assertEquals(MotionEvent.BUTTON_PRIMARY,
                    StylusMotionEvents.webViewButtons(tool, button | MotionEvent.BUTTON_PRIMARY));
            }
        }
    }

    @Test public void mouseAndFingerButtonsArePreserved() {
        for (int tool : new int[] { MotionEvent.TOOL_TYPE_MOUSE, MotionEvent.TOOL_TYPE_FINGER }) {
            for (int buttons : new int[] { 0, 1, 2, 3, 32, 64 }) {
                assertEquals(buttons, StylusMotionEvents.webViewButtons(tool, buttons));
            }
        }
    }
}
