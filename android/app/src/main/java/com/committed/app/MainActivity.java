package com.committed.app;

import android.os.Bundle;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private volatile boolean penButtonPressed;

    public class StylusInput {
        @JavascriptInterface
        public boolean isButtonPressed() {
            return penButtonPressed;
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RestTimerPlugin.class);
        registerPlugin(ReminderNotificationsPlugin.class);
        registerPlugin(HandwritingRecognitionPlugin.class);
        registerPlugin(NoteFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        // Install before Capacitor starts loading the first document. Interfaces
        // added after loadUrl are otherwise unavailable until the next reload.
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        webView.addJavascriptInterface(new StylusInput(), "CommittedStylus");
        super.load();
    }

    private void setPenButtonPressed(boolean pressed) {
        if (penButtonPressed == pressed) return;
        penButtonPressed = pressed;
        if (getBridge() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('committed-pen-button'))", null);
        }
    }

    private void trackStylusButton(MotionEvent event) {
        for (int i = 0; i < event.getPointerCount(); i++) {
            int tool = event.getToolType(i);
            if (tool != MotionEvent.TOOL_TYPE_STYLUS && tool != MotionEvent.TOOL_TYPE_ERASER) continue;
            int action = event.getActionMasked();
            boolean pressed = action != MotionEvent.ACTION_CANCEL && action != MotionEvent.ACTION_HOVER_EXIT
                && (event.getButtonState() & (MotionEvent.BUTTON_STYLUS_PRIMARY
                    | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY)) != 0;
            setPenButtonPressed(pressed);
            return;
        }
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        // Read the real buttons first. Chromium otherwise consumes barrel-held
        // contact for text selection before any DOM pointer events are emitted.
        trackStylusButton(event);
        MotionEvent forwarded = StylusMotionEvents.forWebView(event);
        try {
            return super.dispatchTouchEvent(forwarded);
        } finally {
            if (forwarded != event) forwarded.recycle();
        }
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        trackStylusButton(event);
        return super.dispatchGenericMotionEvent(event);
    }

    @Override
    public void onPause() {
        setPenButtonPressed(false);
        super.onPause();
    }
}
