const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — see .env.example');
}

const useSSL = !/localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS generated_content (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      item JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getProgress() {
  const res = await pool.query('SELECT data FROM progress WHERE id = 1');
  return res.rows[0] ? res.rows[0].data : {};
}

async function setProgress(data) {
  await pool.query(
    `INSERT INTO progress (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
    [data]
  );
}

async function getGeneratedContent() {
  const res = await pool.query(
    'SELECT category, item FROM generated_content ORDER BY created_at ASC'
  );
  const out = {};
  for (const row of res.rows) {
    if (!out[row.category]) out[row.category] = [];
    out[row.category].push(row.item);
  }
  return out;
}

async function appendGeneratedItems(category, items) {
  for (const item of items) {
    await pool.query(
      'INSERT INTO generated_content (category, item) VALUES ($1, $2::jsonb)',
      [category, JSON.stringify(item)]
    );
  }
}

module.exports = {
  pool,
  init,
  getProgress,
  setProgress,
  getGeneratedContent,
  appendGeneratedItems,
};
