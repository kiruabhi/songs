require("dotenv").config();
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");
const ytSearch = require("yt-search");
const ytDlpExec = require("yt-dlp-exec");
const jwt = require("jsonwebtoken");
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dbGet, dbRun, dbQuery } = require("./db");

// --- GLOBAL CRASH PREVENTION ---
// Prevent 'play-dl' or other unhandled promises from crashing the entire server
process.on('uncaughtException', (err) => {
  console.error("CRITICAL: Uncaught Exception:", err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error("CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
});


// --- PLAY-DL COOKIES (Optional but recommended) ---
const playdl = require("play-dl");
if (process.env.YOUTUBE_COOKIE) {
  try {
    playdl.setToken({ youtube: { cookie: process.env.YOUTUBE_COOKIE } });
    console.log("YouTube cookie set for play-dl.");
  } catch (e) { console.error("Error setting play-dl token:", e); }
}

const app = express();
app.use(cors());
app.use(express.json()); // for parsed JSON bodies


const JWT_SECRET = process.env.JWT_SECRET || "jam-secret-key-super-secure";

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // allow front-end to connect
    methods: ["GET", "POST"]
  }
});

// --- INTERNAL STATE ---
let rooms = {};
const ROOMS_BACKUP_PATH = process.env.ROOMS_BACKUP_PATH || require('path').resolve(__dirname, 'rooms_backup.json');

// Boot sequence: Restore RAM explicitly from the persistent crash-safe file
if (fs.existsSync(ROOMS_BACKUP_PATH)) {
  try {
    const data = fs.readFileSync(ROOMS_BACKUP_PATH, 'utf-8');
    rooms = JSON.parse(data);
    console.log(`✅ Revived ${Object.keys(rooms).length} Jam Rooms from crash-backup storage!`);
  } catch (e) { console.error('Failed to parse backup', e); }
}

const getRoom = (roomId) => {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      hostId: null,
      activeUsers: [],
      queue: [],
      history: [],
      currentSong: null,
      isPlaying: false,
      isLooping: false,
      currentTime: 0,
      lastUpdateTime: Date.now(),
      lastSkipTime: 0
    };
    saveRoomsToDisk();
  }
  return rooms[roomId];
};

const saveRoomsToDisk = () => {
  fs.writeFile(ROOMS_BACKUP_PATH, JSON.stringify(rooms), err => {
    if (err) console.error("Snapshot error:", err);
  });
};

const emitRoomState = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;
  saveRoomsToDisk();
  io.to(roomId).emit("room_state", room);
};

const searchYoutube = async (query) => {
  const result = await ytSearch(query);
  return (result.videos || [])
    .slice(0, 20)
    .map(v => ({
      id: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      author: v.author?.name || "Unknown Artist",
      duration: v.timestamp,
      seconds: v.seconds || 0
    }));
};

const YOUTUBE_REQUEST_HEADERS = [
  "referer:youtube.com",
  "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
];

const YOUTUBE_COOKIE_FILE_PATH = process.env.YOUTUBE_COOKIE_FILE_PATH || path.join(os.tmpdir(), 'noni-youtube-cookies.txt');

const resolveYoutubeCookiesFile = () => {
  if (process.env.YOUTUBE_COOKIE_FILE && fs.existsSync(process.env.YOUTUBE_COOKIE_FILE)) {
    return process.env.YOUTUBE_COOKIE_FILE;
  }

  let cookieText = process.env.YOUTUBE_COOKIES || process.env.YOUTUBE_COOKIES_TXT || '';
  if (!cookieText && process.env.YOUTUBE_COOKIES_B64) {
    try {
      cookieText = Buffer.from(process.env.YOUTUBE_COOKIES_B64, 'base64').toString('utf8');
    } catch (error) {
      console.error('Failed to decode YOUTUBE_COOKIES_B64:', error);
      return '';
    }
  }

  if (!cookieText.trim()) {
    return '';
  }

  try {
    if (!fs.existsSync(YOUTUBE_COOKIE_FILE_PATH) || fs.readFileSync(YOUTUBE_COOKIE_FILE_PATH, 'utf8') !== cookieText) {
      fs.writeFileSync(YOUTUBE_COOKIE_FILE_PATH, cookieText, 'utf8');
    }
    return YOUTUBE_COOKIE_FILE_PATH;
  } catch (error) {
    console.error('Failed to prepare YouTube cookies file:', error);
    return '';
  }
};

const buildYoutubeExtractorArgs = () => {
  const parts = ['player_client=android,web'];
  const poToken = (process.env.YOUTUBE_PO_TOKEN || '').trim();
  const visitorData = (process.env.YOUTUBE_VISITOR_DATA || '').trim();

  if (poToken) {
    parts.push(`po_token=web+${poToken}`);
  }

  if (visitorData) {
    parts.push('player_skip=webpage,configs');
    parts.push(`visitor_data=${visitorData}`);
  }

  return `youtube:${parts.join(';')}`;
};

const extractAudioUrl = (videoId) => new Promise(async (resolve, reject) => {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const ytDlpOptions = {
      format: "bestaudio[ext=m4a]/bestaudio",
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      extractorArgs: buildYoutubeExtractorArgs(),
      addHeader: YOUTUBE_REQUEST_HEADERS
    };

    const cookiesFile = resolveYoutubeCookiesFile();
    if (cookiesFile) {
      ytDlpOptions.cookies = cookiesFile;
    }

    const info = await ytDlpExec(videoUrl, ytDlpOptions);
    const requestedDownloads = Array.isArray(info.requested_downloads) ? info.requested_downloads : [];
    const formats = Array.isArray(info.formats) ? info.formats : [];
    const bestAudio =
      requestedDownloads.find(f => f?.url) ||
      formats.find(f => f.acodec !== "none" && f.vcodec === "none" && f.ext === "m4a" && f.url) ||
      formats.find(f => f.acodec !== "none" && f.vcodec === "none" && f.url) ||
      formats.find(f => f.acodec !== "none" && f.url);

    if (!bestAudio?.url) {
      reject(new Error("No playable audio format found"));
      return;
    }

    resolve({
      url: bestAudio.url,
      mimeType: bestAudio.mimeType || bestAudio.ext || "audio/mp4",
      formatId: bestAudio.format_id || null,
      headers: bestAudio.http_headers || info.http_headers || {}
    });
  } catch (error) {
    const message = error?.stderr || error?.message || "yt-dlp execution failed";
    reject(new Error(message));
  }
});


// --- API ROUTES ---
app.get("/", (req, res) => {
  res.send(`<h1>Noni Jam API v3 - TEST ${Date.now()} 🎵</h1><p>If you see this, the server is fresh.</p>`);
});

// Resolve Direct Native Audio Stream
app.get("/api/stream-url/:videoId", async (req, res) => {
  try {
    const videoId = req.params.videoId;
    if (!videoId) return res.status(400).json({ error: "Missing videoId" });

    console.log(`Resolving stream URL for: ${videoId}`);
    const stream = await extractAudioUrl(videoId);
    if (stream && stream.url) {
      console.log(`Success: Found stream URL for ${videoId}`);
      res.json({
        url: stream.url,
        mimeType: stream.mimeType,
        formatId: stream.formatId,
        headers: stream.headers || {}
      });
    } else {
      console.log(`No stream URL found for ${videoId}.`);
      res.status(404).json({ error: "No stream found for this video." });
    }
  } catch (err) {
    console.error("Stream resolution error:", err);
    res.status(500).json({ error: "Failed to resolve stream URL: " + err.message });
  }
});

const handleSearchRequest = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) return res.status(400).json({ error: "No query provided" });
    const videos = await searchYoutube(query);
    res.json(videos);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Failed to fetch songs" });
  }
};

// Search YouTube
app.get("/api/search", handleSearchRequest);
app.get("/api/find", handleSearchRequest);

// Authentication Routes
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });

  try {
    const user = await dbGet("SELECT * FROM users WHERE username = $1", [username]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isValid = (password === user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    const payload = { id: user.id, username: user.username, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: payload });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin Route to register new users
app.post("/api/admin/users", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admins only" });

    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    await dbRun("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", [username, password, role || 'user']);
    res.json({ message: "User created successfully" });
  } catch (err) {
    res.status(500).json({ error: "Could not create user (username may already exist)" });
  }
});

// Liked Songs Routes
app.get("/api/likes", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const likes = await dbQuery("SELECT song_id as id, title, thumbnail, author, duration, seconds FROM liked_songs WHERE user_id = $1", [decoded.id]);
    res.json(likes || []);
  } catch (err) {
    console.error("GET /api/likes error:", err.message);
    res.json([]); // Prevents 500 error for frontend
  }
});

// Get User Preferences
app.get("/api/preferences", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const prefRow = await dbGet("SELECT preferences_json FROM user_preferences WHERE user_id = $1", [decoded.id]);
    res.json(prefRow ? JSON.parse(prefRow.preferences_json) : []);
  } catch (err) {
    console.error("GET /api/preferences error:", err.message);
    res.json([]); // Prevents 500
  }
});

// Update User Preferences
app.post("/api/preferences", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { tags } = req.body;
    await dbRun("INSERT INTO user_preferences (user_id, preferences_json) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET preferences_json = EXCLUDED.preferences_json", [decoded.id, JSON.stringify(tags || [])]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/likes", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { id, title, thumbnail, author, duration, seconds } = req.body;
    await dbRun("INSERT INTO liked_songs (user_id, song_id, title, thumbnail, author, duration, seconds) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [decoded.id, id, title, thumbnail, author, duration, seconds]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Already liked or Server error" });
  }
});

app.delete("/api/likes/:songId", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    await dbRun("DELETE FROM liked_songs WHERE user_id = $1 AND song_id = $2", [decoded.id, req.params.songId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Recommendations Engine
app.get("/api/recommendations", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const customQuery = req.query.q;
    let query = "trending music hits playlist";

    if (customQuery) {
      query = customQuery + " top songs";
    } else {
      const likes = await dbQuery("SELECT author FROM liked_songs WHERE user_id = $1", [decoded.id]);
      const prefRow = await dbGet("SELECT preferences_json FROM user_preferences WHERE user_id = $1", [decoded.id]);
      const prefs = prefRow ? JSON.parse(prefRow.preferences_json) : [];

      let parts = [];
      if (prefs.length > 0) {
        parts.push(prefs[Math.floor(Math.random() * prefs.length)]);
      }
      if (likes.length > 0) {
        const author = (likes[Math.floor(Math.random() * likes.length)].author || "").replace(/\n/g, '').trim();
        if (author) parts.push(author);
      }

      if (parts.length > 0) {
        query = parts.join(" ") + " mix tracks songs";
      }
    }

    const output = await ytSearch(query);
    const videos = output.videos.slice(0, 60).map(v => ({
      id: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      author: v.author.name,
      duration: v.timestamp,
      seconds: v.seconds
    }));

    res.json(videos);
  } catch (err) {
    console.error("Recommendations error:", err.message);
    res.json([]); // Prevents 500 if DB or Search fails
  }
});

app.set('trust proxy', 1); // Trust Render's proxy

// Stream Audio is now entirely handled securely on the frontend via official YouTube IFrame API!
// The backend is purely used for Socket.io synchronization.

// --- SOCKET.IO HANDLERS ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication error"));
    socket.userId = decoded.id;
    socket.username = decoded.username;
    socket.role = decoded.role;
    next();
  });
});

const isHost = (socket, room) => socket.userId === room.hostId || socket.role === 'admin';

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId; // store room locally in socket
    console.log(`Socket ${socket.id} (${socket.username}) joined room ${roomId}`);

    const room = getRoom(roomId);

    // First user to join becomes the permanent host of the room
    if (!room.hostId) {
      room.hostId = socket.userId;
    }

    // Add user to active users list
    if (!room.activeUsers.find(u => u.id === socket.userId)) {
      room.activeUsers.push({ id: socket.userId, username: socket.username, role: socket.role, socketId: socket.id });
    }

    emitRoomState(roomId);
  });

  socket.on("add_song", (song) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);

    // Add unique ID to instance in queue and strictly stamp the attributions
    const songInstance = { ...song, queueId: Date.now().toString() + Math.random().toString(36).substring(7), addedBy: socket.username };

    if (!room.currentSong) {
      room.currentSong = songInstance;
      room.isPlaying = true;
      room.currentTime = 0;
      room.lastUpdateTime = Date.now();
    } else {
      room.queue.push(songInstance);
    }
    emitRoomState(socket.roomId);
  });

  socket.on("play_pause", ({ isPlaying, currentTime }) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);

    // Strict RBAC: Only Host or Admin can toggle play/pause globally
    if (!isHost(socket, room)) return;

    room.isPlaying = isPlaying;
    room.currentTime = currentTime;
    room.lastUpdateTime = Date.now();
    io.to(socket.roomId).emit("sync_player", { isPlaying, currentTime });
    emitRoomState(socket.roomId);
  });

  socket.on("sync_time", ({ currentTime }) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);
    room.currentTime = currentTime;
    room.lastUpdateTime = Date.now();
    // Don't broadcast every time sync to prevent loops, 
    // just store it so new joiners get accurate time
  });

  socket.on("seek", ({ currentTime }) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);

    // Permissions loosely removed: Guests can seek timeline globally
    room.currentTime = currentTime;
    room.lastUpdateTime = Date.now();
    io.to(socket.roomId).emit("sync_player", { isPlaying: room.isPlaying, currentTime });
    emitRoomState(socket.roomId);
  });

  // Keep alive sync from host to enforce strict snapping for guests
  socket.on("host_sync", ({ currentTime }) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);

    // Only accept ground truth time sync from Host
    if (!isHost(socket, room)) return;

    room.currentTime = currentTime;
    room.lastUpdateTime = Date.now();
    // Re-verify that all clients are exactly pinned to the host timeline
    io.to(socket.roomId).emit("sync_player", { isPlaying: room.isPlaying, currentTime });
    emitRoomState(socket.roomId);
  });

  const handleSkip = (roomId, isManual = false) => {
    const room = getRoom(roomId);
    if (!room) return;

    // Prevent multiple auto-skips (from multiple clients) within 3 seconds
    if (!isManual && (Date.now() - room.lastSkipTime < 3000)) return;
    room.lastSkipTime = Date.now();

    if (room.isLooping && room.currentSong && !isManual) {
      room.currentTime = 0;
      room.lastUpdateTime = Date.now();
      room.isPlaying = true;
    } else {
      if (room.currentSong) {
        room.history.push(room.currentSong);
      }

      if (room.queue.length > 0) {
        room.currentSong = room.queue.shift();
        room.currentTime = 0;
        room.lastUpdateTime = Date.now();
        room.isPlaying = true;
      } else {
        room.currentSong = null;
        room.currentTime = 0;
        room.isPlaying = false;
      }
    }
    emitRoomState(roomId);
  };

  socket.on("skip_song", (isManual = true) => {
    if (!socket.roomId) return;

    // Permissions loosely removed: Guests can skip timeline globally
    handleSkip(socket.roomId, isManual);
  });

  socket.on("auto_skip", () => {
    if (!socket.roomId) return;
    handleSkip(socket.roomId, false);
  });

  socket.on("error_skip", () => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);
    // Ignore error skips from guests (the stream might just have hiccuped locally)
    if (!isHost(socket, room)) return;

    console.log(`Error skip triggered in room ${socket.roomId} by Host ${socket.username}`);
    handleSkip(socket.roomId, false);
  });

  socket.on("loop_toggle", () => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);
    if (!isHost(socket, room)) return;
    room.isLooping = !room.isLooping;
    emitRoomState(socket.roomId);
  });

  socket.on("instant_play", (song) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);
    if (room.currentSong) room.history.push(room.currentSong);

    if (song.queueId) {
      room.queue = room.queue.filter(s => s.queueId !== song.queueId);
    }

    // Deep strict attribution tagging across instant jumps, keeping track of queueId
    const songInstance = { ...song, queueId: Date.now().toString() + Math.random().toString(36).substring(7), addedBy: socket.username };
    room.currentSong = songInstance;
    room.currentTime = 0;
    room.lastUpdateTime = Date.now();
    room.isPlaying = true;
    emitRoomState(socket.roomId);
  });

  socket.on("previous_song", () => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);

    if (room.history.length > 0) {
      if (room.currentSong) {
        room.queue.unshift(room.currentSong); // Put current back on queue
      }
      room.currentSong = room.history.pop();
      room.currentTime = 0;
      room.lastUpdateTime = Date.now();
      room.isPlaying = true;
      emitRoomState(socket.roomId);
    }
  });

  socket.on("remove_song", (queueId) => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);
    room.queue = room.queue.filter(s => s.queueId !== queueId);
    emitRoomState(socket.roomId);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.username} (${socket.userId})`);
    if (socket.roomId) {
      const room = getRoom(socket.roomId);
      room.activeUsers = room.activeUsers.filter(u => u.socketId !== socket.id);

      // If host disconnected and others remain, assign new host randomly if desired,
      // or just keep hostId as is so they can reconnect as host.
      // (For robustness, we keep hostId linked to their persistent userId).

      emitRoomState(socket.roomId);
    }
  });
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
