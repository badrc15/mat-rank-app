const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');
const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'matrank_session';
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
let activeHashes = 0;
async function derive(password, salt, modern) {
  if (activeHashes >= 2) throw Object.assign(new Error('Please try again shortly.'), { status: 503 });
  activeHashes++;
  try {
    return await scrypt(password, salt, 64, modern ? { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 } : {});
  } finally { activeHashes--; }
}
async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { hash: 'scrypt-v2$' + (await derive(password, salt, true)).toString('hex'), salt };
}
async function verifyPassword(password, hash, salt) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const modern = hash.startsWith('scrypt-v2$');
  const expected = Buffer.from(modern ? hash.slice(10) : hash, 'hex');
  const actual = await derive(password, salt, modern);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
function createSession(fighterId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE created_at < ?').run(Date.now() - SESSION_MS);
  db.prepare('INSERT INTO sessions (token, fighter_id, created_at) VALUES (?, ?, ?)').run(digest(token), fighterId, Date.now());
  return token;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? SESSION_MS / 1000 : 0}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
function getTokenFromRequest(req) {
  const value = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  const token = value ? value.slice(COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function requireAuth(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const row = db.prepare('SELECT fighter_id FROM sessions WHERE token = ? AND created_at > ?').get(digest(token), Date.now() - SESSION_MS);
  return row ? row.fighter_id : null;
}
function revokeSession(req) {
  const token = getTokenFromRequest(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(token));
}
function passwordError(password) {
  if (typeof password !== 'string' || password.length < 15 || password.length > 128) return 'Use a password of 15–128 characters, preferably a unique passphrase.';
  if (/^(.)\1+$/.test(password) || ['passwordpassword', '123456789012345', 'qwertyuiopasdfgh'].includes(password.toLowerCase())) return 'Choose a less predictable password.';
  return null;
}
module.exports = { hashPassword, verifyPassword, createSession, setSessionCookie, getTokenFromRequest, requireAuth, revokeSession, passwordError };
