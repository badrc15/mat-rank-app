const db = require("../db");
const { sendJson } = require("../router");
const { requireAuth } = require("../auth");
const { publicFighter } = require("../serialize");
const { sanitizeText } = require("../sanitize");

function matchHistoryFor(fighterId) {
  return db
    .prepare(
      `SELECT * FROM matches WHERE status = 'resolved' AND (fighter_a_id = ? OR fighter_b_id = ?)
       ORDER BY resolved_at ASC`
    )
    .all(fighterId, fighterId);
}

function outcomeForMe(m, fighterId) {
  const iAmA = m.fighter_a_id === fighterId;
  const iWon = (m.winner === "A" && iAmA) || (m.winner === "B" && !iAmA);
  return iWon ? "win" : "loss";
}

function shapeMatch(m, viewerId) {
  const fa = db.prepare("SELECT * FROM fighters WHERE id = ?").get(m.fighter_a_id);
  const fb = db.prepare("SELECT * FROM fighters WHERE id = ?").get(m.fighter_b_id);
  return {
    id: m.id,
    status: m.status,
    conflict: !!m.conflict,
    winner: m.winner,
    method: m.method,
    createdAt: m.created_at,
    resolvedAt: m.resolved_at,
    fighterA: publicFighter(fa),
    fighterB: publicFighter(fb),
    myResult: m.fighter_a_id === viewerId ? m.result_a : m.result_b,
    eloChangeA: m.elo_change_a,
    eloChangeB: m.elo_change_b,
    preEloA: m.pre_elo_a,
    preEloB: m.pre_elo_b,
  };
}

module.exports = function matchesRoutes(router) {
  router.get("/api/matches", async (req, res) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const rows = db
      .prepare(`SELECT * FROM matches WHERE fighter_a_id = ? OR fighter_b_id = ? ORDER BY created_at DESC`)
      .all(fighterId, fighterId);
    const shaped = rows.map((m) => shapeMatch(m, fighterId));

    const history = matchHistoryFor(fighterId);
    const byOpp = {};
    history.forEach((m) => {
      const oppId = m.fighter_a_id === fighterId ? m.fighter_b_id : m.fighter_a_id;
      if (!byOpp[oppId]) byOpp[oppId] = { opp: oppId, w: 0, l: 0, matches: 0, lastAt: 0 };
      const rec = byOpp[oppId];
      rec.matches++;
      rec.lastAt = Math.max(rec.lastAt, m.resolved_at);
      if (outcomeForMe(m, fighterId) === "win") rec.w++;
      else rec.l++;
    });
    const rivals = Object.values(byOpp)
      .sort((a, b) => b.matches - a.matches || b.lastAt - a.lastAt)
      .map((r) => ({
        ...r,
        fighter: publicFighter(db.prepare("SELECT * FROM fighters WHERE id = ?").get(r.opp)),
      }));

    sendJson(res, 200, { matches: shaped, rivals });
  });

  router.post("/api/matches/:id/like", async (req, res, { params }) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const existing = db
      .prepare("SELECT 1 FROM likes WHERE match_id = ? AND fighter_id = ?")
      .get(params.id, fighterId);
    if (existing) {
      db.prepare("DELETE FROM likes WHERE match_id = ? AND fighter_id = ?").run(params.id, fighterId);
    } else {
      db.prepare("INSERT INTO likes (match_id, fighter_id) VALUES (?, ?)").run(params.id, fighterId);
    }
    const count = db.prepare("SELECT COUNT(*) as c FROM likes WHERE match_id = ?").get(params.id).c;
    sendJson(res, 200, { liked: !existing, count });
  });

  router.post("/api/matches/:id/comments", async (req, res, { params, body }) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const text = sanitizeText(body.text, 280);
    if (!text) return sendJson(res, 400, { error: "Comment cannot be empty." });

    let parentId = body.parentId ? parseInt(body.parentId, 10) : null;
    if (parentId) {
      const parent = db.prepare("SELECT * FROM comments WHERE id = ?").get(parentId);
      // Cap nesting at one level: replying to a reply attaches to its top-level ancestor.
      if (parent && parent.parent_id) parentId = parent.parent_id;
    }

    db.prepare(
      `INSERT INTO comments (match_id, fighter_id, parent_id, text, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(params.id, fighterId, parentId, text, Date.now());
    sendJson(res, 200, { ok: true });
  });

  router.get("/api/feed", async (req, res) => {
    const fighterId = requireAuth(req);
    if (!fighterId) return sendJson(res, 401, { error: "Not authenticated" });

    const rows = db
      .prepare(`SELECT * FROM matches WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 40`)
      .all();

    const shaped = rows.map((m) => {
      const base = shapeMatch(m, fighterId);
      const likeCount = db.prepare("SELECT COUNT(*) as c FROM likes WHERE match_id = ?").get(m.id).c;
      const liked = !!db
        .prepare("SELECT 1 FROM likes WHERE match_id = ? AND fighter_id = ?")
        .get(m.id, fighterId);
      const comments = db
        .prepare("SELECT * FROM comments WHERE match_id = ? ORDER BY created_at ASC")
        .all(m.id)
        .map((c) => ({
          id: c.id,
          parentId: c.parent_id,
          text: c.text,
          createdAt: c.created_at,
          author: publicFighter(db.prepare("SELECT * FROM fighters WHERE id = ?").get(c.fighter_id)),
        }));
      return { ...base, likeCount, liked, comments };
    });

    sendJson(res, 200, { feed: shaped });
  });
};
