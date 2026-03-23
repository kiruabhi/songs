import Dashboard from './Dashboard';
import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Music, Plus, Play, Pause, SkipForward, SkipBack, Copy, Search, Check, Disc, Heart, Repeat, LogOut, Users, Compass, Settings, X } from 'lucide-react';
import './index.css';
import './dashboard.css';
import './jam.css';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { BACKEND_URL } from './config';
const NativeAudio: any = registerPlugin('NativeAudio');
const isNative = Capacitor.isNativePlatform();

type User = {
  id: number;
  username: string;
  role: string;
};

type Song = {
  id: string;
  title: string;
  thumbnail: string;
  author: string;
  duration: string;
  seconds: number;
  addedBy?: string;
  queueId?: string;
};

type ActiveUser = {
  id: number;
  username: string;
  role: string;
};

type RoomState = {
  hostId: number;
  activeUsers: ActiveUser[];
  queue: Song[];
  history: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  isLooping: boolean;
  currentTime: number;
};

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [roomId, setRoomId] = useState<string>('');
  const [inRoom, setInRoom] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token || !user) return;
    const path = window.location.pathname;
    if (path.length > 1) {
      const roomFromUrl = path.substring(1);
      joinRoom(roomFromUrl);
    }
  }, [token, user]);

  const handleAuth = (token: string, user: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    if (socket) socket.disconnect();
    setInRoom(false);
    window.history.pushState({}, '', `/`);
  };

  const createRoom = () => {
    const newRoomId = Math.floor(1000 + Math.random() * 9000).toString();
    window.history.pushState({}, '', `/${newRoomId}`);
    joinRoom(newRoomId);
  };

  const joinRoom = (id: string) => {
    setRoomId(id);
    const newSocket = io(BACKEND_URL, {
      auth: { token }
    });
    setSocket(newSocket);
    newSocket.emit('join_room', id);
    setInRoom(true);
  };

  if (!token || !user) {
    return <AuthGateway onAuth={handleAuth} />;
  }

  return (
    <div className="app-container">
      {!inRoom ? (
        <Dashboard user={user} onLogout={logout} onCreate={createRoom} onJoin={(id: string) => { window.history.pushState({}, '', `/${id}`); joinRoom(id); }} />
      ) : (
        <Room roomId={roomId} socket={socket!} user={user} token={token} onLogout={logout} />
      )}
    </div>
  );
}

function AuthGateway({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        onAuth(data.token, data.user);
      } else {
        setError(data.error);
      }
    } catch {
      setError("Server connection failed.");
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <form className="glass animate-slide-up" onSubmit={submit} style={{ padding: '40px', maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <Music size={40} color="var(--accent)" style={{ marginBottom: '10px' }} />
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Noni Jam Login</h2>
        </div>

        {error && <div style={{ color: '#ff4444', background: 'rgba(255,0,0,0.1)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>{error}</div>}

        <input className="input" placeholder="Username" required value={username} onChange={e => setUsername(e.target.value)} />
        <input className="input" type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} />

        <button className="btn" type="submit" style={{ marginTop: '10px' }}>Enter Jam</button>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          By default, use 'admin' / 'admin123'
        </div>
      </form>
    </div>
  );
}


function Room({ roomId, socket, user, token, onLogout }: { roomId: string, socket: Socket, user: User, token: string, onLogout: () => void }) {
  const [state, setState] = useState<RoomState>({ hostId: 0, activeUsers: [], queue: [], history: [], currentSong: null, isPlaying: false, isLooping: false, currentTime: 0 });
  const [activeTab, setActiveTab] = useState<'room' | 'liked' | 'admin' | 'recommend'>('room');
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncTime, setSyncTime] = useState(0);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [showFullPlayer, setShowFullPlayer] = useState(false);

  const [showPrefModal, setShowPrefModal] = useState(false);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [newPref, setNewPref] = useState('');

  const localPauseRef = useRef(false);
  const stateRef = useRef(state);
  const syncTimeRef = useRef(syncTime);
  const [isLocallyPaused, setIsLocallyPaused] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminMsg, setAdminMsg] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);

  const isHostOrAdmin = state.hostId === user.id || user.role === 'admin';

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    syncTimeRef.current = syncTime;
  }, [syncTime]);

  useEffect(() => {
    // Fetch Liked Songs securely
    fetch(`${BACKEND_URL}/api/likes`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setLikedSongs(data); })
      .catch(() => { });

    // Fetch Discover Preferences
    fetch(`${BACKEND_URL}/api/preferences`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPreferences(data); })
      .catch(() => { });
  }, [token]);

  const fetchRecommendations = async (overrideQuery?: string) => {
    if (!token) return;
    setLoadingRecommendations(true);
    try {
      const baseUrl = BACKEND_URL || window.location.origin;
      const url = new URL(`${baseUrl}/api/recommendations`);
      if (overrideQuery) url.searchParams.append("q", overrideQuery);

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingRecommendations(false);
  };

  useEffect(() => {
    if (activeTab === 'recommend' && recommendations.length === 0) {
      fetchRecommendations();
    }
  }, [activeTab]);

  const toggleLike = async (song: Song | null) => {
    if (!song) return;
    const isLiked = likedSongs.some(s => s.id === song.id);

    if (isLiked) {
      setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      await fetch(`${BACKEND_URL}/api/likes/${song.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    } else {
      setLikedSongs(prev => [...prev, song]);
      await fetch(`${BACKEND_URL}/api/likes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      });
    }
  };

  const addPref = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPref.trim()) return;
    const updated = [...new Set([...preferences, newPref.trim()])];
    setPreferences(updated);
    setNewPref('');
    await fetch(`${BACKEND_URL}/api/preferences`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: updated })
    });
    fetchRecommendations();
  };

  const removePref = async (tag: string) => {
    const updated = preferences.filter(t => t !== tag);
    setPreferences(updated);
    await fetch(`${BACKEND_URL}/api/preferences`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: updated })
    });
    fetchRecommendations();
  };

  useEffect(() => {
    socket.on('room_state', (newState: RoomState) => {
      setState(prevState => {
        if (newState.currentSong?.id === prevState.currentSong?.id) {
           if (Math.abs(syncTimeRef.current - newState.currentTime) > 2) {
              setSyncTime(newState.currentTime);
              if (isNative) {
                try { NativeAudio.seek({ time: newState.currentTime }); } catch(e){}
              } else if (audioRef.current) {
                audioRef.current.currentTime = newState.currentTime;
              }
           }
        }
        return newState;
      });
    });


    socket.on('sync_player', ({ isPlaying, currentTime }: { isPlaying: boolean, currentTime: number }) => {
      if (!localPauseRef.current) {
        if (Math.abs(syncTimeRef.current - currentTime) > 2) {
          setSyncTime(currentTime);
          if (isNative) {
            try { NativeAudio.seek({ time: currentTime }); } catch(e){}
          } else if (audioRef.current) {
            audioRef.current.currentTime = currentTime;
          }
        }
      }
      setState(s => ({ ...s, isPlaying, currentTime }));
    });


    const interval = setInterval(() => {
      // Fake the sync time locally since NativeAudio doesn't transmit events to JS smoothly without overhead
      const currentState = stateRef.current;
      if (currentState.isPlaying && !localPauseRef.current) {
         setSyncTime(prev => {
            const next = prev + 1;
            if (currentState.currentSong && next >= currentState.currentSong.seconds) {
               socket.emit('auto_skip');
               return 0;
            }
            return next;
         });
      }
    }, 1000);

    const hostInterval = setInterval(() => {
      const currentState = stateRef.current;
      if (currentState.isPlaying && !localPauseRef.current) {
        socket.emit('host_sync', { currentTime: syncTimeRef.current });
      }
    }, 4000);

    return () => {
      socket.off('room_state');
      socket.off('sync_player');
      clearInterval(interval);
      clearInterval(hostInterval);
      if (audioRef.current) audioRef.current.pause();
    };
  }, [socket]);

  const copyLink = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
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
    } finally {
      setSearching(false);
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

  const addSong = (song: Song, e?: React.MouseEvent) => {
    e?.stopPropagation();
    socket.emit('add_song', song);
    setSearchQuery('');
    setSearchResults([]);
  };

  const instantPlay = (song: Song) => {
    socket.emit('instant_play', song);
    if (activeTab === 'room') {
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const togglePlay = () => {
    const nextState = !state.isPlaying;
    if (isHostOrAdmin) {
      socket.emit('play_pause', { isPlaying: nextState, currentTime: syncTime });
    } else {
      localPauseRef.current = !localPauseRef.current;
      setIsLocallyPaused(localPauseRef.current);
    }
  };

  const createAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminMsg('');
    const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ username: newUsername, password: newPassword })
    });
    if (res.ok) {
      setAdminMsg('Account created successfully!');
      setNewUsername('');
      setNewPassword('');
    } else {
      setAdminMsg('Failed to create account.');
    }
  };

  const skip = () => { socket.emit('skip_song', true) };
  const previous = () => { socket.emit('previous_song') };
  const toggleLoop = () => { if (isHostOrAdmin) socket.emit('loop_toggle') };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setSyncTime(time);
    if (isNative) { try { NativeAudio.seek({ time }); } catch(err){} }
    else if (audioRef.current) { audioRef.current.currentTime = time; }
    socket.emit('seek', { currentTime: time });
  };

  const isCurrentLiked = state.currentSong && likedSongs.some(s => s.id === state.currentSong!.id);

  
  
  // --- AUDIO STREAM PLAYBACK (Web: HTML audio | Native: NativeAudio plugin) ---
  useEffect(() => {
    if (state.currentSong) {
      fetch(`${BACKEND_URL}/api/stream-url/${state.currentSong.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.url) {
            if (isNative) {
              try {
                NativeAudio.playStream({ url: data.url, title: state.currentSong?.title, artist: state.currentSong?.author });
                if (state.currentTime > 0) NativeAudio.seek({ time: state.currentTime });
              } catch(e) {}
            } else {
              // Web browser — drive the HTML <audio> element directly
              if (audioRef.current) {
                audioRef.current.src = data.url;
                audioRef.current.currentTime = state.currentTime > 0 ? state.currentTime : 0;
                if (state.isPlaying && !localPauseRef.current) {
                  audioRef.current.play().catch(() => {});
                }
              }
            }
          }
        })
        .catch(() => {});
    } else {
      if (isNative) { try { NativeAudio.pause(); } catch(e){} }
      else if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    }
  }, [state.currentSong?.id]);

  // Handle Play/Pause synchronization
  useEffect(() => {
    const playing = state.isPlaying && !localPauseRef.current;
    if (isNative) {
      if (playing) { try { NativeAudio.resume(); } catch(e){} }
      else { try { NativeAudio.pause(); } catch(e){} }
    } else {
      if (!audioRef.current || !audioRef.current.src) return;
      if (playing) { audioRef.current.play().catch(() => {}); }
      else { audioRef.current.pause(); }
    }
  }, [state.isPlaying, isLocallyPaused]);



  useEffect(() => {
    if (state.currentSong && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: state.currentSong.title,
        artist: state.currentSong.author,
        artwork: [{ src: state.currentSong.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('nexttrack', skip);
      navigator.mediaSession.setActionHandler('previoustrack', previous);
    }
  }, [state.currentSong]);

  return (
    <div className="jam-root">
      
      <audio 
        ref={audioRef}
        onEnded={() => socket.emit('auto_skip')}
        onError={() => socket.emit('error_skip')}
        onTimeUpdate={() => {
          if (!isNative && audioRef.current) {
            setSyncTime(Math.floor(audioRef.current.currentTime));
          }
        }}
        style={{ display: 'none' }}
      />

      {/* TOP NAV */}
      <nav className="jam-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="jam-brand">
            <Music color="var(--accent)" size={22} />
            <span>NoniMusic</span>
          </div>
          <span className="jam-room-badge">#{roomId}</span>
          <div className="jam-avatars" onClick={() => setShowParticipants(true)}>
            {state.activeUsers?.map((u, i) => (
              <div
                key={i}
                className={`jam-avatar ${u.id === state.hostId ? 'host' : 'guest'}`}
                title={u.username + (u.id === state.hostId ? ' (Host)' : ' (Guest)')}
                style={{ zIndex: 20 - i }}
              >
                {u.username.substring(0, 1).toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        <div className="jam-nav-tabs">
          <button className={`jam-tab-btn ${activeTab === 'room' ? 'active' : ''}`} onClick={() => setActiveTab('room')}>
            <Search size={15} /> Search &amp; Queue
          </button>
          <button className={`jam-tab-btn ${activeTab === 'recommend' ? 'active' : ''}`} onClick={() => setActiveTab('recommend')}>
            <Compass size={15} /> Discover
          </button>
          <button className={`jam-tab-btn ${activeTab === 'liked' ? 'active' : ''}`} onClick={() => setActiveTab('liked')}>
            <Heart size={15} fill={activeTab === 'liked' ? 'var(--accent)' : 'none'} color={activeTab === 'liked' ? 'var(--accent)' : 'currentColor'} /> Liked
          </button>
          {user.role === 'admin' && (
            <button className={`jam-tab-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
              <Users size={15} /> Admin
            </button>
          )}
        </div>

        <div className="jam-nav-actions">
          <button className="jam-icon-btn" onClick={copyLink} title={copied ? 'Copied!' : 'Copy Room ID'}>
            {copied ? <Check size={18} color="var(--accent)" /> : <Copy size={18} />}
          </button>
          <button className="jam-icon-btn danger" onClick={onLogout} title="Leave room">
            <LogOut size={18} />
          </button>
        </div>
      </nav>


      {/* BODY */}
      <div className="jam-body">
        <div className="jam-content">

          {/* ── Search & Queue ── */}
          {activeTab === 'room' && (
            <>
              <form onSubmit={search} className="jam-searchbar">
                <input className="input" placeholder="Search songs on Noni Music..." value={searchQuery} onChange={onSearchChange} />
                <button className="jam-search-submit" type="submit" disabled={searching}><Search size={18} /></button>
              </form>

              <div className="jam-tab-content">
                {searchResults.length > 0 ? (
                  <>
                    <p className="jam-section-label">Results — click to play instantly</p>
                    {searchResults.map((song) => (
                      <div key={song.id} className="jam-track-row" onClick={() => instantPlay(song)}>
                        <img className="jam-track-thumb" src={song.thumbnail} alt={song.title} />
                        <div className="jam-track-info">
                          <div className={`jam-track-title ${state.currentSong?.id === song.id ? 'now-playing' : ''}`}>{song.title}</div>
                          <div className="jam-track-meta">{song.author} · {song.duration}</div>
                        </div>
                        <button className="jam-track-action" onClick={(e) => { e.stopPropagation(); toggleLike(song); }}>
                          <Heart size={18} fill={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'none'} color={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'currentColor'} />
                        </button>
                        <button className="jam-add-btn" onClick={(e) => addSong(song, e)} title="Add to Queue">
                          <Plus size={15} />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <p className="jam-section-label">Up Next</p>
                    {state.queue.length === 0 ? (
                      <div className="jam-empty-state">
                        <Disc size={48} />
                        <h3>Queue is empty</h3>
                        <p>Search for a song to add it to the queue.</p>
                      </div>
                    ) : (
                      state.queue.map((song, i) => (
                        <div key={song.queueId} className="jam-track-row animate-slide-up" style={{ animationDelay: `${i * 0.04}s` }} onClick={() => instantPlay(song)}>
                          <img className="jam-track-thumb sm" src={song.thumbnail} alt={song.title} />
                          <div className="jam-track-info">
                            <div className="jam-track-title">{song.title}</div>
                            {song.addedBy && <div className="jam-track-addedby">Added by {song.addedBy}</div>}
                          </div>
                          <button className="jam-track-action" onClick={(e) => { e.stopPropagation(); toggleLike(song); }}>
                            <Heart size={16} fill={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'none'} color={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'currentColor'} />
                          </button>
                          <Play size={14} color="var(--text-muted)" />
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ── Discover ── */}
          {activeTab === 'recommend' && (
            <div className="jam-tab-content animate-slide-up">
              <div className="jam-discover-header">
                <h2>Discover New Music</h2>
                <button className="jam-algo-btn" onClick={() => setShowPrefModal(true)}>
                  <Settings size={14} /> Tune Algorithm
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '18px', lineHeight: 1.6 }}>Personalised recommendations based on your liked songs and library trends.</p>
              <form onSubmit={e => { e.preventDefault(); fetchRecommendations(discoverQuery); }} className="jam-searchbar" style={{ marginBottom: '20px' }}>
                <input className="input" placeholder="Search a mood, artist, or genre..." value={discoverQuery} onChange={e => setDiscoverQuery(e.target.value)} />
                <button className="jam-search-submit" type="submit" disabled={loadingRecommendations}><Search size={18} /></button>
              </form>

              {loadingRecommendations ? (
                <div className="jam-loader"><div className="loader" /></div>
              ) : recommendations.length === 0 ? (
                <div className="jam-empty-state">
                  <Compass size={48} />
                  <h3>Nothing found yet</h3>
                  <p>Try searching a mood or genre above.</p>
                </div>
              ) : (
                <div className="jam-discover-grid">
                  {recommendations.map((song, i) => (
                    <div key={song.id} className="jam-discover-card animate-slide-up" style={{ animationDelay: `${i * 0.03}s` }} onClick={() => instantPlay(song)}>
                      <img src={song.thumbnail} alt={song.title} />
                      <div className="jam-discover-card-info">
                        <div className="jam-discover-card-title">{song.title}</div>
                        <div className="jam-discover-card-author">{song.author}</div>
                      </div>
                      <div className="jam-discover-card-actions">
                        <button className="play-btn" onClick={(e) => { e.stopPropagation(); instantPlay(song); }}><Play size={15} fill="#000" /></button>
                        <button className="add-btn-card" onClick={(e) => { e.stopPropagation(); addSong(song, e); }}><Plus size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Liked Songs ── */}
          {activeTab === 'liked' && (
            <div className="jam-tab-content animate-slide-up">
              <p className="jam-section-label">Your Liked Songs</p>
              {likedSongs.length === 0 ? (
                <div className="jam-empty-state">
                  <Heart size={48} />
                  <h3>No liked songs yet</h3>
                  <p>Heart a song while it's playing to save it here.</p>
                </div>
              ) : (
                likedSongs.map((song) => (
                  <div key={song.id} className="jam-track-row" onClick={() => instantPlay(song)}>
                    <img className="jam-track-thumb" src={song.thumbnail} alt={song.title} />
                    <div className="jam-track-info">
                      <div className="jam-track-title">{song.title}</div>
                      <div className="jam-track-meta">{song.author} · {song.duration}</div>
                    </div>
                    <button className="jam-track-action liked" onClick={(e) => { e.stopPropagation(); toggleLike(song); }}>
                      <Heart size={18} fill="var(--accent)" color="var(--accent)" />
                    </button>
                    <button className="jam-add-btn" onClick={(e) => addSong(song, e)} title="Add to Queue">
                      <Plus size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Admin ── */}
          {activeTab === 'admin' && user.role === 'admin' && (
            <div className="jam-tab-content animate-slide-up">
              <div className="jam-admin-card">
                <h3><Users size={20} color="var(--accent)" /> Invite Friends</h3>
                <form onSubmit={createAdminUser} className="jam-admin-form">
                  <input className="input" placeholder="New Friend Username" required value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                  <input className="input" type="password" placeholder="New Password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <button type="submit" className="btn">Create Account</button>
                  {adminMsg && <div className={`jam-admin-msg ${adminMsg.includes('success') ? 'ok' : 'err'}`}>{adminMsg}</div>}
                </form>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* BOTTOM PLAYER BAR */}
      <footer className="jam-player-bar">
        {state.currentSong ? (
          <>
            {/* Left: thumbnail + song info + like */}
            <div className="jam-player-left">
              <img
                className="jam-player-thumb"
                src={state.currentSong.thumbnail}
                alt="cover"
                onClick={() => setShowFullPlayer(true)}
                title="Open full player"
              />
              <div className="jam-player-song-info">
                <div className="jam-player-title">{state.currentSong.title}</div>
                <div className="jam-player-author">{state.currentSong.author}</div>
              </div>
              <button className="jam-player-like" onClick={() => toggleLike(state.currentSong)}>
                <Heart size={18} fill={isCurrentLiked ? 'var(--accent)' : 'none'} color={isCurrentLiked ? 'var(--accent)' : 'var(--text-muted)'} />
              </button>
            </div>

            {/* Center: controls + seek */}
            <div className="jam-player-center">
              <div className="jam-controls">
                <button className="jam-ctrl-btn" onClick={previous} disabled={state.history.length === 0}>
                  <SkipBack size={20} />
                </button>
                <button className="jam-play-btn" onClick={togglePlay}>
                  {(isHostOrAdmin ? state.isPlaying : (!isLocallyPaused && state.isPlaying))
                    ? <Pause size={20} fill="#000" />
                    : <Play size={20} fill="#000" style={{ marginLeft: '2px' }} />}
                </button>
                <button className="jam-ctrl-btn" onClick={skip}>
                  <SkipForward size={20} />
                </button>
              </div>
              <div className="jam-progress-row">
                <span>{formatTime(syncTime)}</span>
                <input type="range" min="0" max={state.currentSong.seconds || 0} value={syncTime} onChange={seek} className="seek-slider" style={{ flex: 1 }} />
                <span>{state.currentSong.duration}</span>
              </div>
            </div>

            {/* Right: loop + role badge */}
            <div className="jam-player-right">
              <button
                className={`jam-ctrl-btn ${state.isLooping ? 'loop-active' : ''}`}
                onClick={toggleLoop}
                disabled={!isHostOrAdmin}
                title="Toggle loop"
              >
                <Repeat size={18} />
              </button>
              <span className={`jam-role-badge ${isHostOrAdmin ? 'host' : 'guest'}`}>
                {isHostOrAdmin ? 'HOST' : 'GUEST'}
              </span>
            </div>
          </>
        ) : (
          <div className="jam-player-empty">
            <Disc size={22} style={{ animation: 'spin 4s linear infinite', opacity: 0.4 }} />
            No song playing right now
          </div>
        )}
      </footer>

      {/* MOBILE BOTTOM NAV */}
      <div className="mobile-bottom-nav">
        <button className={activeTab === 'room' ? 'active' : ''} onClick={() => setActiveTab('room')}>
          <Search size={22} /><span>Search</span>
        </button>
        <button className={activeTab === 'recommend' ? 'active' : ''} onClick={() => setActiveTab('recommend')}>
          <Compass size={22} /><span>Discover</span>
        </button>
        <button className={activeTab === 'liked' ? 'active' : ''} onClick={() => setActiveTab('liked')}>
          <Heart size={22} fill={activeTab === 'liked' ? 'var(--accent)' : 'none'} color={activeTab === 'liked' ? 'var(--accent)' : '#fff'} /><span>Liked</span>
        </button>
        {user.role === 'admin' && (
          <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>
            <Users size={22} /><span>Admin</span>
          </button>
        )}
      </div>

      {/* FULL SCREEN NOW PLAYING */}
      {showFullPlayer && state.currentSong && (
        <div className="jam-fullplayer animate-slide-up">
          <div className="jam-fullplayer-header">
            <button className="jam-fullplayer-ctrl" onClick={() => setShowFullPlayer(false)}><X size={26} /></button>
            <span className="jam-fullplayer-label">Now Playing</span>
            <div style={{ width: 42 }} />
          </div>

          <div className="jam-fullplayer-art">
            <div className="jam-fullplayer-art-frame">
              <img src={state.currentSong.thumbnail} alt={state.currentSong.title} className={state.isPlaying ? 'playing' : ''} />
            </div>
            {state.isPlaying && <div className="jam-fullplayer-ring" />}
          </div>

          <div className="jam-fullplayer-info">
            <h2>{state.currentSong.title}</h2>
            <p>{state.currentSong.author}</p>
            {state.currentSong.addedBy && <p className="jam-fullplayer-addedby">♫ Added by {state.currentSong.addedBy}</p>}
          </div>

          {/* Like */}
          <div style={{ marginBottom: '16px' }}>
            <button className="jam-player-like" onClick={() => toggleLike(state.currentSong!)}>
              <Heart size={26} fill={isCurrentLiked ? 'var(--accent)' : 'none'} color={isCurrentLiked ? 'var(--accent)' : '#fff'} />
            </button>
          </div>

          <div className="jam-fullplayer-seek">
            <div className="jam-fullplayer-seek-times">
              <span>{formatTime(syncTime)}</span>
              <span>{state.currentSong.duration}</span>
            </div>
            <input type="range" min="0" max={state.currentSong.seconds || 0} value={syncTime} onChange={seek} className="seek-slider" style={{ width: '100%' }} />
          </div>

          <div className="jam-fullplayer-controls">
            <button className="jam-fullplayer-ctrl" onClick={previous}><SkipBack size={30} /></button>
            <button className="jam-fullplayer-play" onClick={togglePlay}>
              {(isHostOrAdmin ? state.isPlaying : (!isLocallyPaused && state.isPlaying))
                ? <Pause size={32} fill="#000" />
                : <Play size={32} fill="#000" style={{ marginLeft: '4px' }} />}
            </button>
            <button className="jam-fullplayer-ctrl" onClick={skip}><SkipForward size={30} /></button>
          </div>
        </div>
      )}

      {/* PARTICIPANTS MODAL */}
      {showParticipants && (
        <div className="jam-overlay" onClick={() => setShowParticipants(false)}>
          <div className="jam-modal animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3><Users size={18} color="var(--accent)" /> Room Participants</h3>
            <button className="jam-modal-close" onClick={() => setShowParticipants(false)}><X size={18} /></button>
            <div className="jam-participants-list" style={{ marginTop: '16px' }}>
              {state.activeUsers?.map(u => (
                <div key={u.id} className="jam-participant-row">
                  <div className={`jam-participant-avatar ${u.id === state.hostId ? 'host' : 'guest'}`}
                    style={{ background: u.id === state.hostId ? 'var(--accent)' : 'rgba(255,255,255,0.12)', color: u.id === state.hostId ? '#000' : '#fff' }}>
                    {u.username.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="jam-participant-info">
                    <div className="jam-participant-name">{u.username} {u.id === user.id ? '(You)' : ''}</div>
                    <div className="jam-participant-sub">ID {u.id}</div>
                  </div>
                  <span className={`jam-role-badge ${u.id === state.hostId ? 'host' : 'guest'}`}>
                    {u.id === state.hostId ? 'Host' : 'Guest'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PREFERENCES MODAL */}
      {showPrefModal && (
        <div className="jam-overlay" onClick={() => setShowPrefModal(false)}>
          <div className="jam-modal animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3><Settings size={16} /> Algorithm Tuning</h3>
            <button className="jam-modal-close" onClick={() => setShowPrefModal(false)}><X size={18} /></button>
            <p>Add artists, genres, or moods to tightly focus your Discover feed.</p>
            <form onSubmit={addPref} className="jam-pref-form">
              <input className="input" style={{ flex: 1 }} placeholder="e.g. Synthwave" value={newPref} onChange={e => setNewPref(e.target.value)} />
              <button type="submit" className="btn secondary">Add</button>
            </form>
            <div className="jam-pref-tags">
              {preferences.length === 0
                ? <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No tags yet.</span>
                : preferences.map(t => (
                  <div key={t} className="jam-pref-tag">
                    {t}
                    <button onClick={() => removePref(t)}><X size={13} /></button>
                  </div>
                ))}
            </div>
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn" onClick={() => { setShowPrefModal(false); fetchRecommendations(); }}>Apply</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default App;
