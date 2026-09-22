const db = require("../db");
const { sendJson } = require("../router");
const { hashPassword, verifyPassword, createSession } = require("../auth");
const { publicFighter } = require("../serialize");
const { sanitizeText } = require("../sanitize");

module.exports = function authRoutes(router) {
  router.post("/api/register", async (req, res, { body }) => {
    const username = sanitizeText(body.username, 30);
    const password = String(body.password || "");

    if (username.length < 2) {
      return sendJson(res, 400, { error: "Username must be at least 2 characters." });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { error: "Password must be at least 6 characters." });
    }

    const existing = db
      .prepare("SELECT id FROM fighters WHERE username = ? COLLATE NOCASE")
      .get(username);
    if (existing) {
      return sendJson(res, 409, { error: "That username is already taken." });
    }

    const { hash, salt } = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO fighters (username, password_hash, salt, elo, belt, created_at)
         VALUES (?, ?, ?, 500, 'white', ?)`
      )
      .run(username, hash, salt, Date.now());

    const fighterId = Number(result.lastInsertRowid);
    const token = createSession(fighterId);
    const fighter = db.prepare("SELECT * FROM fighters WHERE id = ?").get(fighterId);
    sendJson(res, 200, { token, fighter: publicFighter(fighter) });
  });

  router.post("/api/login", async (req, res, { body }) => {
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const fighter = db
      .prepare("SELECT * FROM fighters WHERE username = ? COLLATE NOCASE")
      .get(username);

    if (!fighter || !verifyPassword(password, fighter.password_hash, fighter.salt)) {
      return sendJson(res, 401, { error: "Incorrect username or password." });
    }

    const token = createSession(fighter.id);
    sendJson(res, 200, { token, fighter: publicFighter(fighter) });
  });
};
