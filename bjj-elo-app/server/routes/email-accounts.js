const crypto = require('node:crypto');
const db = require('../db');
const {sendJson} = require('../router');
const {hashPassword, verifyPassword, requireAuth, passwordError, setSessionCookie} = require('../auth');
const {rateLimit} = require('../security');
const {sanitizeText} = require('../sanitize');
const {mailReady, sendAccountEmail} = require('../mail');
const VERSION = '2026-10-03';
const signupsEnabled = () => (process.env.NODE_ENV !== 'production' || process.env.SIGNUPS_ENABLED === 'true') && mailReady();
const emailAddress = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const tokenHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? digest(value) : '';
const generic = 'If this email is eligible, an email will arrive shortly. Check your spam folder. You can request another link if needed.';
async function deliver(email, kind, token, table) {
  try { await sendAccountEmail(email, kind, token); }
  catch {
    db.prepare(`DELETE FROM ${table} WHERE token_hash = ?`).run(digest(token));
    console.error('Account email delivery failed; check provider configuration and quota.');
  }
}
module.exports = function(router) {
  router.get('/api/config', async (req,res) => sendJson(res,200,{termsVersion:VERSION,privacyVersion:VERSION,signupsEnabled:signupsEnabled(),emailReady:mailReady()}));
  router.post('/api/register', async (req,res,{body}) => {
    if (!signupsEnabled()) return sendJson(res,503,{error:'Registration is not open yet. Please try again after launch.'});
    if (rateLimit(req,res,'register',5,3600000)) return;
    const email=emailAddress(body.email), username=sanitizeText(body.username,30);
    if (!email) return sendJson(res,400,{error:'Enter a valid email address.'});
    if (body.adult !== true) return sendJson(res,400,{error:'Mat Rank is currently for adults aged 18 or over. Children cannot register or use an adult account.'});
    if (body.acceptTerms !== true || body.termsVersion !== VERSION || body.privacyVersion !== VERSION) return sendJson(res,400,{error:'Please read the current terms and privacy notice and accept the terms.'});
    if (username.length<2 || username.includes('@')) return sendJson(res,400,{error:'Choose a nickname of 2–30 characters, not an email address.'});
    const error=passwordError(body.password); if(error) return sendJson(res,400,{error});
    if (rateLimit(req,res,'register-email',3,3600000,email)) return;
    const {hash,salt}=await hashPassword(body.password);
    if (!db.prepare('SELECT id FROM fighters WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE').get(email,username)) {
      const token=crypto.randomBytes(32).toString('hex');
      db.prepare(`INSERT INTO email_verifications (token_hash,email,username,password_hash,salt,fighter_id,terms_version,privacy_version,accepted_at,expires_at)
        VALUES (?,?,?,?,?,NULL,?,?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,username=excluded.username,password_hash=excluded.password_hash,salt=excluded.salt,fighter_id=NULL,terms_version=excluded.terms_version,privacy_version=excluded.privacy_version,accepted_at=excluded.accepted_at,expires_at=excluded.expires_at`).run(digest(token),email,username,hash,salt,VERSION,VERSION,Date.now(),Date.now()+86400000);
      await deliver(email,'verify',token,'email_verifications');
    }
    sendJson(res,202,{message:generic});
  });
  router.post('/api/verify-email', async(req,res,{body}) => {
    if(rateLimit(req,res,'verify-email',20,900000)) return;
    const key=tokenHash(body.token), pending=db.prepare('SELECT * FROM email_verifications WHERE token_hash=? AND expires_at>?').get(key,Date.now());
    if(!pending) return sendJson(res,400,{error:'This verification link is invalid or expired. Request a new one.'});
    if(!pending.fighter_id && !signupsEnabled()) return sendJson(res,503,{error:'Registration is currently closed.'});
    const owner=db.prepare('SELECT id FROM fighters WHERE email=? COLLATE NOCASE').get(pending.email);
    if(owner || (!pending.fighter_id && db.prepare('SELECT id FROM fighters WHERE username=? COLLATE NOCASE').get(pending.username))) return sendJson(res,409,{error:'The account details are no longer available. Sign in or start again with a different nickname.'});
    db.exec('BEGIN IMMEDIATE');
    try {
      if(pending.fighter_id) {
        const result=db.prepare('UPDATE fighters SET email=?,email_verified_at=? WHERE id=? AND email IS NULL AND password_hash=?').run(pending.email,Date.now(),pending.fighter_id,pending.password_hash);
        if(!result.changes) { db.exec('ROLLBACK'); return sendJson(res,409,{error:'Account changed. Sign in and request a new link.'}); }
        db.prepare('DELETE FROM sessions WHERE fighter_id=?').run(pending.fighter_id);
      } else {
        db.prepare(`INSERT INTO fighters (username,email,email_verified_at,password_hash,salt,created_at,terms_version,terms_accepted_at,privacy_version,adult_confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(pending.username,pending.email,Date.now(),pending.password_hash,pending.salt,Date.now(),pending.terms_version,pending.accepted_at,pending.privacy_version,pending.accepted_at);
      }
      db.prepare('DELETE FROM email_verifications WHERE token_hash=?').run(key);
      db.exec('COMMIT');
    } catch(err) {db.exec('ROLLBACK');throw err;}
    setSessionCookie(res,'');
    sendJson(res,200,{message:'Email verified. Sign in with your email and password.'});
  });
  router.post('/api/forgot-password', async(req,res,{body}) => {
    if(!mailReady()) return sendJson(res,503,{error:'Email recovery is temporarily unavailable. Please try again later or contact support.'});
    const email=emailAddress(body.email);
    if(!email) return sendJson(res,400,{error:'Enter a valid email address.'});
    if(rateLimit(req,res,'reset-ip',10,3600000) || rateLimit(req,res,'reset-email',3,3600000,email)) return;
    const start=Date.now();
    const fighter=db.prepare('SELECT * FROM fighters WHERE email=? COLLATE NOCASE AND email_verified_at IS NOT NULL').get(email);
    if(fighter){
      const token=crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO password_resets VALUES (?,?,?,?)').run(digest(token),fighter.id,fighter.password_hash,Date.now()+1800000);
      await deliver(email,'reset',token,'password_resets');
    }
    // Match the normal delivery latency floor for unknown addresses; responses never disclose membership.
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,750-Date.now())));
    sendJson(res,202,{message:generic});
  });
  router.post('/api/reset-password', async(req,res,{body}) => {
    if(rateLimit(req,res,'reset-token',10,900000)) return;
    const error=passwordError(body.password); if(error) return sendJson(res,400,{error});
    const key=tokenHash(body.token);
    const pending=db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?').get(key,Date.now());
    if(!pending) return sendJson(res,400,{error:'This reset link is invalid or expired. Request a new one.'});
    const {hash,salt}=await hashPassword(body.password);
    db.exec('BEGIN IMMEDIATE');
    try {
      const current=db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?').get(key,Date.now());
      if(!current) {db.exec('ROLLBACK');return sendJson(res,400,{error:'This reset link is invalid or expired. Request a new one.'});}
      const changed=db.prepare('UPDATE fighters SET password_hash=?,salt=? WHERE id=? AND password_hash=?').run(hash,salt,current.fighter_id,current.password_hash);
      if(!changed.changes) {db.exec('ROLLBACK');return sendJson(res,400,{error:'This reset link is no longer valid. Request a new one.'});}
      db.prepare('DELETE FROM sessions WHERE fighter_id=?').run(current.fighter_id);
      db.prepare('DELETE FROM password_resets WHERE fighter_id=?').run(current.fighter_id);
      db.prepare('DELETE FROM email_verifications WHERE fighter_id=?').run(current.fighter_id);
      db.exec('COMMIT');
    }catch(err){db.exec('ROLLBACK');throw err;}
    setSessionCookie(res,'');sendJson(res,200,{message:'Password reset. All devices have been signed out. Sign in with your new password.'});
  });
  router.get('/api/me/email',async(req,res)=>{
    const id=requireAuth(req); if(!id)return sendJson(res,401,{error:'Not authenticated'});
    const row=db.prepare('SELECT email,email_verified_at FROM fighters WHERE id=?').get(id);
    sendJson(res,200,{email:row?.email||null,verified:Boolean(row?.email_verified_at)});
  });
  router.post('/api/me/email',async(req,res,{body})=>{
    const id=requireAuth(req); if(!id)return sendJson(res,401,{error:'Not authenticated'});
    if(!mailReady())return sendJson(res,503,{error:'Email delivery is not available yet.'});
    if(rateLimit(req,res,'attach-email',3,3600000,String(id)))return;
    const email=emailAddress(body.email),fighter=db.prepare('SELECT * FROM fighters WHERE id=?').get(id);
    if(!email)return sendJson(res,400,{error:'Enter a valid email address.'});
    if(fighter.email)return sendJson(res,409,{error:'Your account already has an email. Contact support to change it.'});
    if(!await verifyPassword(body.password,fighter.password_hash,fighter.salt))return sendJson(res,401,{error:'Incorrect current password.'});
    if(db.prepare('SELECT id FROM fighters WHERE email=? COLLATE NOCASE').get(email))return sendJson(res,202,{message:generic});
    if(!requireAuth(req))return sendJson(res,401,{error:'Sign in again.'});
    const token=crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM email_verifications WHERE fighter_id=? OR email=?').run(id,email);
    db.prepare('INSERT INTO email_verifications VALUES (?,?,?,?,?,?,?,?,?,?)').run(digest(token),email,fighter.username,fighter.password_hash,fighter.salt,id,VERSION,VERSION,Date.now(),Date.now()+86400000);
    await deliver(email,'verify',token,'email_verifications');sendJson(res,202,{message:generic});
  });
};
