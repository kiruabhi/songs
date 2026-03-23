package com.nonimusic.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Intent;
import android.content.Context;
import android.os.Build;

@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {

    @PluginMethod
    public void playStream(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title");
        String artist = call.getString("artist");

        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction("ACTION_PLAY_STREAM");
        intent.putExtra("url", url);
        intent.putExtra("title", title != null ? title : "Unknown Title");
        intent.putExtra("artist", artist != null ? artist : "Unknown Artist");
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
        
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction("ACTION_PAUSE");
        context.startService(intent);
        call.resolve();
    }
    
    @PluginMethod
    public void resume(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction("ACTION_RESUME");
        context.startService(intent);
        call.resolve();
    }
    
    @PluginMethod
    public void seek(PluginCall call) {
        int position = call.getInt("time", 0);
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction("ACTION_SEEK");
        intent.putExtra("time", position);
        context.startService(intent);
        call.resolve();
    }
}
