import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Music, Plus, Play, Pause, SkipForward, SkipBack, Copy, Search, Check, Disc, Heart, Repeat, LogOut, Users, Compass, Settings, X } from 'lucide-react';
import './index.css';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

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
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
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
        <LandingPage user={user} onLogout={logout} onCreate={createRoom} onJoin={(id) => { window.history.pushState({}, '', `/${id}`); joinRoom(id); }} />
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
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Spotify Jam Login</h2>
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

function LandingPage({ user, onLogout, onCreate, onJoin }: { user: User, onLogout: () => void, onCreate: () => void, onJoin: (id: string) => void }) {
  const [joinId, setJoinId] = useState('');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass animate-slide-up" style={{ padding: '40px', maxWidth: '400px', width: '100%', textAlign: 'center', position: 'relative' }}>
        
        <button className="btn secondary" onClick={onLogout} style={{ position: 'absolute', top: '15px', right: '15px', padding: '8px' }}>
          <LogOut size={16} />
        </button>

        <div style={{ background: 'rgba(29, 185, 84, 0.2)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent)' }}>
          <Music size={40} />
        </div>
        <h1 style={{ marginBottom: '5px', fontSize: '2rem' }}>Spotify Jam</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '0.9rem' }}>Welcome, <span style={{color: '#fff', fontWeight: 'bold'}}>{user.username}</span>!</p>

        <button className="btn" onClick={onCreate} style={{ width: '100%', marginBottom: '20px' }}>
          Start a new Jam
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (joinId) onJoin(joinId); }} style={{ display: 'flex', gap: '10px' }}>
          <input className="input" placeholder="Room ID" value={joinId} onChange={e => setJoinId(e.target.value)} />
          <button type="submit" className="btn secondary">Join</button>
        </form>
      </div>
    </div>
  );
}

function Room({ roomId, socket, user, token, onLogout }: { roomId: string, socket: Socket, user: User, token: string, onLogout: () => void }) {
  const [state, setState] = useState<RoomState>({ hostId: 0, activeUsers: [], queue: [], history: [], currentSong: null, isPlaying: false, isLooping: false, currentTime: 0 });
  const [activeTab, setActiveTab] = useState<'room' | 'liked' | 'admin' | 'recommend'>('room');
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [audio] = useState(new Audio());
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncTime, setSyncTime] = useState(0);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [newPref, setNewPref] = useState('');

  const localPauseRef = useRef(false);
  const [isLocallyPaused, setIsLocallyPaused] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminMsg, setAdminMsg] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);

  const isHostOrAdmin = state.hostId === user.id || user.role === 'admin';

  useEffect(() => {
    // Fetch Liked Songs securely
    fetch(`${BACKEND_URL}/api/likes`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setLikedSongs(data); })
      .catch(()=>{});

    // Fetch Discover Preferences
    fetch(`${BACKEND_URL}/api/preferences`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPreferences(data); })
      .catch(()=>{});
  }, [token]);

  const fetchRecommendations = async (overrideQuery?: string) => {
    if (!token) return;
    setLoadingRecommendations(true);
    try {
      const url = new URL(`${BACKEND_URL}/api/recommendations`);
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
        if (newState.currentSong?.id !== prevState.currentSong?.id) {
          if (newState.currentSong) {
            audio.src = `${BACKEND_URL}/api/stream/${newState.currentSong.id}`;
            audio.onloadedmetadata = () => {
              if (Math.abs(audio.currentTime - newState.currentTime) > 1) {
                audio.currentTime = newState.currentTime;
              }
            };
            if (newState.isPlaying && !localPauseRef.current) {
              audio.play().catch(() => {});
            }
          } else {
            audio.pause();
            audio.removeAttribute('src');
          }
        } else if (newState.isPlaying && audio.paused && audio.src && !localPauseRef.current) {
          audio.play().catch(() => {});
        } else if (!newState.isPlaying && !audio.paused) {
          audio.pause();
        }
        return newState;
      });
    });

    socket.on('sync_player', ({ isPlaying, currentTime }: { isPlaying: boolean, currentTime: number }) => {
      if (!localPauseRef.current && audio.readyState > 0 && Math.abs(audio.currentTime - currentTime) > 2) {
        audio.currentTime = currentTime;
      }
      if (isPlaying && audio.paused && audio.src && audio.readyState > 0 && !localPauseRef.current) {
        audio.play().catch(() => {});
      }
      if (!isPlaying && !audio.paused) {
        audio.pause();
      }
      setState(s => ({ ...s, isPlaying, currentTime }));
    });

    const interval = setInterval(() => {
      if (!audio.paused) {
        setSyncTime(audio.currentTime);
      }
    }, 1000);

    // Host continuously blasts its time directly to the server to snap guests back into reality
    const hostInterval = setInterval(() => {
      // Must use functional closure or track manually to avoid stale state
      // Actually, relying on exact audio.currentTime is best:
      if (!audio.paused) {
        socket.emit('host_sync', { currentTime: audio.currentTime });
      }
    }, 4000);

    const onEnded = () => socket.emit('auto_skip');
    const onError = () => {
      socket.emit('error_skip');
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      socket.off('room_state');
      socket.off('sync_player');
      clearInterval(interval);
      clearInterval(hostInterval);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, [socket, audio]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setSearching(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch(err) {}
    setSearching(false);
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
      socket.emit('play_pause', { isPlaying: nextState, currentTime: audio.currentTime });
    } else {
      localPauseRef.current = !localPauseRef.current;
      setIsLocallyPaused(localPauseRef.current);
      if (localPauseRef.current) {
        audio.pause();
      } else {
        if (state.isPlaying && audio.src) {
          audio.currentTime = syncTime; // Snap accurate time instantly on unpause
          audio.play().catch(()=>{});
        }
      }
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
  const toggleLoop = () => { if(isHostOrAdmin) socket.emit('loop_toggle') };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setSyncTime(time);
    audio.currentTime = time;
    socket.emit('seek', { currentTime: time });
  };

  const isCurrentLiked = state.currentSong && likedSongs.some(s => s.id === state.currentSong!.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* HEADER */}
      <header className="glass" style={{ margin: '20px', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Music color="var(--accent)" />
            <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700 }}>Noni Music</h2>
            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>#{roomId}</span>
          </div>

          <div 
            style={{ display: 'flex', gap: '5px', marginLeft: '10px', overflowX: 'auto', paddingBottom: '2px', cursor: 'pointer' }}
            onClick={() => setShowParticipants(true)}
          >
            {state.activeUsers?.map((u, i) => (
              <div key={i} title={u.username + (u.id === state.hostId ? ' (Host)' : ' (Guest)')} style={{ width: '32px', height: '32px', borderRadius: '50%', background: u.id === state.hostId ? 'var(--accent)' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', color: u.id === state.hostId ? '#000' : '#fff', border: '2px solid var(--bg)', zIndex: 10 - i, marginLeft: i > 0 ? '-10px' : '0' }}>
                {u.username.substring(0, 1).toUpperCase()}
              </div>
            ))}
          </div>

          <div className="nav-links" style={{ display: 'flex', gap: '10px', marginLeft: '20px' }}>
            <button className={`btn secondary ${activeTab === 'room' ? 'active-tab' : ''}`} onClick={() => setActiveTab('room')} style={{ padding: '8px 16px', border: activeTab === 'room' ? '1px solid var(--accent)' : '1px solid transparent' }}>
              <Search size={16} /> <span>Search & Queue</span>
            </button>
            <button className={`btn secondary ${activeTab === 'recommend' ? 'active-tab' : ''}`} onClick={() => setActiveTab('recommend')} style={{ padding: '8px 16px', border: activeTab === 'recommend' ? '1px solid var(--accent)' : '1px solid transparent' }}>
              <Compass size={16} /> <span>Discover</span>
            </button>
            <button className={`btn secondary ${activeTab === 'liked' ? 'active-tab' : ''}`} onClick={() => setActiveTab('liked')} style={{ padding: '8px 16px', border: activeTab === 'liked' ? '1px solid var(--accent)' : '1px solid transparent' }}>
              <Heart size={16} fill={activeTab === 'liked' ? 'var(--accent)' : 'none'} color={activeTab === 'liked' ? 'var(--accent)' : '#fff'} /> <span>Liked Songs</span>
            </button>
            {user.role === 'admin' && (
              <button className={`btn secondary ${activeTab === 'admin' ? 'active-tab' : ''}`} onClick={() => setActiveTab('admin')} style={{ padding: '8px 16px', border: activeTab === 'admin' ? '1px solid var(--accent)' : '1px solid transparent' }}>
                <Users size={16} /> <span>Admin</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn secondary" onClick={copyLink} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            {copied ? <Check size={16} /> : <Copy size={16} />} 
          </button>
          <button className="btn secondary" onClick={onLogout} style={{ padding: '8px 16px', fontSize: '0.9rem', color: '#ff4444' }}>
            <LogOut size={16} /> 
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', gap: '20px', padding: '0 20px', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
          
          <div className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            
            {activeTab === 'room' && (
              <>
                <form onSubmit={search} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <input className="input" placeholder="Search songs on YouTube..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  <button className="btn" type="submit" disabled={searching}><Search size={20} /></button>
                </form>

                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                  {searchResults.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Results (Click to play instantly)</h3>
                      {searchResults.map((song) => (
                        <div key={song.id} className="search-row" onClick={() => instantPlay(song)} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background 0.2s', border: '1px solid transparent' }}>
                          <img src={song.thumbnail} alt={song.title} style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px' }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.title}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{song.author} • {song.duration}</div>
                          </div>
                          <button className="btn secondary" onClick={(e) => { e.stopPropagation(); toggleLike(song); }} style={{ padding: '8px', border: 'none', background: 'transparent' }}>
                            <Heart size={20} fill={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'none'} color={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : '#fff'} />
                          </button>
                          <button className="btn" style={{ padding: '8px', borderRadius: '50%' }} onClick={(e) => addSong(song, e)} title="Add to Queue">
                            <Plus size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Up Next</h3>
                      {state.queue.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '0.9rem' }}>Queue is empty.</div>
                      ) : (
                        state.queue.map((song, i) => (
                          <div key={song.queueId} onClick={() => instantPlay(song)} className="search-row animate-slide-up" style={{ animationDelay: `${i * 0.05}s`, display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                            <img src={song.thumbnail} alt={song.title} style={{ width: '40px', height: '30px', objectFit: 'cover', borderRadius: '4px', opacity: 0.8 }} />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.title}</div>
                              {song.addedBy && <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: '2px' }}>Added by {song.addedBy}</div>}
                            </div>
                            <button className="btn secondary" onClick={(e) => { e.stopPropagation(); toggleLike(song); }} style={{ padding: '4px', border: 'none', background: 'transparent' }}>
                              <Heart size={16} fill={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'none'} color={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : '#fff'} style={{ opacity: 0.5 }} />
                            </button>
                            <Play size={16} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'recommend' && (
              <div className="tab-content animate-slide-up">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                  <h2 style={{ margin: 0 }}>Discover New Music</h2>
                  <button className="btn secondary" onClick={() => setShowPrefModal(true)} style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    <Settings size={14} /> Tune Algorithm
                  </button>
                </div>
                
                <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.9rem' }}>Personalized recommendations based on your liked songs and library trends.</p>
                
                <form onSubmit={e => { e.preventDefault(); fetchRecommendations(discoverQuery); }} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  <input className="input" placeholder="Search a mood, artist, or genre..." value={discoverQuery} onChange={e => setDiscoverQuery(e.target.value)} />
                  <button className="btn" type="submit" disabled={loadingRecommendations}><Search size={20} /></button>
                </form>

                {loadingRecommendations ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div className="loader"></div></div>
                ) : recommendations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No recommendations found right now.
                  </div>
                ) : (
                  <div className="search-results">
                    {recommendations.map((song, i) => (
                      <div key={song.id} className="search-result animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }} onClick={() => instantPlay(song)}>
                        <img src={song.thumbnail} alt={song.title} />
                        <div className="info">
                          <div className="title">{song.title}</div>
                          <div className="author">{song.author}</div>
                        </div>
                        <button className="btn secondary" onClick={(e) => { e.stopPropagation(); toggleLike(song); }} style={{ padding: '8px', border: 'none', background: 'transparent' }}>
                          <Heart size={20} fill={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : 'none'} color={likedSongs.some(s => s.id === song.id) ? 'var(--accent)' : '#fff'} />
                        </button>
                        <button className="btn icon" onClick={(e) => { e.stopPropagation(); addSong(song, e); }}>
                          <Plus size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'liked' && (
              <>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px' }}>Your Liked Songs</h3>
                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                  {likedSongs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px', fontSize: '0.9rem' }}>You haven't liked any songs yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {likedSongs.map((song) => (
                        <div key={song.id} className="search-row" onClick={() => instantPlay(song)} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background 0.2s', border: '1px solid transparent' }}>
                          <img src={song.thumbnail} alt={song.title} style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px' }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.title}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{song.author} • {song.duration}</div>
                          </div>
                          <Heart size={20} fill="var(--accent)" color="var(--accent)" onClick={(e) => { e.stopPropagation(); toggleLike(song) }} />
                          <button className="btn" style={{ padding: '8px', borderRadius: '50%', marginLeft: '10px' }} onClick={(e) => addSong(song, e)} title="Add to Queue">
                            <Plus size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'admin' && user.role === 'admin' && (
              <div style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '20px' }}>Admin Dashboard: Invite Friends</h3>
                <form onSubmit={createAdminUser} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <input className="input" placeholder="New Friend Username" required value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                  <input className="input" type="password" placeholder="New Password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <button type="submit" className="btn">Create Account</button>
                  {adminMsg && <div style={{ color: 'var(--accent)', textAlign: 'center', fontWeight: 'bold' }}>{adminMsg}</div>}
                </form>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* PLAYER PANEL - Compact controls-only mini bar */}
      <div className="glass player-panel" style={{ margin: '20px', padding: '12px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(20, 20, 25, 0.9)', flexWrap: 'nowrap' }}>
        {state.currentSong ? (
          <>
            {/* Thumbnail — tap to open full-screen player */}
            <img 
              src={state.currentSong.thumbnail} 
              alt="cover" 
              style={{ width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} 
              onClick={() => setShowFullPlayer(true)}
              title="Expand player"
            />

            {/* Controls — centered, flex:1 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={previous} disabled={state.history.length === 0} style={{ background: 'transparent', border: 'none', color: state.history.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}>
                  <SkipBack size={22} />
                </button>
                <button onClick={togglePlay} style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(29,185,84,0.4)', flexShrink: 0 }}>
                  {(isHostOrAdmin ? state.isPlaying : (!isLocallyPaused && state.isPlaying)) ? <Pause size={20} fill="#fff" /> : <Play size={20} fill="#fff" style={{ marginLeft: '2px' }} />}
                </button>
                <button onClick={skip} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}>
                  <SkipForward size={22} />
                </button>
              </div>

              {/* Seek bar */}
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span style={{ flexShrink: 0 }}>{formatTime(syncTime)}</span>
                <input type="range" min="0" max={state.currentSong.seconds || 0} value={syncTime} onChange={seek} className="seek-slider" style={{ flex: 1, minWidth: 0 }} />
                <span style={{ flexShrink: 0 }}>{state.currentSong.duration}</span>
              </div>
            </div>

            {/* Right side extras — hidden on mobile via CSS */}
            <div className="player-extras" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <button onClick={toggleLoop} disabled={!isHostOrAdmin} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', opacity: state.isLooping ? 1 : 0.4, color: state.isLooping ? 'var(--accent)' : '#fff', display: 'flex' }}>
                <Repeat size={18} />
              </button>
              <Heart size={18} style={{ cursor: 'pointer' }} fill={isCurrentLiked ? "var(--accent)" : "none"} color={isCurrentLiked ? "var(--accent)" : "var(--text-muted)"} onClick={() => toggleLike(state.currentSong)} />
              {isHostOrAdmin ? <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '1px' }}>HOST</span> : <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>GUEST</span>}
            </div>
          </>
        ) : (
          <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '10px' }}>
            <Disc size={22} style={{ animation: 'spin 4s linear infinite' }} />
            No song playing right now
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM NAV - always visible on small screens */}
      <div className="mobile-bottom-nav" style={{ display: 'none' }}>
        <button className={activeTab === 'room' ? 'active' : ''} onClick={() => setActiveTab('room')}>
          <Search size={22} />
          <span>Search</span>
        </button>
        <button className={activeTab === 'recommend' ? 'active' : ''} onClick={() => setActiveTab('recommend')}>
          <Compass size={22} />
          <span>Discover</span>
        </button>
        <button className={activeTab === 'liked' ? 'active' : ''} onClick={() => setActiveTab('liked')}>
          <Heart size={22} fill={activeTab === 'liked' ? 'var(--accent)' : 'none'} color={activeTab === 'liked' ? 'var(--accent)' : '#fff'} />
          <span>Liked</span>
        </button>
        {user.role === 'admin' && (
          <button className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>
            <Users size={22} />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* FULL SCREEN NOW PLAYING */}
      {showFullPlayer && state.currentSong && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(180deg, #1a0533 0%, #0d1b2a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 20px 40px', overflowY: 'auto' }} className="animate-slide-up">
          {/* Header */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <button style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px' }} onClick={() => setShowFullPlayer(false)}>
              <X size={28} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px' }}>Now Playing</div>
            </div>
            <div style={{ width: '44px' }} />{/* spacer */}
          </div>

          {/* Album Art */}
          <div style={{ position: 'relative', marginBottom: '40px' }}>
            <div style={{ width: '280px', height: '280px', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={state.currentSong.thumbnail} alt={state.currentSong.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: state.isPlaying ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.5s ease' }} />
            </div>
            {state.isPlaying && (
              <div style={{ position: 'absolute', inset: '-3px', borderRadius: '23px', border: '2px solid var(--accent)', opacity: 0.5, animation: 'pulse 2s ease-in-out infinite' }} />
            )}
          </div>

          {/* Song Info */}
          <div style={{ textAlign: 'center', marginBottom: '30px', width: '100%', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>{state.currentSong.title}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{state.currentSong.author}</p>
            {state.currentSong.addedBy && (
              <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '5px', opacity: 0.8 }}>♫ Added by {state.currentSong.addedBy}</p>
            )}
          </div>

          {/* Like + Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '25px' }}>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px' }} onClick={() => toggleLike(state.currentSong!)}>
              <Heart size={26} fill={likedSongs.some(s => s.id === state.currentSong?.id) ? 'var(--accent)' : 'none'} color={likedSongs.some(s => s.id === state.currentSong?.id) ? 'var(--accent)' : '#fff'} />
            </button>
          </div>

          {/* Seek Bar */}
          <div style={{ width: '100%', maxWidth: '400px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <span>{formatTime(syncTime)}</span>
              <span>{state.currentSong.duration}</span>
            </div>
            <input type="range" min="0" max={state.currentSong.seconds || 0} value={syncTime} onChange={seek} className="seek-slider" style={{ width: '100%' }} />
          </div>

          {/* Main Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
            <button style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px' }} onClick={() => socket.emit('prev_song', { roomId })}>
              <SkipBack size={32} />
            </button>
            <button style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(29,185,84,0.5)', transition: 'transform 0.1s' }} onClick={togglePlay}>
              {(isHostOrAdmin ? state.isPlaying : (!isLocallyPaused && state.isPlaying)) ? <Pause size={32} fill="#fff" /> : <Play size={32} fill="#fff" style={{ marginLeft: '4px' }} />}
            </button>
            <button style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px' }} onClick={skip}>
              <SkipForward size={32} />
            </button>
          </div>
        </div>
      )}

      {showParticipants && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowParticipants(false)}>
          <div className="glass animate-slide-up" style={{ padding: '30px', width: '90%', maxWidth: '400px', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><Users size={20} color="var(--accent)" /> Room Participants</h3>
              <button className="btn secondary" onClick={() => setShowParticipants(false)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Close</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '10px' }}>
              {state.activeUsers?.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: u.id === state.hostId ? 'var(--accent)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: u.id === state.hostId ? '#000' : '#fff' }}>
                      {u.username.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{u.username} {u.id === user.id ? '(You)' : ''}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>ID: {u.id}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '12px', background: u.id === state.hostId ? 'rgba(29, 185, 84, 0.2)' : 'rgba(255,255,255,0.1)', color: u.id === state.hostId ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {u.id === state.hostId ? 'Host' : 'Guest'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PREFERENCES MODAL */}
      {showPrefModal && (
        <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass modal-content animate-slide-up" style={{ width: '400px', maxWidth: '95%', padding: '25px', borderRadius: '16px', position: 'relative' }}>
            <button className="btn secondary icon" onClick={() => setShowPrefModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', padding: '5px', border: 'none' }}>
              <X size={20} />
            </button>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}><Settings size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Algorithm Tuning</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px' }}>Add specific artists, genres, or moods to tightly focus your Discover feed.</p>
            
            <form onSubmit={addPref} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input className="input" placeholder="e.g. Synthwave" value={newPref} onChange={e => setNewPref(e.target.value)} style={{ flex: 1 }} />
              <button type="submit" className="btn secondary">Add</button>
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
              {preferences.length === 0 ? (
                 <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No overriding tags defined.</span>
              ) : preferences.map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.1)', padding: '5px 10px', borderRadius: '20px', fontSize: '0.85rem' }}>
                  {t}
                  <X size={14} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => removePref(t)} />
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn" onClick={() => { setShowPrefModal(false); fetchRecommendations(); }}>Compile Matrix</button>
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
