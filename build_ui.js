const fs = require('fs');

const appPath = 'client/src/App.tsx';
let appCode = fs.readFileSync(appPath, 'utf8');

// 1. We replace LandingPage with SoloDashboard.
const landingPageStart = appCode.indexOf('function LandingPage({');
const roomStart = appCode.indexOf('function Room({');
if (landingPageStart !== -1 && roomStart !== -1) {
    const landingPageCode = appCode.substring(landingPageStart, roomStart);
    
    const soloDashboardCode = `
function LandingPage({ user, onLogout, onCreate, onJoin }: { user: User, onLogout: () => void, onCreate: () => void, onJoin: (id: string) => void }) {
  const [activeTab, setActiveTab] = useState<'discover' | 'search' | 'liked'>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [searching, setSearching] = useState(false);
  
  const [localQueue, setLocalQueue] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncTime, setSyncTime] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  const [joinId, setJoinId] = useState('');
  
  useEffect(() => {
    setLoadingRecommendations(true);
    fetch(\`\${BACKEND_URL}/api/recommendations\`, { headers: { 'Authorization': \`Bearer \${localStorage.getItem('token')}\` } })
      .then(r => r.json())
      .then(data => { if(Array.isArray(data)) setRecommendations(data); setLoadingRecommendations(false); })
      .catch(() => setLoadingRecommendations(false));
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setSearching(true);
    try {
      const res = await fetch(\`\${BACKEND_URL}/api/search?q=\${encodeURIComponent(searchQuery)}\`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) { }
    setSearching(false);
  };

  const playLocal = (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setSyncTime(0);
  };

  const addLocal = (song: Song, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLocalQueue(q => [...q, song]);
  };
  
  const nextTrack = () => {
    if (localQueue.length > 0) {
      const next = localQueue[0];
      setLocalQueue(q => q.slice(1));
      playLocal(next);
    }
  };

  useEffect(() => {
    if (currentSong) {
      setLoadingAudio(true);
      fetch(\`\${BACKEND_URL}/api/stream-url/\${currentSong.id}\`)
        .then(res => res.json())
        .then(data => {
          if (data.url && isPlaying) {
             try { NativeAudio.playStream({ url: data.url, title: currentSong.title, artist: currentSong.author }); } catch(e){}
          }
          setLoadingAudio(false);
        })
        .catch(() => setLoadingAudio(false));
    } else {
      try { NativeAudio.pause(); } catch(e){}
    }
  }, [currentSong?.id]);

  useEffect(() => {
     if (isPlaying) { try { NativeAudio.resume(); } catch(e){} } 
     else { try { NativeAudio.pause(); } catch(e){} }
  }, [isPlaying]);

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <div className="sidebar glass">
        <div className="brand" style={{marginLeft: '15px'}}><Music color="var(--accent)" size={28}/> Noni Music</div>
        <nav>
          <button className={activeTab === 'discover' ? 'active' : ''} onClick={() => setActiveTab('discover')}><Compass size={20}/> Discover</button>
          <button className={activeTab === 'search' ? 'active' : ''} onClick={() => setActiveTab('search')}><Search size={20}/> Search</button>
          <div className="divider" />
          <button onClick={onCreate} className="highlight"><Plus size={20}/> Create Jam</button>
          
          <form className="join-room-mini" onSubmit={(e) => { e.preventDefault(); if (joinId) onJoin(joinId); }}>
             <input placeholder="Room ID" value={joinId} onChange={e=>setJoinId(e.target.value)} className="input-mini"/>
             <button type="submit" className="btn-mini">Join</button>
          </form>
        </nav>
        
        <div style={{flex: 1}} />
        <button className="logout-btn" onClick={onLogout}><LogOut size={16}/> Logout</button>
      </div>
      
      {/* Main View */}
      <div className="main-view">
        <div className="top-gradient" />
        <div className="content-area">
          {activeTab === 'discover' && (
            <div className="discover-section animate-slide-up">
              <h1 style={{fontSize: '3rem', fontWeight: 900, marginBottom: '10px'}}>Good morning</h1>
              <p style={{color: 'var(--text-muted)', marginBottom: '30px', fontSize: '1.1rem'}}>Hundreds of fresh hits, updated instantly.</p>
              
              <div className="grid-container continuous-scroll">
                {recommendations.map((song, i) => (
                  <div key={i} className="card glass-card" onClick={() => playLocal(song)}>
                    <div className="img-container">
                       <img src={song.thumbnail} alt={song.title} />
                       <button className="play-overlay"><Play fill="#000" size={24}/></button>
                    </div>
                    <div className="card-info">
                       <div className="card-title">{song.title}</div>
                       <div className="card-author">{song.author}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'search' && (
             <div className="search-section animate-slide-up">
                <form onSubmit={search} className="massive-search">
                  <Search size={24} color="var(--text-muted)" />
                  <input placeholder="What do you want to listen to?" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </form>
                <div className="list-container">
                   {searchResults.map((song, i) => (
                      <div key={i} className="list-row" onClick={() => playLocal(song)}>
                         <img src={song.thumbnail} alt="cover" />
                         <div className="list-info">
                            <div className="list-title">{song.title}</div>
                            <div className="list-author">{song.author}</div>
                         </div>
                         <button className="list-action" onClick={(e) => addLocal(song, e)}><Plus size={20}/></button>
                      </div>
                   ))}
                </div>
             </div>
          )}
        </div>
      </div>
      
      {/* Absolute Unified Player */}
      {currentSong && (
        <div className="dashboard-player glass">
           <div className="player-left">
              <img src={currentSong.thumbnail} alt="cover" className="player-art" />
              <div className="player-meta">
                 <div className="player-title">{currentSong.title}</div>
                 <div className="player-author">{currentSong.author}</div>
              </div>
           </div>
           
           <div className="player-center">
              <div className="player-controls">
                 <button className="ctrl-btn"><SkipBack size={20}/></button>
                 <button className="play-btn" onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Pause size={20} fill="#000"/> : <Play size={20} fill="#000" style={{marginLeft:'2px'}}/>}
                 </button>
                 <button className="ctrl-btn" onClick={nextTrack}><SkipForward size={20}/></button>
              </div>
           </div>
           
           <div className="player-right">
              <div className="queue-status">
                 {localQueue.length} {localQueue.length === 1 ? 'song' : 'songs'} up next
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

`;
    
    appCode = appCode.replace(landingPageCode, soloDashboardCode);
    fs.writeFileSync(appPath, appCode);
    console.log("Successfully rebuilt Solo Dashboard AST!");
} else {
    console.log("Failed to find LandingPage boundaries.");
}
