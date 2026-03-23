import React, { useState, useEffect, useRef } from 'react';
import { Music, Plus, Play, Pause, SkipForward, SkipBack, Search, LogOut, Heart, Library, ListMusic, Home } from 'lucide-react';
import './dashboard.css';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { BACKEND_URL } from './config';
const NativeAudio: any = registerPlugin('NativeAudio');
const isNative = Capacitor.isNativePlatform();

export default function Dashboard({ user, onLogout, onCreate, onJoin }: any) {
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'library'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [likedSongs, setLikedSongs] = useState<any[]>([]);

  
  const [localQueue, setLocalQueue] = useState<any[]>([]);
  const [currentSong, setCurrentSong] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncTime, setSyncTime] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [joinId, setJoinId] = useState('');
  
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/recommendations`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(data => { if(Array.isArray(data)) setRecommendations(data); })
      .catch(() => {});

    fetch(`${BACKEND_URL}/api/likes`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setLikedSongs(data); })
      .catch(() => {});
  }, []);

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setSearchResults([]);
        return;
      }
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      setSearchResults([]);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    runSearch(searchQuery);
  };

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (val.trim()) {
      searchDebounceRef.current = setTimeout(() => runSearch(val), 300);
    } else {
      setSearchResults([]);
    }
  };

  const playLocal = (song: any) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setSyncTime(0);
  };

  const addLocal = (song: any, e?: React.MouseEvent) => {
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
      fetch(`${BACKEND_URL}/api/stream-url/${currentSong.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.url) {
            if (isNative) {
              try { NativeAudio.playStream({ url: data.url, title: currentSong.title, artist: currentSong.author }); } catch(e){}
            } else if (audioRef.current) {
              audioRef.current.src = data.url;
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }
        })
        .catch(() => {});
    } else {
      if (isNative) { try { NativeAudio.pause(); } catch(e){} }
      else if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    }
  }, [currentSong?.id]);

  useEffect(() => {
    if (isNative) {
      if (isPlaying) { try { NativeAudio.resume(); } catch(e){} }
      else { try { NativeAudio.pause(); } catch(e){} }
    } else {
      if (!audioRef.current || !audioRef.current.src) return;
      if (isPlaying) { audioRef.current.play().catch(() => {}); }
      else { audioRef.current.pause(); }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isNative) return; // web: onTimeUpdate drives syncTime
    const interval = setInterval(() => {
      if (isPlaying) {
         setSyncTime(prev => {
            const next = prev + 1;
            if (currentSong && next >= (currentSong.seconds || 0)) {
               nextTrack();
               return 0;
            }
            return next;
         });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentSong, localQueue]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setSyncTime(time);
    if (isNative) { try { NativeAudio.seek({ time }); } catch(err){} }
    else if (audioRef.current) { audioRef.current.currentTime = time; }
  };

  const SectionRow = ({ title, items }: { title: string, items: any[] }) => (
    <div className="section-block animate-fade-in">
       <h2 className="section-title">{title}</h2>
       <div className="horizontal-scroll">
         {items.map((song, i) => (
           <div key={i} className="spotify-card" onClick={() => playLocal(song)}>
              <div className="card-img-wrapped">
                 <img src={song.thumbnail} alt={song.title} />
                 <button className="hover-play-btn" onClick={(e) => { e.stopPropagation(); playLocal(song); }}>
                    <Play fill="#000" size={20} style={{marginLeft: '2px'}}/>
                 </button>
              </div>
              <div className="card-text">
                 <h3>{song.title}</h3>
                 <p>{song.author}</p>
              </div>
           </div>
         ))}
       </div>
    </div>
  );

  // Divide recommendations into rows
  const row1 = recommendations.slice(0, 10);
  const row2 = recommendations.slice(10, 20);
  const row3 = recommendations.slice(20, 40); // larger row

  return (
    <div className="layout-root">
      <audio
        ref={audioRef}
        style={{ display: 'none' }}
        onEnded={nextTrack}
        onTimeUpdate={() => { if (!isNative && audioRef.current) setSyncTime(Math.floor(audioRef.current.currentTime)); }}
      />
      {/* LEFT SIDEBAR */}
      <nav className="nav-sidebar">
         <div className="brand-logo">
            <Music color="#fff" size={28}/> <span>NoniMusic</span>
         </div>
         
         <ul className="nav-list">
            <li className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>
              <Home size={24} /> <span>Home</span>
            </li>
            <li className={activeTab === 'search' ? 'active' : ''} onClick={() => setActiveTab('search')}>
              <Search size={24} /> <span>Search</span>
            </li>
            <li className={activeTab === 'library' ? 'active' : ''} onClick={() => setActiveTab('library')}>
              <Library size={24} /> <span>Your Library</span>
            </li>
         </ul>

         <div className="nav-actions">
            <button className="action-btn" onClick={onCreate}>
               <div className="icon-box plus-box"><Plus size={16}/></div>
               <span>Create Jam Room</span>
            </button>
            <button className="action-btn" onClick={() => setActiveTab('library')}>
               <div className="icon-box heart-box"><Heart size={16} fill="#fff"/></div>
               <span>Liked Songs</span>
            </button>
         </div>

         <div className="divider"></div>

         <form className="join-form" onSubmit={(e) => { e.preventDefault(); if (joinId) onJoin(joinId); }}>
            <p style={{fontSize: '0.75rem', color: '#b3b3b3', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600}}>Join a Jam</p>
            <input placeholder="Room ID" value={joinId} onChange={e=>setJoinId(e.target.value)} />
            <button type="submit">Join</button>
         </form>

         <div className="flex-spacer"></div>
         <button className="logout-action" onClick={onLogout}>
            <LogOut size={20}/> <span>Sign out {user.username}</span>
         </button>
      </nav>

      {/* MAIN VIEW */}
      <main className="main-content">
         <div className="top-gradient-overlay"></div>
         
         <header className="top-header">
            <div className="history-nav">
               <button className="circle-btn"><SkipBack size={20} color="#fff"/></button>
               <button className="circle-btn"><SkipForward size={20} color="#fff"/></button>
            </div>
            {activeTab === 'search' && (
              <form className="search-bar-header" onSubmit={search}>
                  <Search size={20} color="#000" />
                  <input placeholder="What do you want to play?" value={searchQuery} onChange={onSearchChange} autoFocus />
              </form>
            )}
            <div className="user-pill">
               <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
            </div>
         </header>

         <div className="scrollable-content">
            {activeTab === 'home' && (
               <>
                 <h1 className="greeting">Good evening</h1>
                 
                 {/* Top 6 featured blocks */}
                 <div className="featured-grid">
                    {recommendations.slice(0, 6).map((song, i) => (
                       <div key={i} className="featured-card" onClick={() => playLocal(song)}>
                          <img src={song.thumbnail} alt="cover" />
                          <span>{song.title}</span>
                          <button className="hover-play-btn"><Play fill="#000" size={18} style={{marginLeft: '2px'}}/></button>
                       </div>
                    ))}
                 </div>

                 <SectionRow title="Made For You" items={row1} />
                 <SectionRow title="Recently played" items={row2} />
                 {row3.length > 0 && <SectionRow title="More of what you like" items={row3} />}
               </>
            )}

            {activeTab === 'search' && (
               <div className="search-results-section animate-fade-in">
                  {searchResults.length === 0 ? (
                     <div className="empty-state">
                        <h3>Discover millions of songs</h3>
                        <p>Search for artists, songs, or podcasts.</p>
                     </div>
                  ) : (
                     <>
                       <h2 className="section-title">Top Results</h2>
                       <div className="list-tracks">
                          {searchResults.map((song, i) => (
                             <div key={i} className="track-row" onClick={() => playLocal(song)}>
                                <div className="track-img-box">
                                   <img src={song.thumbnail} alt="cover" />
                                   <div className="track-play-hover"><Play fill="#fff" size={16}/></div>
                                </div>
                                <div className="track-details">
                                   <div className="t-title">{song.title}</div>
                                   <div className="t-author">{song.author}</div>
                                </div>
                                <div className="track-duration">{song.duration}</div>
                                <button className="add-btn" onClick={(e) => addLocal(song, e)}><Plus size={20}/></button>
                             </div>
                          ))}
                       </div>
                     </>
                  )}
               </div>
            )}

            {activeTab === 'library' && (
               <div className="library-section animate-fade-in">
                  <h1 className="greeting">Your Library</h1>
                  <SectionRow title="Liked Songs" items={likedSongs} />
                  {localQueue.length > 0 && (
                     <div style={{marginTop: '40px'}}>
                        <h2 className="section-title">Up Next In Queue</h2>
                        <div className="list-tracks">
                           {localQueue.map((song, i) => (
                              <div key={i} className="track-row" onClick={() => playLocal(song)}>
                                 <div className="track-img-box"><img src={song.thumbnail} alt="cover" /></div>
                                 <div className="track-details">
                                    <div className="t-title">{song.title}</div>
                                    <div className="t-author">{song.author}</div>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}
               </div>
            )}
            
            <div style={{height: '100px'}}></div>
         </div>
      </main>

      {/* BOTTOM PLAYER BAR */}
      <footer className="now-playing-bar">
         {currentSong ? (
            <>
               <div className="np-left">
                  <img src={currentSong.thumbnail} alt="cover" />
                  <div className="np-info">
                     <div className="np-title">{currentSong.title}</div>
                     <div className="np-author">{currentSong.author}</div>
                  </div>
                  <Heart size={16} color="#b3b3b3" className="np-heart" />
               </div>

               <div className="np-center">
                  <div className="np-controls">
                     <button className="ctrl-btn"><SkipBack size={18}/></button>
                     <button className="play-circle-btn" onClick={() => setIsPlaying(!isPlaying)}>
                        {isPlaying ? <Pause size={18} fill="#000"/> : <Play size={18} fill="#000" style={{marginLeft:'2px'}}/>}
                     </button>
                     <button className="ctrl-btn" onClick={nextTrack}><SkipForward size={18}/></button>
                  </div>
                  <div className="np-progress">
                     <span className="time-text">{formatTime(syncTime)}</span>
                     <input type="range" min="0" max={currentSong.seconds || 0} value={syncTime} onChange={seek} className="playback-slider" />
                     <span className="time-text">{currentSong.duration}</span>
                  </div>
               </div>

               <div className="np-right">
                  <ListMusic size={16} color="#b3b3b3" />
                  <div className="volume-bar">
                     <div className="volume-fill"></div>
                  </div>
               </div>
            </>
         ) : (
            <div className="np-empty">Select a track to start listening</div>
         )}
      </footer>
    </div>
  );
}

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
