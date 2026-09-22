const crypto = require("crypto");
const db = require("./db");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSession(fighterId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, fighter_id, created_at) VALUES (?, ?, ?)").run(
    token,
    fighterId,
    Date.now()
  );
  return token;
}

function getTokenFromRequest(req) {
  const header = req.headers["authorization"] || "";
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

// Returns the authenticated fighter's id, or null.
function requireAuth(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const row = db.prepare("SELECT fighter_id FROM sessions WHERE token = ?").get(token);
  return row ? row.fighter_id : null;
}

module.exports = { hashPassword, verifyPassword, createSession, getTokenFromRequest, requireAuth };
