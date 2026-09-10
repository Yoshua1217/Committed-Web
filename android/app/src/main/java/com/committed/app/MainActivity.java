package com.committed.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RestTimerPlugin.class);
        registerPlugin(ReminderNotificationsPlugin.class);
        registerPlugin(HandwritingRecognitionPlugin.class);
        registerPlugin(NoteFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
