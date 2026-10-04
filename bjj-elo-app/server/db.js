// Uses Node's built-in SQLite module (node:sqlite) — no external dependency needed.
// Requires Node.js 22.5+.
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (process.env.NODE_ENV === 'production' && process.env.RAILWAY_PROJECT_ID && process.env.RAILWAY_VOLUME_MOUNT_PATH !== dataDir) {
  throw new Error('Attach a persistent Railway volume at DATA_DIR before starting Mat Rank.');
}
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "matrank.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS billing_customers (fighter_id INTEGER PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL, checkout_id TEXT, checkout_plan TEXT, accepted_at INTEGER, terms_version TEXT);
CREATE TABLE IF NOT EXISTS billing_subscriptions (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, status TEXT NOT NULL, paid_until INTEGER NOT NULL DEFAULT 0, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, price_id TEXT, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS billing_subscription_customer ON billing_subscriptions(customer_id);
CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS billing_checkout_attempts (fighter_id INTEGER PRIMARY KEY, plan TEXT NOT NULL, attempt_key TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS training_days (fighter_id INTEGER NOT NULL, day TEXT NOT NULL, PRIMARY KEY(fighter_id, day));
CREATE TABLE IF NOT EXISTS journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, fighter_id INTEGER NOT NULL, day TEXT NOT NULL, technique TEXT NOT NULL, notes TEXT NOT NULL, next_focus TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS journal_owner ON journal_entries(fighter_id, day);
CREATE TABLE IF NOT EXISTS training_goals (id INTEGER PRIMARY KEY AUTOINCREMENT, fighter_id INTEGER NOT NULL, title TEXT NOT NULL, target INTEGER NOT NULL, month TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS profile_styles (fighter_id INTEGER PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'gold', banner TEXT NOT NULL DEFAULT 'classic');
`);
if (!db.prepare('PRAGMA table_info(billing_customers)').all().some(c=>c.name==='deleting')) db.exec('ALTER TABLE billing_customers ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0');

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

// Additive migrations preserve existing accounts and match history.
const columns = db.prepare("PRAGMA table_info(fighters)").all();
if (!db.prepare('PRAGMA table_info(matches)').all().some(c=>c.name==='recap_id')) db.exec('ALTER TABLE matches ADD COLUMN recap_id INTEGER');
for (const [name, type] of [["terms_version", "TEXT"], ["terms_accepted_at", "INTEGER"], ["privacy_version", "TEXT"], ["email", "TEXT"], ["email_verified_at", "INTEGER"], ["adult_confirmed_at", "INTEGER"]]) {
  if (!columns.some(c => c.name === name)) db.exec(`ALTER TABLE fighters ADD COLUMN ${name} ${type}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS sessions_fighter ON sessions(fighter_id);`);

module.exports = db;
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS fighters_email ON fighters(email COLLATE NOCASE) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS email_verifications (
 token_hash TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT NOT NULL,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, fighter_id INTEGER,
 terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, accepted_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash TEXT PRIMARY KEY, fighter_id INTEGER NOT NULL, password_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);`);
db.exec(`CREATE TABLE IF NOT EXISTS roll_recaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fighter_a_id INTEGER NOT NULL, fighter_b_id INTEGER NOT NULL,
  roll_date TEXT NOT NULL, wins_a INTEGER NOT NULL, wins_b INTEGER NOT NULL,
  no_winner INTEGER NOT NULL, proposed_by INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, confirmed_at INTEGER,
  UNIQUE(fighter_a_id, fighter_b_id, roll_date)
);
CREATE INDEX IF NOT EXISTS recaps_participants ON roll_recaps(fighter_b_id, status);
CREATE TABLE IF NOT EXISTS recap_migrations (name TEXT PRIMARY KEY);
`);
// Retire unfinished pre-training requests once. Confirmed history is preserved.
if (!db.prepare("SELECT 1 FROM recap_migrations WHERE name = 'after-training-v1'").get()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("UPDATE requests SET status = 'retired' WHERE status = 'pending'; UPDATE matches SET status = 'retired' WHERE status != 'resolved'");
    db.prepare("INSERT INTO recap_migrations VALUES (?)").run('after-training-v1');
    db.exec("COMMIT");
  } catch (err) { db.exec("ROLLBACK"); throw err; }
}
