const db = require('./db');
const { status } = require('./billing');
function dateValid(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
function monthValid(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function report(id, month) {
  const fighter = db.prepare('SELECT * FROM fighters WHERE id=?').get(id);
  const matches = db.prepare("SELECT * FROM matches WHERE status='resolved' AND (fighter_a_id=? OR fighter_b_id=?) ORDER BY resolved_at,id").all(id,id);
  const rows = matches.map(m => {const a=m.fighter_a_id===id;return { id:m.id,recapId:m.recap_id,date:new Date(m.created_at).toISOString().slice(0,10),confirmedAt:m.resolved_at,opponentId:a?m.fighter_b_id:m.fighter_a_id,win:m.winner===(a?'A':'B'),delta:(a?m.elo_change_a:m.elo_change_b)||0,pre:a?m.pre_elo_a:m.pre_elo_b };});
  const training = new Set(db.prepare('SELECT day FROM training_days WHERE fighter_id=?').all(id).map(r=>r.day));
  const recaps = db.prepare("SELECT * FROM roll_recaps WHERE status='confirmed' AND (fighter_a_id=? OR fighter_b_id=?)").all(id,id);
  for (const r of recaps) training.add(r.roll_date);
  const journals = db.prepare('SELECT * FROM journal_entries WHERE fighter_id=? ORDER BY day DESC,id DESC LIMIT 300').all(id);
  const goals = db.prepare('SELECT * FROM training_goals WHERE fighter_id=? AND month=? ORDER BY id').all(id,month);
  function summary(m) {
    const selected=rows.filter(r=>r.date.startsWith(m));
    return { month:m,trainingDays:[...training].filter(d=>d.startsWith(m)).length,wins:selected.filter(r=>r.win).length,losses:selected.filter(r=>!r.win).length,ratedRounds:selected.length,ratingChange:selected.reduce((n,r)=>n+r.delta,0),noWinner:recaps.filter(r=>r.roll_date.startsWith(m)).reduce((n,r)=>n+r.no_winner,0),partners:new Set(selected.map(r=>r.opponentId)).size };
  }
  const prior = new Date(month+'-01T12:00:00Z');prior.setUTCMonth(prior.getUTCMonth()-1);
  const rivals = new Map();
  for (const r of rows) {
    if (!rivals.has(r.opponentId)) rivals.set(r.opponentId,{opponentId:r.opponentId,name:db.prepare('SELECT username FROM fighters WHERE id=?').get(r.opponentId)?.username||'Deleted account',wins:0,losses:0,ratingChange:0,history:[]});
    const v=rivals.get(r.opponentId);v[r.win?'wins':'losses']++;v.ratingChange+=r.delta;v.history.push(r);
  }
  // A recap's rounds share a starting rating. Plot its summed change, not invented round order.
  const groups=new Map();
  for (const r of rows) {
    const legacyRecap = !r.recapId && recaps.find(c=>c.roll_date===r.date && (c.fighter_a_id===r.opponentId || c.fighter_b_id===r.opponentId));
    const key = r.recapId || legacyRecap ? 'recap:'+(r.recapId||legacyRecap.id) : 'match:'+r.id;
    if(!groups.has(key))groups.set(key,{at:r.confirmedAt,pre:r.pre,change:0});groups.get(key).change+=r.delta;
  }
  const history=[...groups.values()].filter(r=>Number.isFinite(r.pre)).map(r=>({at:r.at,rating:r.pre+r.change}));
  const milestones=[{label:'First confirmed round',achieved:rows.length>=1},{label:'30 confirmed rounds',achieved:rows.length>=30},{label:'100 confirmed rounds',achieved:rows.length>=100},{label:'10 recorded training days',achieved:training.size>=10},{label:'5 training partners',achieved:rivals.size>=5}];
  return { current:summary(month),previous:summary(prior.toISOString().slice(0,7)),currentRating:fighter.elo,history,milestones,rivals:[...rivals.values()].sort((a,b)=>(b.wins+b.losses)-(a.wins+a.losses)),journals,goals,style:db.prepare('SELECT theme,banner,background,feed FROM profile_styles WHERE fighter_id=?').get(id)||{theme:'gold',banner:'classic'} };
}
function publicStyle(id) { return status(id).plus ? db.prepare('SELECT theme,banner,background,feed FROM profile_styles WHERE fighter_id=?').get(id) || null : null; }
module.exports={report,dateValid,monthValid,publicStyle};
