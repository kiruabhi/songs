package com.nonimusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
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
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean isPrepared = false;
    private boolean playWhenReady = false;
    private int pendingSeekSeconds = 0;
    private String currentUrl;

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

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
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
            playWhenReady = false;
            pausePlayback();
        } else if ("ACTION_RESUME".equals(action)) {
            playWhenReady = true;
            resumePlayback();
        } else if ("ACTION_SEEK".equals(action)) {
            int time = intent.getIntExtra("time", 0);
            seekTo(time);
        }

        return START_STICKY; // Extremely important for Android to auto-restart it if killed!
    }

    private void playStream(String url) {
        if (url == null || url.isEmpty()) {
            updateNotificationAndState(PlaybackStateCompat.STATE_ERROR);
            return;
        }

        if (url.equals(currentUrl) && mediaPlayer != null) {
            playWhenReady = true;
            resumePlayback();
            return;
        }

        try {
            releasePlayer();
            currentUrl = url;
            isPrepared = false;
            playWhenReady = true;
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA).build());
            mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.setDataSource(url);
            mediaPlayer.setOnPreparedListener(mp -> {
                isPrepared = true;
                if (pendingSeekSeconds > 0) {
                    mp.seekTo(pendingSeekSeconds * 1000);
                    pendingSeekSeconds = 0;
                }
                if (playWhenReady) {
                    resumePlayback();
                } else {
                    updateNotificationAndState(PlaybackStateCompat.STATE_PAUSED);
                }
            });
            mediaPlayer.setOnInfoListener((mp, what, extra) -> {
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                    updateNotificationAndState(PlaybackStateCompat.STATE_BUFFERING);
                } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END && mp.isPlaying()) {
                    updateNotificationAndState(PlaybackStateCompat.STATE_PLAYING);
                }
                return false;
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                releasePlayer();
                updateNotificationAndState(PlaybackStateCompat.STATE_ERROR);
                return true;
            });
            mediaPlayer.setOnCompletionListener(mp -> {
                playWhenReady = false;
                updateNotificationAndState(PlaybackStateCompat.STATE_STOPPED);
            });
            mediaPlayer.prepareAsync();
            updateNotificationAndState(PlaybackStateCompat.STATE_BUFFERING);

        } catch (Exception e) {
            releasePlayer();
            updateNotificationAndState(PlaybackStateCompat.STATE_ERROR);
        }
    }

    private void pausePlayback() {
        try {
            if (mediaPlayer != null && isPrepared && mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
            }
        } catch (IllegalStateException ignored) {
        }
        updateNotificationAndState(PlaybackStateCompat.STATE_PAUSED);
    }

    private void resumePlayback() {
        if (!requestAudioFocus()) {
            updateNotificationAndState(PlaybackStateCompat.STATE_PAUSED);
            return;
        }
        if (mediaPlayer == null) {
            updateNotificationAndState(PlaybackStateCompat.STATE_NONE);
            return;
        }
        if (!isPrepared) {
            updateNotificationAndState(PlaybackStateCompat.STATE_BUFFERING);
            return;
        }
        try {
            if (!mediaPlayer.isPlaying()) {
                mediaPlayer.start();
            }
            updateNotificationAndState(PlaybackStateCompat.STATE_PLAYING);
        } catch (IllegalStateException e) {
            updateNotificationAndState(PlaybackStateCompat.STATE_ERROR);
        }
    }

    private void seekTo(int seconds) {
        pendingSeekSeconds = Math.max(0, seconds);
        try {
            if (mediaPlayer != null && isPrepared) {
                mediaPlayer.seekTo(pendingSeekSeconds * 1000);
                pendingSeekSeconds = 0;
            }
        } catch (IllegalStateException ignored) {
        }
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) {
            return true;
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build();

        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(audioAttributes)
                        .setAcceptsDelayedFocusGain(true)
                        .setOnAudioFocusChangeListener(this::handleAudioFocusChange)
                        .build();
            }
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            result = audioManager.requestAudioFocus(this::handleAudioFocusChange, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }

        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void handleAudioFocusChange(int focusChange) {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
            playWhenReady = false;
            pausePlayback();
        } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            pausePlayback();
        } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN && playWhenReady) {
            resumePlayback();
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            }
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }

    private void releasePlayer() {
        isPrepared = false;
        pendingSeekSeconds = 0;
        if (mediaPlayer != null) {
            try {
                mediaPlayer.reset();
            } catch (Exception ignored) {
            }
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {
            }
            mediaPlayer = null;
        }
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
        releasePlayer();
        abandonAudioFocus();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (mediaSession != null) mediaSession.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
