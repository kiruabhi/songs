const { Pool } = require("pg");

// Connect to PostgreSQL database using Neon DB connection string from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
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

    // Migrate: Rename password_hash to password if it exists from previous version
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN
          ALTER TABLE users RENAME COLUMN password_hash TO password;
        END IF;
      END $$;
    `);

    // Users Table (Plain text password as requested)
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
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
      await client.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        ["admin", "admin123", "admin"]
      );
      console.log("Default admin account created (admin / admin123)");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error initializing schema:", err);
    console.log("TIP: If you changed columns, you might need to drop the tables in your Neon console first.");
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
