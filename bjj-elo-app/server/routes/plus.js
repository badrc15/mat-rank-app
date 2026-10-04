const db=require('../db');
const {requireAuth}=require('../auth');
const {sendJson}=require('../router');
const billing=require('../billing');
const {report,dateValid,monthValid}=require('../plus');
const {rateLimit}=require('../security');
function identify(req,res,premium=false) {const id=requireAuth(req);if(!id){sendJson(res,401,{error:'Not authenticated'});return null;}if(premium&&!billing.status(id).plus){sendJson(res,403,{error:'An active Mat Rank Plus subscription is required.'});return null;}return id;}
function text(value,max) {return typeof value==='string'&&value.length<=max ? value.trim() : null;}
module.exports=function(router){
 router.get('/api/plus/status',async(req,res)=>{const id=identify(req,res);if(id)sendJson(res,200,billing.status(id));});
 router.get('/api/plus',async(req,res,{query})=>{const id=identify(req,res,true);if(!id)return;const month=query.month||new Date().toISOString().slice(0,7);if(!monthValid(month))return sendJson(res,400,{error:'Choose a valid month.'});sendJson(res,200,report(id,month));});
 router.post('/api/billing/checkout',async(req,res,{body})=>{
  const id=identify(req,res);if(!id)return;
  if(!billing.enabled())return sendJson(res,503,{error:'Subscriptions are not open yet. No payment has been taken.'});
  if(body.acceptTerms!==true||body.startNow!==true||body.termsVersion!==billing.VERSION)return sendJson(res,400,{error:'Please accept the Plus terms and request immediate access.'});
  if(rateLimit(req,res,'checkout',8,3600000,String(id)))return;
  try{sendJson(res,200,{url:await billing.createBilling(billing.stripe()).checkout(id,body.plan)});}catch(e){sendJson(res,e.status||503,{error:e.status?e.message:'Checkout is unavailable. Please try again later.'});}
 });
 router.post('/api/billing/portal',async(req,res)=>{const id=identify(req,res);if(!id)return;if(rateLimit(req,res,'portal',20,3600000,String(id)))return;try{sendJson(res,200,{url:await billing.createBilling(billing.stripe()).portal(id)});}catch(e){sendJson(res,e.status||503,{error:e.status?e.message:'Subscription management is temporarily unavailable. Contact support to cancel.'});}});
 router.post('/api/plus/journal',async(req,res,{body})=>{
  const id=identify(req,res,true);if(!id)return;
  const technique=text(body.technique,120),notes=text(body.notes,4000),focus=text(body.nextFocus,500);
  if(!dateValid(body.day)||body.day>new Date().toISOString().slice(0,10)||technique===null||notes===null||focus===null||(!technique&&!notes&&!focus))return sendJson(res,400,{error:'Enter a valid training date and a note within the character limits.'});
  if(body.id!==undefined){const result=db.prepare('UPDATE journal_entries SET day=?,technique=?,notes=?,next_focus=?,updated_at=? WHERE id=? AND fighter_id=?').run(body.day,technique,notes,focus,Date.now(),body.id,id);if(!result.changes)return sendJson(res,404,{error:'Entry not found.'});}
  else {if(db.prepare('SELECT COUNT(*) n FROM journal_entries WHERE fighter_id=?').get(id).n>=300)return sendJson(res,400,{error:'Your journal holds 300 entries. Export and remove older entries to make room.'});db.prepare('INSERT INTO journal_entries(fighter_id,day,technique,notes,next_focus,updated_at) VALUES (?,?,?,?,?,?)').run(id,body.day,technique,notes,focus,Date.now());}
  sendJson(res,200,{ok:true});
 });
 // Existing notes remain readable, exportable and removable after a subscription ends.
 router.get('/api/me/journal',async(req,res)=>{const id=identify(req,res);if(id)sendJson(res,200,{entries:db.prepare('SELECT * FROM journal_entries WHERE fighter_id=? ORDER BY day DESC,id DESC').all(id)});});
 router.del('/api/plus/journal/:id',async(req,res,{params})=>{const id=identify(req,res);if(!id)return;const result=db.prepare('DELETE FROM journal_entries WHERE id=? AND fighter_id=?').run(params.id,id);sendJson(res,result.changes?200:404,result.changes?{ok:true}:{error:'Entry not found.'});});
 router.post('/api/plus/goals',async(req,res,{body})=>{const id=identify(req,res,true);if(!id)return;const title=text(body.title,120);if(!title||!monthValid(body.month)||!Number.isInteger(body.target)||body.target<1||body.target>31)return sendJson(res,400,{error:'Add a goal and a target of 1–31 training days for a valid month.'});if(db.prepare('SELECT COUNT(*) n FROM training_goals WHERE fighter_id=? AND month=?').get(id,body.month).n>=5)return sendJson(res,400,{error:'Keep up to five goals per month.'});db.prepare('INSERT INTO training_goals(fighter_id,title,target,month) VALUES (?,?,?,?)').run(id,title,body.target,body.month);sendJson(res,200,{ok:true});});
 router.del('/api/plus/goals/:id',async(req,res,{params})=>{const id=identify(req,res);if(!id)return;const r=db.prepare('DELETE FROM training_goals WHERE id=? AND fighter_id=?').run(params.id,id);sendJson(res,r.changes?200:404,r.changes?{ok:true}:{error:'Goal not found.'});});
 router.post('/api/plus/style',async(req,res,{body})=>{const id=identify(req,res,true);if(!id)return;if(!['gold','ocean','violet','forest'].includes(body.theme)||!['classic','summit','rivalry','aurora','tatami','ember'].includes(body.banner)||!['classic','tatami','midnight','aurora'].includes(body.background||'classic')||!['classic','spotlight','contender','minimal'].includes(body.feed||'classic'))return sendJson(res,400,{error:'Choose one of the available styles.'});db.prepare('INSERT INTO profile_styles(fighter_id,theme,banner,background,feed) VALUES (?,?,?,?,?) ON CONFLICT(fighter_id) DO UPDATE SET theme=excluded.theme,banner=excluded.banner,background=excluded.background,feed=excluded.feed').run(id,body.theme,body.banner,body.background||'classic',body.feed||'classic');sendJson(res,200,{ok:true});});
};
