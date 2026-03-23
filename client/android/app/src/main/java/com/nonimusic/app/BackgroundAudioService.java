package com.nonimusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;

public class BackgroundAudioService extends Service {
    private static final String CHANNEL_ID = "NoniMusicChannel";
    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NoniMusic::BackgroundAudioWakeLock");
            wakeLock.acquire();
        }

        // Initialize Native Media Session
        mediaSession = new MediaSessionCompat(this, "NoniMusicSession");

        // Set Playback State to PLAYING! This prevents Android OS from suspending the app!
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
                .setState(PlaybackStateCompat.STATE_PLAYING, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
        mediaSession.setPlaybackState(stateBuilder.build());

        // Set Metadata giving it a real Music Player look
        MediaMetadataCompat.Builder metadataBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Noni Music Jam")
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Live Background Audio")
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, -1);
        mediaSession.setMetadata(metadataBuilder.build());

        mediaSession.setActive(true);

        // Build the robust Spotify-style Notification
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Noni Music")
                .setContentText("Playing safely in background")
                .setSmallIcon(android.R.drawable.ic_media_play)
                // Add dummy actions to force it into a rich media style layout
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Prev", null))
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", null))
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Next", null))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setShowActionsInCompactView(0, 1, 2)
                        .setMediaSession(mediaSession.getSessionToken()))
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Noni Music Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (mediaSession != null) {
            mediaSession.release();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
