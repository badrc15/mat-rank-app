const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, readdirSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

test('account security, consent and durable storage', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'matrank-test-'));
  let child, port, db;
  let output = '';
  async function start(extra = {}) {
    child = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: directory, PORT: '0', NODE_ENV: 'test', MAIL_TRANSPORT:'file', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', x => { output += x; });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out: ' + output)), 10000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Server exited ' + code + ': ' + output)); });
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/port (\d+)/);
        if (match) { port = match[1]; clearTimeout(timeout); resolve(); }
      });
    });
  }
  async function stop() { if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  async function request(route, { method = 'GET', body, cookie, headers = {} } = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'Content-Type': 'application/json', 'X-Matrank-Request': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, headers: res.headers, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const password = 'a unique mat rank passphrase 123';
  const consent = { acceptTerms: true, termsVersion: '2026-10-03', privacyVersion: '2026-10-03' };
  const registration = { username: 'test fighter', email: 'fighter@example.test', adult:true, password, ...consent };
  let cookie, secondCookie, id;
  try {
    await start(); db = new DatabaseSync(path.join(directory, 'matrank.db'));
    await t.test('rejects missing or stale terms and weak passwords', async () => {
      for (const body of [{ ...registration, acceptTerms: false }, { ...registration, termsVersion: 'old' }, { ...registration, password: 'short' }]) assert.equal((await request('/api/register', { method: 'POST', body })).status, 400);
    });
    await t.test('registers with recorded acceptance and secure hashed credentials', async () => {
      const result = await request('/api/register', { method: 'POST', body: registration });
      assert.equal(result.status, 202);
      const mailFolder=path.join(directory,'mail-test');
      const mail=JSON.parse(readFileSync(path.join(mailFolder,readdirSync(mailFolder)[0]),'utf8'));
      const token=mail.text.match(/#verify=([a-f0-9]{64})/)[1];
      assert.equal((await request('/api/verify-email',{method:'POST',body:{token}})).status,200);
      const login=await request('/api/login',{method:'POST',body:{email:registration.email,password}});
      cookie=login.cookie;id=login.data.fighter.id;
      result.headers=login.headers;
      assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
      assert.equal(result.data.token, undefined);
      const fighter = db.prepare('SELECT * FROM fighters WHERE id = ?').get(id);
      assert.match(fighter.password_hash, /^scrypt-v2\$/); assert.equal(fighter.terms_version, consent.termsVersion); assert.ok(fighter.terms_accepted_at);
      const session = db.prepare('SELECT token FROM sessions WHERE fighter_id = ?').get(id);
      assert.notEqual(session.token, cookie.split('=')[1]);
      assert.equal((await request('/api/me', { cookie })).status, 200);
      assert.equal((await request('/api/me')).status, 401);
    });
    await t.test('refresh and restart preserve account, session and profile', async () => {
      assert.equal((await request('/api/me', { method: 'PATCH', cookie, body: { gym: 'Saved gym' } })).status, 200);
      await stop(); await start();
      const result = await request('/api/me', { cookie });
      assert.equal(result.status, 200); assert.equal(result.data.fighter.gym, 'Saved gym');
    });
    await t.test('rejects CSRF, malformed JSON and oversized bodies', async () => {
      assert.equal((await request('/api/logout', { method: 'POST', cookie, body: {}, headers: { 'X-Matrank-Request': '' } })).status, 403);
      assert.equal((await request('/api/logout', { method: 'POST', cookie, body: {}, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.equal((await request('/api/login', { method: 'POST', body: '{bad' })).status, 400);
      assert.equal((await request('/api/login', { method: 'POST', body: { x: 'a'.repeat(20000) } })).status, 413);
      assert.equal((await request('/api/me', { cookie })).headers.get('cache-control'), 'no-store');
      assert.ok((await request('/')).headers.get('content-security-policy'));
    });
    await t.test('logout revokes copied cookie and login restores account', async () => {
      assert.equal((await request('/api/logout', { method: 'POST', cookie, body: {} })).status, 200);
      assert.equal((await request('/api/me', { cookie })).status, 401);
      const login = await request('/api/login', { method: 'POST', body: { email: registration.email, password } });
      assert.equal(login.status, 200); cookie = login.cookie;
      secondCookie = (await request('/api/login', { method: 'POST', body: { email: registration.email, password } })).cookie;
    });
    await t.test('password change verifies old password and invalidates other devices', async () => {
      assert.equal((await request('/api/me/password', { method: 'POST', cookie, body: { currentPassword: 'wrong', newPassword: password + ' new' } })).status, 401);
      const changed = await request('/api/me/password', { method: 'POST', cookie, body: { currentPassword: password, newPassword: password + ' new' } });
      assert.equal(changed.status, 200); cookie = changed.cookie;
      assert.equal((await request('/api/me', { cookie: secondCookie })).status, 401);
      assert.equal((await request('/api/login', { method: 'POST', body: { email: registration.email, password } })).status, 401);
    });
    await t.test('export omits password and session secrets', async () => {
      const result = await request('/api/me/export', { cookie });
      assert.equal(result.status, 200); assert.equal(result.data.profile.username, registration.username);
      assert.equal(result.data.profile.password_hash, undefined); assert.equal(result.data.profile.salt, undefined);
      assert.equal(result.data.sessions, undefined);
    });
    await t.test('session expiry is enforced by server', async () => {
      db.prepare('UPDATE sessions SET created_at = ?').run(Date.now() - 8 * 86400000);
      assert.equal((await request('/api/me', { cookie })).status, 401);
      cookie = (await request('/api/login', { method: 'POST', body: { email: registration.email, password: password + ' new' } })).cookie;
    });
    await t.test('legacy passwords are upgraded without resetting the account', async () => {
      const salt = 'legacy-test-salt';
      db.prepare('INSERT INTO fighters (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)').run('legacy', crypto.scryptSync('oldpass', salt, 64).toString('hex'), salt, Date.now());
      const result = await request('/api/login', { method: 'POST', body: { username: 'legacy', password: 'oldpass' } });
      assert.equal(result.status, 200);
      assert.match(db.prepare("SELECT password_hash FROM fighters WHERE username = 'legacy'").get().password_hash, /^scrypt-v2\$/);
    });
    await t.test('account rate limiting persists over process restart', async () => {
      const key = crypto.createHash('sha256').update('login-account:blocked').digest('hex');
      db.prepare('INSERT INTO rate_limits (key, count, resets_at) VALUES (?, ?, ?)').run(key, 10, Date.now() + 900000);
      await stop(); await start();
      const result = await request('/api/login', { method: 'POST', body: { username: 'blocked', password } });
      assert.equal(result.status, 429); assert.ok(result.headers.get('retry-after'));
    });
    await t.test('deletion requires current password and removes profile and sessions', async () => {
      assert.equal((await request('/api/me', { method: 'DELETE', cookie, body: { password: 'wrong', confirm: 'DELETE' } })).status, 400);
      assert.equal((await request('/api/me', { method: 'DELETE', cookie, body: { password: password + ' new', confirm: 'DELETE' } })).status, 200);
      assert.equal((await request('/api/me', { cookie })).status, 401);
      assert.equal(db.prepare('SELECT * FROM fighters WHERE id = ?').get(id), undefined);
    });
    await t.test('production registration is closed and cookies require HTTPS', async () => {
      await stop(); await start({ NODE_ENV: 'production', SIGNUPS_ENABLED: 'false' });
      assert.equal((await request('/api/register', { method: 'POST', body: registration })).status, 503);
      const result = await request('/api/login', { method: 'POST', body: { username: 'legacy', password: 'oldpass' } });
      assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /; Secure/);
      assert.ok(result.headers.get('strict-transport-security'));
      assert.equal((await request('/api/config')).data.signupsEnabled, false);
    });
  } finally {
    await stop(); if (db) db.close(); rmSync(directory, { recursive: true, force: true });
  }
});
