const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

// Connect to PostgreSQL database using Neon DB connection string from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon DB/Render
  }
});

// Test connection and initialize schema
pool.connect((err, client, release) => {
  if (err) {
    console.error("Database connection failed:", err.stack);
  } else {
    console.log("Connected to PostgreSQL (Neon DB).");
    release();
    initSchema();
  }
});

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Users Table
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )`);

    // Liked Songs Table
    await client.query(`CREATE TABLE IF NOT EXISTS liked_songs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      song_id TEXT NOT NULL,
      title TEXT,
      thumbnail TEXT,
      author TEXT,
      duration TEXT,
      seconds INTEGER,
      UNIQUE(user_id, song_id)
    )`);

    // User Preferences Table
    await client.query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      preferences_json TEXT NOT NULL
    )`);

    // Create default admin user if no users exist
    const res = await client.query("SELECT COUNT(*) AS count FROM users");
    if (parseInt(res.rows[0].count) === 0) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync("admin123", salt);
      await client.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
        ["admin", hash, "admin"]
      );
      console.log("Default admin account created (admin / admin123)");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error initializing schema:", err);
  } finally {
    client.release();
  }
}

// Wrapper for promises to easily use async/await
const dbQuery = async (query, params = []) => {
  const res = await pool.query(query, params);
  return res.rows;
};

const dbRun = async (query, params = []) => {
  const res = await pool.query(query, params);
  return { lastID: res.insertId, changes: res.rowCount }; // PostgreSQL doesn't have lastID in the same way, but it's okay for now
};

const dbGet = async (query, params = []) => {
  const res = await pool.query(query, params);
  return res.rows[0];
};

module.exports = { db: pool, dbQuery, dbRun, dbGet };
