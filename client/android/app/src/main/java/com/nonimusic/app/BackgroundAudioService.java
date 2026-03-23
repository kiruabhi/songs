package com.nonimusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
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
    private MediaPlayer mediaPlayer;

    private String currentTitle = "Noni Music";
    private String currentArtist = "Live Background";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NoniMusic::NativeAudioLock");
            wakeLock.acquire();
        }

        mediaSession = new MediaSessionCompat(this, "NoniSession");
        mediaSession.setActive(true);

        updateNotificationAndState(PlaybackStateCompat.STATE_NONE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_STICKY;

        String action = intent.getAction();
        if ("ACTION_PLAY_STREAM".equals(action)) {
            String url = intent.getStringExtra("url");
            currentTitle = intent.getStringExtra("title");
            currentArtist = intent.getStringExtra("artist");
            playStream(url);
        } else if ("ACTION_PAUSE".equals(action)) {
            if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
                updateNotificationAndState(PlaybackStateCompat.STATE_PAUSED);
            }
        } else if ("ACTION_RESUME".equals(action)) {
            if (mediaPlayer != null && !mediaPlayer.isPlaying()) {
                mediaPlayer.start();
                updateNotificationAndState(PlaybackStateCompat.STATE_PLAYING);
            }
        } else if ("ACTION_SEEK".equals(action)) {
            int time = intent.getIntExtra("time", 0);
            if (mediaPlayer != null) {
                mediaPlayer.seekTo(time * 1000);
            }
        }

        return START_STICKY; // Extremely important for Android to auto-restart it if killed!
    }

    private void playStream(String url) {
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA).build());
            mediaPlayer.setDataSource(url);
            mediaPlayer.prepareAsync();
            updateNotificationAndState(PlaybackStateCompat.STATE_BUFFERING);

            mediaPlayer.setOnPreparedListener(mp -> {
                mp.start();
                updateNotificationAndState(PlaybackStateCompat.STATE_PLAYING);
            });
            
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                updateNotificationAndState(PlaybackStateCompat.STATE_ERROR);
                return true;
            });
            
            mediaPlayer.setOnCompletionListener(mp -> {
                updateNotificationAndState(PlaybackStateCompat.STATE_STOPPED);
            });

        } catch (Exception e) {}
    }

    private void updateNotificationAndState(int state) {
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
        mediaSession.setPlaybackState(stateBuilder.build());

        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, -1);
        mediaSession.setMetadata(metaBuilder.build());

        boolean isPlaying = state == PlaybackStateCompat.STATE_PLAYING || state == PlaybackStateCompat.STATE_BUFFERING;

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Prev", null))
                .addAction(new NotificationCompat.Action(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, isPlaying ? "Pause" : "Play", null))
                .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Next", null))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setShowActionsInCompactView(0, 1, 2)
                        .setMediaSession(mediaSession.getSessionToken()))
                .setOngoing(isPlaying)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Noni System Audio", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (mediaPlayer != null) mediaPlayer.release();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (mediaSession != null) mediaSession.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
