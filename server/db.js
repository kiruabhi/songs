const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initSchema() {
  const client = await pool.connect();
  try {
    // Users Table
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )`);

    // Liked Songs Table
    await client.query(`CREATE TABLE IF NOT EXISTS liked_songs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      song_id TEXT NOT NULL,
      title TEXT,
      thumbnail TEXT,
      author TEXT,
      duration TEXT,
      seconds INTEGER,
      UNIQUE(user_id, song_id),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // User Preferences Table (JSON arrays)
    await client.query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      preferences_json TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Seed default admin user if no users exist
    const { rows } = await client.query('SELECT COUNT(*) AS count FROM users');
    if (parseInt(rows[0].count) === 0) {
      await client.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        ['admin', 'admin123', 'admin']
      );
      console.log('✅ Default admin user created: admin / admin123');
    }

    console.log('✅ Neon DB schema initialized.');
  } catch (err) {
    console.error('Schema init error:', err);
  } finally {
    client.release();
  }
}

// Wrapper: return multiple rows
const dbQuery = async (query, params = []) => {
  // Convert ? placeholders (SQLite-style) to $1, $2 (Postgres-style)
  let idx = 0;
  const pgQuery = query.replace(/\?/g, () => `$${++idx}`);
  const { rows } = await pool.query(pgQuery, params);
  return rows;
};

// Wrapper: run INSERT/UPDATE/DELETE, return last inserted info
const dbRun = async (query, params = []) => {
  let idx = 0;
  let pgQuery = query.replace(/\?/g, () => `$${++idx}`);
  // For INSERT, append RETURNING id so we can mimic SQLite's lastID
  if (/^INSERT/i.test(pgQuery.trim()) && !/RETURNING/i.test(pgQuery)) {
    pgQuery += ' RETURNING id';
  }
  const result = await pool.query(pgQuery, params);
  return { lastID: result.rows?.[0]?.id, changes: result.rowCount };
};

// Wrapper: return a single row
const dbGet = async (query, params = []) => {
  let idx = 0;
  const pgQuery = query.replace(/\?/g, () => `$${++idx}`);
  const { rows } = await pool.query(pgQuery, params);
  return rows[0] || null;
};

// Initialize schema on startup
initSchema();

module.exports = { pool, dbQuery, dbRun, dbGet };
