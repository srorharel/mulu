package com.sparklego.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Custom FCM handler for the in-app calling feature. Extends the Capacitor push
 * plugin's MessagingService so normal notifications + token registration keep
 * working (we delegate everything except 'incoming_call' to super).
 *
 * For an 'incoming_call' data message (sent data-only + high priority by the
 * send-notification Edge Function) it builds a full-screen, ringing,
 * CATEGORY_CALL notification so a backgrounded/killed app rings like a real
 * phone call. Tapping it deep-links into the app (mulu-call://incoming?...),
 * where the WebView's CallProvider reconstructs the call + shows the CallSheet.
 *
 * Foreground calls are left to the in-app Realtime ring (see MainActivity
 * .isForeground) to avoid a double ring.
 */
public class IncomingCallService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    private static final String CHANNEL_ID = "incoming_calls";
    private static final int CALL_NOTIF_ID = 42001;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data != null && "incoming_call".equals(data.get("event_type"))) {
            // Foreground → the in-app WebRTC ring already handles it over Realtime.
            if (!MainActivity.isForeground) showIncomingCall(data);
            return;
        }
        // Everything else: normal Capacitor push handling.
        super.onMessageReceived(remoteMessage);
    }

    private void showIncomingCall(Map<String, String> data) {
        String callId = data.get("call_id");
        String fromName = data.get("from_name");
        if (fromName == null || fromName.isEmpty()) fromName = "מתקשר";

        createChannel();

        // Deep link the WebView reads (via @capacitor/app) to rebuild the call.
        Uri uri = Uri.parse("mulu-call://incoming?call_id="
                + Uri.encode(callId == null ? "" : callId)
                + "&from=" + Uri.encode(fromName)
                + "&action=show");

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle("שיחה נכנסת")
                .setContentText(fromName)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(CALL_NOTIF_ID, b.build());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "שיחות נכנסות", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("צלצול לשיחות נכנסות באפליקציה");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 600, 200, 600, 1600});

        Uri ring = Settings.System.DEFAULT_RINGTONE_URI;
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        ch.setSound(ring, attrs);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
