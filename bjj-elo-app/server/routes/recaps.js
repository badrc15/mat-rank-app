const db = require('../db');
const { requireAuth } = require('../auth');
const { sendJson } = require('../router');
const { publicFighter } = require('../serialize');
const { computeEloUpdate } = require('../elo');
const DAY = 86400000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status, safe: true }); };
function counts(body) {
  const values = [body.wins, body.losses, body.noWinner];
  if (values.some(n => !Number.isInteger(n) || n < 0 || n > 20) || values.reduce((a,b) => a+b, 0) < 1 || values.reduce((a,b) => a+b, 0) > 20) fail(400, 'Record between 1 and 20 rounds per partner, using whole numbers.');
  return values;
}
function expire() { db.prepare("UPDATE roll_recaps SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?").run(Date.now()); }
function shape(r, viewer) {
  const isA = r.fighter_a_id === viewer;
  return { id: r.id, version: r.version, date: r.roll_date, wins: isA ? r.wins_a : r.wins_b,
    losses: isA ? r.wins_b : r.wins_a, noWinner: r.no_winner, status: r.status,
    needsReview: r.status === 'pending' && r.proposed_by !== viewer,
    opponent: publicFighter(db.prepare('SELECT * FROM fighters WHERE id = ?').get(isA ? r.fighter_b_id : r.fighter_a_id)), expiresAt: r.expires_at };
}
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (err) { db.exec('ROLLBACK'); throw err; } }
module.exports = router => {
  const route = handler => async (req, res, context) => {
    const id = requireAuth(req);
    if (!id) return sendJson(res, 401, { error: 'Not authenticated' });
    expire();
    try { await handler(req, res, context, id); }
    catch (err) { if (err.safe) return sendJson(res, err.status, { error: err.message }); throw err; }
  };
  router.get('/api/recaps', route((req, res, ctx, id) => {
    const rows = db.prepare('SELECT * FROM roll_recaps WHERE fighter_a_id = ? OR fighter_b_id = ? ORDER BY created_at DESC, id DESC LIMIT 300').all(id,id);
    sendJson(res, 200, { recaps: rows.map(r => shape(r,id)) });
  }));
  router.post('/api/recaps', route((req, res, { body }, id) => {
    const { date, partners } = body;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const ts = Date.parse(date + 'T00:00:00Z');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(ts) || new Date(ts).toISOString().slice(0,10) !== date || date > today || Date.parse(today) - ts > 14 * DAY) fail(400, 'Choose a training date within the last 14 days, not in the future.');
    if (!Array.isArray(partners) || !partners.length || partners.length > 20) fail(400, 'Add between 1 and 20 partners.');
    const seen = new Set();
    const validated = partners.map(p => {
      if (!p || !Number.isInteger(p.opponentId) || p.opponentId === id || seen.has(p.opponentId)) fail(400, 'Choose a different, unique partner for each row.');
      if (!db.prepare('SELECT 1 FROM fighters WHERE id = ?').get(p.opponentId)) fail(404, 'Partner no longer exists.');
      seen.add(p.opponentId); return { ...p, values: counts(p) };
    });
    const ids = transaction(() => validated.map(p => {
      const a = Math.min(id,p.opponentId), b = Math.max(id,p.opponentId);
      if (db.prepare('SELECT 1 FROM roll_recaps WHERE fighter_a_id = ? AND fighter_b_id = ? AND roll_date = ?').get(a,b,date)) fail(409, 'A recap already exists for one of these partners on that date. Review it in Recaps; nothing in this batch was saved.');
      const [wins,losses,noWinner] = p.values;
      return Number(db.prepare(`INSERT INTO roll_recaps (fighter_a_id,fighter_b_id,roll_date,wins_a,wins_b,no_winner,proposed_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(a,b,date,id === a ? wins : losses,id === a ? losses : wins,noWinner,id,Date.now(),Date.now()+14*DAY).lastInsertRowid);
    }));
    sendJson(res,201,{ ids });
  }));
  router.post('/api/recaps/:id/review', route((req,res,{params,body},id) => {
    transaction(() => {
      const r = db.prepare('SELECT * FROM roll_recaps WHERE id = ?').get(params.id);
      if (!r || ![r.fighter_a_id,r.fighter_b_id].includes(id)) fail(404,'Recap not found.');
      if (r.status !== 'pending' || r.version !== body.version) fail(409,'This recap changed or is closed. Refresh before reviewing.');
      if (!['confirm','correct','skip','withdraw'].includes(body.action)) fail(400,'Choose a valid action.');
      if (body.action === 'withdraw') {
        if (r.proposed_by !== id) fail(403,'Only the person who proposed these results can withdraw them.');
        db.prepare("UPDATE roll_recaps SET status = 'withdrawn', version = version + 1 WHERE id = ?").run(r.id); return;
      }
      if (r.proposed_by === id) fail(403,'Your partner must review your proposed results.');
      if (body.action === 'skip') {
        db.prepare("UPDATE roll_recaps SET status = 'unverified', version = version + 1 WHERE id = ?").run(r.id); return;
      }
      if (body.action === 'correct') {
        const [wins,losses,noWinner] = counts(body);
        db.prepare('UPDATE roll_recaps SET wins_a = ?, wins_b = ?, no_winner = ?, proposed_by = ?, version = version + 1 WHERE id = ?').run(id === r.fighter_a_id ? wins : losses,id === r.fighter_a_id ? losses : wins,noWinner,id,r.id); return;
      }
      const a = db.prepare('SELECT * FROM fighters WHERE id = ?').get(r.fighter_a_id);
      const b = db.prepare('SELECT * FROM fighters WHERE id = ?').get(r.fighter_b_id);
      if (!a || !b) fail(409,'A participant no longer has an account.');
      // Counts do not tell us round order. Rate each decisive round against the same
      // pre-recap ratings, then sum changes so invented chronology cannot affect Elo.
      let changeA = 0, changeB = 0;
      for (const [winner,n] of [['A',r.wins_a],['B',r.wins_b]]) {
        const result = computeEloUpdate(a.elo,b.elo,a.matches_played,b.matches_played,winner);
        for (let i=0;i<n;i++) {
          db.prepare(`INSERT INTO matches (fighter_a_id,fighter_b_id,status,winner,pre_elo_a,pre_elo_b,elo_change_a,elo_change_b,created_at,resolved_at,recap_id) VALUES (?,?,'resolved',?,?,?,?,?,?,?,?)`).run(a.id,b.id,winner,a.elo,b.elo,result.changeA,result.changeB,Date.parse(r.roll_date+'T12:00:00Z'),Date.now(),r.id);
          changeA += result.changeA; changeB += result.changeB;
        }
      }
      const total = r.wins_a+r.wins_b;
      db.prepare('UPDATE fighters SET elo = elo + ?, matches_played = matches_played + ? WHERE id = ?').run(changeA,total,a.id);
      db.prepare('UPDATE fighters SET elo = elo + ?, matches_played = matches_played + ? WHERE id = ?').run(changeB,total,b.id);
      db.prepare("UPDATE roll_recaps SET status = 'confirmed', confirmed_at = ?, version = version + 1 WHERE id = ?").run(Date.now(),r.id);
    });
    sendJson(res,200,{ok:true});
  }));
};
