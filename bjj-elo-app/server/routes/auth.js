const dummyHash = 'scrypt-v2$' + '00'.repeat(64);
const db = require('../db');
const { sendJson } = require('../router');
const { hashPassword, verifyPassword, createSession, setSessionCookie, requireAuth, revokeSession, passwordError } = require('../auth');
const { rateLimit } = require('../security');
const { publicFighter } = require('../serialize');
const { sanitizeText } = require('../sanitize');
module.exports = function authRoutes(router) {
  require('./email-accounts')(router);
  router.post('/api/login', async (req, res, { body }) => {
    const username = String(body.email || body.username || '').trim();
    const password = body.password;
    if (rateLimit(req, res, 'login-ip', 20, 15 * 60 * 1000) || rateLimit(req, res, 'login-account', 10, 15 * 60 * 1000, username.toLowerCase())) return;
    if (typeof password !== 'string' || password.length > 128 || username.length > 254) return sendJson(res, 401, { error: 'Incorrect email or password.' });
    const fighter = db.prepare('SELECT * FROM fighters WHERE (email = ? COLLATE NOCASE AND email_verified_at IS NOT NULL) OR (email IS NULL AND username = ? COLLATE NOCASE)').get(username, sanitizeText(username, 30));
    const valid = await verifyPassword(password, fighter?.password_hash || dummyHash, fighter?.salt || 'missing-account');
    if (!fighter || !valid) return sendJson(res, 401, { error: 'Incorrect email or password.' });
    let verifiedHash = fighter.password_hash;
    if (!fighter.password_hash.startsWith('scrypt-v2$')) {
      const { hash, salt } = await hashPassword(password);
      const updated = db.prepare('UPDATE fighters SET password_hash = ?, salt = ? WHERE id = ? AND password_hash = ?').run(hash, salt, fighter.id, fighter.password_hash);
      if (!updated.changes) return sendJson(res, 401, { error: 'Account changed. Please sign in again.' });
      verifiedHash = hash;
    }
    // A password change/deletion during hashing must not issue a stale authenticated session.
    const latest = db.prepare('SELECT * FROM fighters WHERE id = ?').get(fighter.id);
    if (!latest || latest.password_hash !== verifiedHash) return sendJson(res, 401, { error: 'Incorrect email or password.' });
    revokeSession(req);
    setSessionCookie(res, createSession(fighter.id));
    sendJson(res, 200, { fighter: publicFighter(latest) });
  });
  router.post('/api/logout', async (req, res) => {
    revokeSession(req); setSessionCookie(res, ''); sendJson(res, 200, { ok: true });
  });
  router.post('/api/me/password', async (req, res, { body }) => {
    const id = requireAuth(req);
    if (!id) return sendJson(res, 401, { error: 'Not authenticated' });
    if (rateLimit(req, res, 'password', 5, 15 * 60 * 1000, String(id))) return;
    const error = passwordError(body.newPassword);
    if (error) return sendJson(res, 400, { error });
    const fighter = db.prepare('SELECT * FROM fighters WHERE id = ?').get(id);
    if (!fighter || !(await verifyPassword(body.currentPassword, fighter.password_hash, fighter.salt))) return sendJson(res, 401, { error: 'Incorrect current password.' });
    const { hash, salt } = await hashPassword(body.newPassword);
    db.exec('BEGIN IMMEDIATE');
    try {
      const changed = db.prepare('UPDATE fighters SET password_hash = ?, salt = ? WHERE id = ? AND password_hash = ?').run(hash, salt, id, fighter.password_hash);
      if (!changed.changes) { db.exec('ROLLBACK'); return sendJson(res, 409, { error: 'Account changed. Sign in again.' }); }
      db.prepare('DELETE FROM password_resets WHERE fighter_id = ?').run(id);
      db.prepare('DELETE FROM email_verifications WHERE fighter_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE fighter_id = ?').run(id);
      const token = createSession(id);
      db.exec('COMMIT');
      setSessionCookie(res, token);
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    sendJson(res, 200, { ok: true });
  });
  router.post('/api/me/logout-all', async (req, res) => {
    const id = requireAuth(req);
    if (!id) return sendJson(res, 401, { error: 'Not authenticated' });
    db.prepare('DELETE FROM sessions WHERE fighter_id = ?').run(id);
    setSessionCookie(res, ''); sendJson(res, 200, { ok: true });
  });
  router.get('/api/me/export', async (req, res) => {
    const id = requireAuth(req);
    if (!id) return sendJson(res, 401, { error: 'Not authenticated' });
    const row = db.prepare('SELECT * FROM fighters WHERE id = ?').get(id);
    const { password_hash, salt, ...profile } = row;
    res.setHeader('Content-Disposition', 'attachment; filename="mat-rank-account.json"');
    sendJson(res, 200, {
      exportedAt: new Date().toISOString(), profile,
      requests: db.prepare('SELECT * FROM requests WHERE from_id = ? OR to_id = ?').all(id, id),
      matches: db.prepare('SELECT * FROM matches WHERE fighter_a_id = ? OR fighter_b_id = ?').all(id, id),
      comments: db.prepare('SELECT * FROM comments WHERE fighter_id = ?').all(id),
      likes: db.prepare('SELECT * FROM likes WHERE fighter_id = ?').all(id),
      recaps: db.prepare('SELECT * FROM roll_recaps WHERE fighter_a_id = ? OR fighter_b_id = ?').all(id, id),
    });
  });
  router.del('/api/me', async (req, res, { body }) => {
    const id = requireAuth(req);
    if (!id) return sendJson(res, 401, { error: 'Not authenticated' });
    if (rateLimit(req, res, 'delete', 5, 15 * 60 * 1000, String(id))) return;
    const fighter = db.prepare('SELECT * FROM fighters WHERE id = ?').get(id);
    if (body.confirm !== 'DELETE' || !fighter || !(await verifyPassword(body.password, fighter.password_hash, fighter.salt))) return sendJson(res, 400, { error: 'Enter your current password and type DELETE.' });
    if (!requireAuth(req)) return sendJson(res, 401, { error: 'Sign in again.' });
    db.exec('BEGIN IMMEDIATE');
    try {
      // Keep non-identifying match records for opponents, but remove profile and authored content.
      db.prepare("UPDATE comments SET parent_id = NULL WHERE parent_id IN (SELECT id FROM comments WHERE fighter_id = ?)").run(id);
      db.prepare('DELETE FROM comments WHERE fighter_id = ?').run(id);
      db.prepare('DELETE FROM likes WHERE fighter_id = ?').run(id);
      db.prepare('DELETE FROM requests WHERE from_id = ? OR to_id = ?').run(id, id);
      db.prepare('DELETE FROM roll_recaps WHERE fighter_a_id = ? OR fighter_b_id = ?').run(id, id);
      db.prepare("DELETE FROM matches WHERE status != 'resolved' AND (fighter_a_id = ? OR fighter_b_id = ?)").run(id, id);
      db.prepare('DELETE FROM sessions WHERE fighter_id = ?').run(id);
      db.prepare('DELETE FROM password_resets WHERE fighter_id = ?').run(id);
      db.prepare('DELETE FROM email_verifications WHERE fighter_id = ? OR email = ?').run(id, fighter.email);
      db.prepare('DELETE FROM fighters WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    setSessionCookie(res, ''); sendJson(res, 200, { ok: true });
  });
};
