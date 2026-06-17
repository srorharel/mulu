package com.sparklego.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Tracks whether the app is in the foreground. IncomingCallService reads this
    // so a backgrounded/killed app shows the full-screen ringing notification,
    // while a foreground app lets the in-app WebRTC ring (over Realtime) handle
    // the call — avoiding a double ring.
    public static boolean isForeground = false;

    @Override
    public void onResume() {
        super.onResume();
        isForeground = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        isForeground = false;
    }
}
