const fs = require('fs');
const path = require('path');

const appTsxPath = path.resolve(__dirname, 'client/src/App.tsx');
let code = fs.readFileSync(appTsxPath, 'utf8');

// 1. Remove YouTube import
code = code.replace("import YouTube from 'react-youtube';\n", "");

// 2. Modify Refs
code = code.replace("const playerRef = useRef<any>(null);", "const audioRef = useRef<HTMLAudioElement>(null);\n  const [loadingAudio, setLoadingAudio] = useState(false);");

// 3. togglePlay
code = code.replace(
/const togglePlay = \(\) => {[\s\S]*?};/g,
`const togglePlay = () => {
    const nextState = !state.isPlaying;
    if (isHostOrAdmin) {
      const cTime = audioRef.current ? audioRef.current.currentTime : 0;
      socket.emit('play_pause', { isPlaying: nextState, currentTime: cTime });
    } else {
      localPauseRef.current = !localPauseRef.current;
      setIsLocallyPaused(localPauseRef.current);
      if (localPauseRef.current) {
        if (audioRef.current) audioRef.current.pause();
      } else {
        if (state.isPlaying && audioRef.current) {
          audioRef.current.currentTime = syncTime;
          audioRef.current.play().catch(()=>{});
        }
      }
    }
  };`
);

// 4. Seek
code = code.replace(
`  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setSyncTime(time);
    if (playerRef.current) playerRef.current.seekTo(time);
    socket.emit('seek', { currentTime: time });
  };`,
`  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setSyncTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
    socket.emit('seek', { currentTime: time });
  };`
);

// 5. Socket Sync replacing playerRef
code = code.replace(
/socket\.on\('room_state', \(newState: RoomState\) => {[\s\S]*?}\);/g,
`socket.on('room_state', (newState: RoomState) => {
      setState(prevState => {
        if (audioRef.current) {
          if (newState.currentSong?.id === prevState.currentSong?.id) {
            const currentPlayerTime = audioRef.current.currentTime || 0;
            if (Math.abs(currentPlayerTime - newState.currentTime) > 2) {
              audioRef.current.currentTime = newState.currentTime;
            }
            if (newState.isPlaying && !localPauseRef.current) {
              audioRef.current.play().catch(()=>{});
            } else if (!newState.isPlaying) {
              audioRef.current.pause();
            }
          }
        }
        return newState;
      });
    });`
);

code = code.replace(
/socket\.on\('sync_player', \(\{ isPlaying, currentTime \}: \{ isPlaying: boolean, currentTime: number \}\) => {[\s\S]*?}\);/g,
`socket.on('sync_player', ({ isPlaying, currentTime }: { isPlaying: boolean, currentTime: number }) => {
      if (audioRef.current && !localPauseRef.current) {
        const pTime = audioRef.current.currentTime || 0;
        if (Math.abs(pTime - currentTime) > 2) {
          audioRef.current.currentTime = currentTime;
        }
        if (isPlaying) audioRef.current.play().catch(()=>{});
        else audioRef.current.pause();
      }
      setState(s => ({ ...s, isPlaying, currentTime }));
    });`
);

// 6. Intervals
code = code.replace(
/const interval = setInterval\(\(\) => {[\s\S]*?}, 1000\);/g,
`const interval = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        setSyncTime(audioRef.current.currentTime || 0);
      }
      // Auto-resume hack not needed anymore for raw <audio>, but we keep standard sync intact.
    }, 1000);`
);

code = code.replace(
/const hostInterval = setInterval\(\(\) => {[\s\S]*?}, 4000\);/g,
`const hostInterval = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        socket.emit('host_sync', { currentTime: audioRef.current.currentTime || 0 });
      }
    }, 4000);`
);

// Fix cleanup pause
code = code.replace("if (playerRef.current) playerRef.current.pauseVideo();", "if (audioRef.current) audioRef.current.pause();");


// 7. Remove Silent Audio and Add Stream Fetcher
const silentAudioRegex = /const silentAudioRef = useRef<HTMLAudioElement \| null>\(null\);[\s\S]*?}, \[state\.isPlaying, isLocallyPaused\]\);/g;

const fetcherReplacement = `
  // --- DIRECT AUDIO STREAM FETCHER ---
  useEffect(() => {
    if (state.currentSong) {
      setLoadingAudio(true);
      fetch(\`\${BACKEND_URL}/api/stream-url/\${state.currentSong.id}\`)
        .then(res => res.json())
        .then(data => {
          if (data.url && audioRef.current) {
            audioRef.current.src = data.url;
            if (state.currentTime > 0) audioRef.current.currentTime = state.currentTime;
            
            if (state.isPlaying && !localPauseRef.current) {
              audioRef.current.play().catch(e => console.error("Autoplay prevented", e));
            }
          }
          setLoadingAudio(false);
        })
        .catch(() => setLoadingAudio(false));
    } else {
      if (audioRef.current) {
         audioRef.current.src = '';
         audioRef.current.pause();
      }
    }
  }, [state.currentSong?.id]);
`;

code = code.replace(silentAudioRegex, fetcherReplacement);


// 8. Replace YouTube component render
const youtubeRenderRegex = /\{state\.currentSong && \([\s\S]*?<YouTube[\s\S]*?\/>\s*<\/div>\s*\)\}/g;

const audioRenderReplacement = `
      <audio 
        ref={audioRef}
        onEnded={() => socket.emit('auto_skip')}
        onError={() => socket.emit('error_skip')}
        style={{ display: 'none' }}
      />
`;

code = code.replace(youtubeRenderRegex, audioRenderReplacement);

fs.writeFileSync(appTsxPath, code, 'utf8');
console.log("App.tsx transformed successfully!");
