const db = require("../db");
const { sendJson } = require("../router");
const { requireAuth } = require("../auth");
const { publicFighter } = require("../serialize");
const { beltMeta, isValidBelt } = require("../elo");
const { sanitizeText } = require("../sanitize");

module.exports = function fightersRoutes(router) {
  // Full roster (used by the Roster tab's overall/belt/weight/gym views)
  router.get("/api/fighters", async (req, res) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });
    const rows = db.prepare("SELECT * FROM fighters ORDER BY elo DESC").all();
    sendJson(res, 200, { fighters: rows.map(publicFighter) });
  });

  router.get("/api/me", async (req, res) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });
    const row = db.prepare("SELECT * FROM fighters WHERE id = ?").get(fighterId);
    if (!row) return sendJson(res, 401, { error: "Not authenticated" });
    sendJson(res, 200, { fighter: publicFighter(row) });
  });

  router.patch("/api/me", async (req, res, { body }) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });
    const fighter = db.prepare("SELECT * FROM fighters WHERE id = ?").get(fighterId);

    const updates = {};

    if (body.weight !== undefined) {
      const w = parseFloat(body.weight);
      updates.weight = w && w > 0 && w < 300 ? String(w) : "";
    }
    if (body.gender !== undefined && ["", "men", "women"].includes(body.gender)) {
      updates.gender = body.gender;
    }
    if (body.gym !== undefined) {
      updates.gym = sanitizeText(body.gym, 50);
    }

    let promotion = null;
    if (body.belt !== undefined && body.belt !== fighter.belt && isValidBelt(body.belt)) {
      const newStart = beltMeta(body.belt).startElo;
      promotion = { fromBelt: fighter.belt, fromElo: fighter.elo, toBelt: body.belt, toElo: newStart };
      updates.belt = body.belt;
      updates.elo = newStart;
      updates.matches_played = 0;
    }

    const fields = Object.keys(updates);
    if (fields.length) {
      const setClause = fields.map((f) => `${f} = ?`).join(", ");
      db.prepare(`UPDATE fighters SET ${setClause} WHERE id = ?`).run(
        ...fields.map((f) => updates[f]),
        fighterId
      );
    }

    const updated = db.prepare("SELECT * FROM fighters WHERE id = ?").get(fighterId);
    sendJson(res, 200, { fighter: publicFighter(updated), promotion });
  });

  router.post("/api/me/log-training", async (req, res) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });
    const fighter = db.prepare("SELECT * FROM fighters WHERE id = ?").get(fighterId);

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (fighter.streak_last_log === today) {
      return sendJson(res, 200, { fighter: publicFighter(fighter), alreadyLogged: true });
    }

    const current = fighter.streak_last_log === yesterday ? fighter.streak_current + 1 : 1;
    const longest = Math.max(fighter.streak_longest, current);

    db.prepare(
      "UPDATE fighters SET streak_current = ?, streak_longest = ?, streak_last_log = ? WHERE id = ?"
    ).run(current, longest, today, fighterId);

    const updated = db.prepare("SELECT * FROM fighters WHERE id = ?").get(fighterId);
    sendJson(res, 200, { fighter: publicFighter(updated) });
  });
};
