const db = require("../db");
const { sendJson } = require("../router");
const { requireAuth } = require("../auth");
const { publicFighter } = require("../serialize");

function hasUnresolvedMatch(fighterId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM matches
       WHERE (fighter_a_id = ? OR fighter_b_id = ?) AND status != 'resolved'`
    )
    .get(fighterId, fighterId);
  return row.c > 0;
}

module.exports = function requestsRoutes(router) {
  router.get("/api/requests", async (req, res) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const incoming = db
      .prepare(`SELECT * FROM requests WHERE to_id = ? AND status = 'pending'`)
      .all(fighterId);
    const outgoing = db.prepare(`SELECT * FROM requests WHERE from_id = ?`).all(fighterId);

    const shape = (rows, otherKey) =>
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        fighter: publicFighter(db.prepare("SELECT * FROM fighters WHERE id = ?").get(r[otherKey])),
      }));

    sendJson(res, 200, {
      incoming: shape(incoming, "from_id"),
      outgoing: shape(outgoing, "to_id"),
      canSendRequests: !hasUnresolvedMatch(fighterId),
    });
  });

  router.post("/api/requests", async (req, res, { body }) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const toId = parseInt(body.toId, 10);
    if (!toId || toId === fighterId) return sendJson(res, 400, { error: "Invalid opponent." });

    if (hasUnresolvedMatch(fighterId)) {
      return sendJson(res, 403, {
        error: "You have an unresolved match — confirm it before requesting anyone else.",
      });
    }

    const target = db.prepare("SELECT id FROM fighters WHERE id = ?").get(toId);
    if (!target) return sendJson(res, 404, { error: "Fighter not found." });

    const existing = db
      .prepare(`SELECT id FROM requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`)
      .get(fighterId, toId);
    if (existing) return sendJson(res, 409, { error: "You already have a pending request with this fighter." });

    db.prepare("INSERT INTO requests (from_id, to_id, status, created_at) VALUES (?, ?, ?, ?)").run(
      fighterId,
      toId,
      "pending",
      Date.now()
    );
    sendJson(res, 200, { ok: true });
  });

  router.patch("/api/requests/:id", async (req, res, { params, body }) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const reqRow = db.prepare("SELECT * FROM requests WHERE id = ?").get(params.id);
    if (!reqRow || reqRow.to_id !== fighterId) return sendJson(res, 404, { error: "Request not found." });
    if (reqRow.status !== "pending") return sendJson(res, 409, { error: "Request already handled." });

    if (body.accept) {
      db.prepare(`UPDATE requests SET status = 'accepted' WHERE id = ?`).run(reqRow.id);
      db.prepare(
        `INSERT INTO matches (fighter_a_id, fighter_b_id, status, conflict, created_at)
         VALUES (?, ?, 'awaiting', 0, ?)`
      ).run(reqRow.from_id, reqRow.to_id, Date.now());
    } else {
      db.prepare(`UPDATE requests SET status = 'declined' WHERE id = ?`).run(reqRow.id);
    }
    sendJson(res, 200, { ok: true });
  });
};
