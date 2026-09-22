// Uses Node's built-in SQLite module (node:sqlite) — no external dependency needed.
// Requires Node.js 22.5+.
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "matrank.db");
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS fighters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 500,
    belt TEXT NOT NULL DEFAULT 'white',
    weight TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    gym TEXT DEFAULT '',
    matches_played INTEGER NOT NULL DEFAULT 0,
    streak_current INTEGER NOT NULL DEFAULT 0,
    streak_longest INTEGER NOT NULL DEFAULT 0,
    streak_last_log TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    fighter_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fighter_a_id INTEGER NOT NULL,
    fighter_b_id INTEGER NOT NULL,
    result_a TEXT,
    result_b TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting',
    conflict INTEGER NOT NULL DEFAULT 0,
    winner TEXT,
    method TEXT,
    pre_elo_a INTEGER,
    pre_elo_b INTEGER,
    elo_change_a INTEGER,
    elo_change_b INTEGER,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS likes (
    match_id INTEGER NOT NULL,
    fighter_id INTEGER NOT NULL,
    PRIMARY KEY (match_id, fighter_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    fighter_id INTEGER NOT NULL,
    parent_id INTEGER,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

module.exports = db;
