const path = require('node:path');
const fs = require('node:fs');
const { backup, DatabaseSync } = require('node:sqlite');
const db = require('../server/db');
(async () => {
  const folder = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, `matrank-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  await backup(db, target);
  const copy = new DatabaseSync(target, { readOnly: true });
  try {
    const result = copy.prepare('PRAGMA integrity_check').get();
    if (result.integrity_check !== 'ok') throw new Error('Backup integrity check failed');
  } finally { copy.close(); db.close(); }
  console.log(`Verified SQLite backup: ${target}`);
})().catch(err => { console.error(err.message); process.exitCode = 1; });
