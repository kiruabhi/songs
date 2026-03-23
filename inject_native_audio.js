const fs = require('fs');
const path = require('path');

const appTsxPath = path.resolve(__dirname, 'client/src/App.tsx');
let code = fs.readFileSync(appTsxPath, 'utf8');

// 1. Add registerPlugin import
if (!code.includes("import { registerPlugin }")) {
    code = code.replace("import './index.css';", "import './index.css';\nimport { registerPlugin } from '@capacitor/core';\nconst NativeAudio = registerPlugin('NativeAudio');\n");
}

// 2. Rewrite Stream Fetcher to use NativeAudio
const fetcherRegex = /\/\/ --- DIRECT AUDIO STREAM FETCHER ---[\s\S]*?}, \[state\.currentSong\?\.id\]\);/g;
const fetcherReplacement = `
  // --- DIRECT NATIVE AUDIO STREAM FETCHER ---
  useEffect(() => {
    if (state.currentSong) {
      setLoadingAudio(true);
      fetch(\`\${BACKEND_URL}/api/stream-url/\${state.currentSong.id}\`)
        .then(res => res.json())
        .then(data => {
          if (data.url) {
            if (state.isPlaying && !localPauseRef.current) {
                try {
                    NativeAudio.playStream({ url: data.url, title: state.currentSong?.title, artist: state.currentSong?.author });
                    if (state.currentTime > 0) NativeAudio.seek({ time: state.currentTime });
                } catch(e) {}
            }
          }
          setLoadingAudio(false);
        })
        .catch(() => setLoadingAudio(false));
    } else {
      try { NativeAudio.pause(); } catch(e){}
    }
  }, [state.currentSong?.id]);

  // Handle Play/Pause synchronization for NativeAudio
  useEffect(() => {
     if (state.isPlaying && !localPauseRef.current) {
         try { NativeAudio.resume(); } catch(e){}
     } else {
         try { NativeAudio.pause(); } catch(e){}
     }
  }, [state.isPlaying, isLocallyPaused]);
`;
code = code.replace(fetcherRegex, fetcherReplacement);


// 3. Rewrite togglePlay to not use audioRef directly
const toggleRegex = /const togglePlay = \(\) => {[\s\S]*?};/g;
const toggleReplacement = `const togglePlay = () => {
    const nextState = !state.isPlaying;
    if (isHostOrAdmin) {
      socket.emit('play_pause', { isPlaying: nextState, currentTime: syncTime });
    } else {
      localPauseRef.current = !localPauseRef.current;
      setIsLocallyPaused(localPauseRef.current);
    }
  };`;
code = code.replace(toggleRegex, toggleReplacement);

// 4. Rewrite seek
const seekRegex = /const seek = \(e: React\.ChangeEvent<HTMLInputElement>\) => {[\s\S]*?};/g;
const seekReplacement = `const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setSyncTime(time);
    try { NativeAudio.seek({ time }); } catch(err){}
    socket.emit('seek', { currentTime: time });
  };`;
code = code.replace(seekRegex, seekReplacement);


// 5. Rewrite socket.on room_state & sync_player to remove audioRef
code = code.replace(
/socket\.on\('room_state', \(newState: RoomState\) => {[\s\S]*?}\);/g,
`socket.on('room_state', (newState: RoomState) => {
      setState(prevState => {
        if (newState.currentSong?.id === prevState.currentSong?.id) {
           if (Math.abs(syncTime - newState.currentTime) > 2) {
              setSyncTime(newState.currentTime);
              try { NativeAudio.seek({ time: newState.currentTime }); } catch(e){}
           }
        }
        return newState;
      });
    });`
);

code = code.replace(
/socket\.on\('sync_player', \(\{ isPlaying, currentTime \}: \{ isPlaying: boolean, currentTime: number \}\) => {[\s\S]*?}\);/g,
`socket.on('sync_player', ({ isPlaying, currentTime }: { isPlaying: boolean, currentTime: number }) => {
      if (!localPauseRef.current) {
        if (Math.abs(syncTime - currentTime) > 2) {
          setSyncTime(currentTime);
          try { NativeAudio.seek({ time: currentTime }); } catch(e){}
        }
      }
      setState(s => ({ ...s, isPlaying, currentTime }));
    });`
);

// 6. Fix synchronization fake intervals
const intervalRegex = /const interval = setInterval\(\(\) => {[\s\S]*?}, 1000\);/g;
const intervalReplacement = `const interval = setInterval(() => {
      // Fake the sync time locally since NativeAudio doesn't transmit events to JS smoothly without overhead
      if (state.isPlaying && !localPauseRef.current) {
         setSyncTime(prev => {
            const next = prev + 1;
            if (state.currentSong && next >= state.currentSong.seconds) {
               socket.emit('auto_skip');
               return 0;
            }
            return next;
         });
      }
    }, 1000);`;
code = code.replace(intervalRegex, intervalReplacement);


const hostIntervalRegex = /const hostInterval = setInterval\(\(\) => {[\s\S]*?}, 4000\);/g;
const hostIntervalReplacement = `const hostInterval = setInterval(() => {
      if (state.isPlaying && !localPauseRef.current) {
        socket.emit('host_sync', { currentTime: syncTime });
      }
    }, 4000);`;
code = code.replace(hostIntervalRegex, hostIntervalReplacement);

fs.writeFileSync(appTsxPath, code, 'utf8');
console.log("App.tsx Native Sync transformed successfully!");
