const crypto = require('crypto');
const db = require('./db');
const { sendJson } = require('./router');
function rateLimit(req, res, namespace, limit, windowMs, identity) {
  const ip = process.env.FLY_APP_NAME ? req.headers['fly-client-ip'] || req.socket.remoteAddress : req.socket.remoteAddress;
  const key = crypto.createHash('sha256').update(`${namespace}:${identity || ip}`).digest('hex');
  const now = Date.now();
  db.prepare('DELETE FROM rate_limits WHERE resets_at <= ?').run(now);
  db.prepare(`INSERT INTO rate_limits (key, count, resets_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1`).run(key, now + windowMs);
  const row = db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(key);
  if (row.count <= limit) return false;
  res.setHeader('Retry-After', String(Math.ceil((row.resets_at - now) / 1000)));
  sendJson(res, 429, { error: 'Too many attempts. Please wait and try again.' });
  return true;
}
function security(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  if (req.url.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      if (req.headers['x-matrank-request'] !== '1' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '') || req.headers['sec-fetch-site'] === 'cross-site') {
        sendJson(res, 403, { error: 'Request blocked. Reload this page and try again.' }); return true;
      }
      const origin = process.env.APP_ORIGIN;
      if (origin && req.headers.origin && req.headers.origin !== origin) { sendJson(res, 403, { error: 'Invalid request origin.' }); return true; }
      if (rateLimit(req, res, 'writes', 120, 60000)) return true;
    }
  }
  return false;
}
module.exports = { security, rateLimit };
