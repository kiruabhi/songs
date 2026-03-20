# 🎵 Noni Music

A real-time social music listening platform — create Jam rooms and listen to music together, synchronized across all devices.

## Tech Stack
- **Frontend**: React + Vite + TypeScript → Deployed on **Vercel**
- **Backend**: Node.js + Express + Socket.IO → Deployed on **Render.com**
- **Database**: Neon PostgreSQL

---

## 🚀 Deployment Guide

### Step 1: Push to GitHub

```bash
cd songs
git init
git add .
git commit -m "🎵 Noni Music - Initial release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/noni-music.git
git push -u origin main
```

---

### Step 2: Deploy Backend → Render.com

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Set **Root Directory**: `server`
4. **Build Command**: `npm install`
5. **Start Command**: `node index.js`
6. Add **Environment Variables**:
   ```
   DATABASE_URL = <your Neon connection string>
   JWT_SECRET   = noni-music-super-secret-key-2024
   ```
7. Click **Create Web Service**
8. Copy the URL (e.g., `https://noni-music-api.onrender.com`)

---

### Step 3: Deploy Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Set **Root Directory**: `client`
4. **Framework Preset**: Vite
5. Add **Environment Variable**:
   ```
   VITE_API_URL = https://noni-music-api.onrender.com  ← (Render URL from Step 2)
   ```
6. Click **Deploy** 🎉

---

## 🏠 Local Development

### Start Backend
```bash
cd server
npm install
node index.js
```

### Start Frontend
```bash
cd client
npm install
npm run dev -- --host
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3001`

---

## Default Login
| Username | Password | Role  |
|----------|----------|-------|
| admin    | admin123 | admin |

The admin can create new user accounts from the Admin tab inside any Jam room.
