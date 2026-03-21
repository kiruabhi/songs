# Noni Jam - Music Streaming App

A modern, high-quality music streaming application built with React, Express, and PostgreSQL.

## Features
- **Real-time Jam Rooms**: Join rooms and listen to music together with friends.
- **High-Quality Audio**: Streams high-fidelity audio directly from YouTube CDN.
- **Discover**: Personalized recommendations based on your liked songs.
- **PostgreSQL Persistence**: Using Neon DB for robust data management.

## Tech Stack
- **Frontend**: React, Vite, Lucide Icons, Socket.io-client.
- **Backend**: Node.js, Express, Socket.io, PostgreSQL (pg).
- **Database**: Neon DB (PostgreSQL).
- **Deployment**: Render (Server & Client).

## Getting Started

### Local Development
1. Clone the repository.
2. In the `server` directory, create a `.env` file with your `DATABASE_URL` and `JWT_SECRET`.
3. Run `npm install` in both `client` and `server` directories.
4. Start the server with `npm start` in the `server` folder.
5. Start the client with `npm run dev` in the `client` folder.

### Deployment
This project is ready for one-click deployment on Render. Use the `render.yaml` file in the root to set up your blueprint.
