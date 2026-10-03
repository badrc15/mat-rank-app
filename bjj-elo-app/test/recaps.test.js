const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
test('after-training recap workflow',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recap-test-'));process.env.DATA_DIR=dir;
 const db=require('../server/db');const auth=require('../server/auth');
 const hash=await auth.hashPassword('test-only-long-passphrase');
 const ids=['Alex','Blair','Casey'].map(name=>Number(db.prepare('INSERT INTO fighters (username,password_hash,salt,created_at) VALUES (?,?,?,?)').run(name,hash.hash,hash.salt,Date.now()).lastInsertRowid));
 const cookies=ids.map(id=>'matrank_session='+auth.createSession(id));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let child,port;
 async function start(){child=spawn(process.execPath,['server/index.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('server exited'));});child.stdout.on('data',x=>{const m=x.toString().match(/port (\d+)/);if(m){port=m[1];clearTimeout(timer);resolve();}});});}
 async function stop(){await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 async function req(url,who=0,body,method){const r=await fetch(`http://127.0.0.1:${port}${url}`,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Matrank-Request':'1',...(who===null?{}:{Cookie:cookies[who]})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
 const payload=(opponentId,wins=1,losses=0,noWinner=0)=>({date:today,partners:[{opponentId,wins,losses,noWinner}]});
 let recap;
 try {await start();
 await t.test('direct batch logging requires no advance request and no Elo changes',async()=>{
  assert.equal((await req('/api/recaps',null,payload(ids[1]))).status,401);
  let result=await req('/api/recaps',0,{date:today,partners:[{opponentId:ids[1],wins:2,losses:0,noWinner:1},{opponentId:ids[2],wins:0,losses:0,noWinner:2}]});
  assert.equal(result.status,201);recap=result.body.ids[0];assert.equal(result.body.ids.length,2);
  assert.equal(db.prepare('SELECT elo FROM fighters WHERE id=?').get(ids[0]).elo,500);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM matches').get().n,0);
 });
 await t.test('duplicate reciprocal logs and invalid rows cannot partially save',async()=>{
  assert.equal((await req('/api/recaps',1,payload(ids[0]))).status,409);
  assert.equal((await req('/api/recaps',0,payload(ids[0]))).status,400);
  assert.equal((await req('/api/recaps',1,payload(ids[2],1.5))).status,400);
  assert.equal((await req('/api/recaps',1,{date:today,partners:[{opponentId:ids[2],wins:1,losses:0,noWinner:0},{opponentId:ids[0],wins:1,losses:0,noWinner:0}]})).status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM roll_recaps').get().n,2);
  assert.equal((await req('/api/recaps',1,{...payload(ids[2]),date:'2099-01-01'})).status,400);
 });
 await t.test('participant privacy and proposer cannot confirm own results',async()=>{
  assert.equal((await req(`/api/recaps/${recap}/review`,0,{action:'confirm',version:1})).status,403);
  assert.equal((await req(`/api/recaps/${recap}/review`,2,{action:'confirm',version:1})).status,404);
  const b=await req('/api/recaps',1);assert.equal(b.body.recaps[0].wins,0);assert.equal(b.body.recaps[0].losses,2);assert.equal(b.body.recaps[0].needsReview,true);
  assert.equal((await req('/api/recaps',2)).body.recaps.some(r=>r.id===recap),false);
 });
 await t.test('corrections reverse review direction and reject stale confirmation',async()=>{
  assert.equal((await req(`/api/recaps/${recap}/review`,1,{action:'correct',version:1,wins:0,losses:1,noWinner:2})).status,200);
  assert.equal((await req(`/api/recaps/${recap}/review`,1,{action:'confirm',version:2})).status,403);
  assert.equal((await req(`/api/recaps/${recap}/review`,0,{action:'confirm',version:1})).status,409);
  assert.equal(db.prepare('SELECT elo FROM fighters WHERE id=?').get(ids[0]).elo,500);
 });
 await t.test('confirmation updates Elo once and excludes no-winner rounds',async()=>{
  assert.equal((await req(`/api/recaps/${recap}/review`,0,{action:'confirm',version:2})).status,200);
  assert.equal((await req(`/api/recaps/${recap}/review`,0,{action:'confirm',version:2})).status,409);
  assert.equal(db.prepare('SELECT elo FROM fighters WHERE id=?').get(ids[0]).elo,525);
  assert.equal(db.prepare('SELECT matches_played FROM fighters WHERE id=?').get(ids[0]).matches_played,1);
  const other=db.prepare('SELECT * FROM roll_recaps WHERE fighter_b_id=?').get(ids[2]);
  assert.equal((await req(`/api/recaps/${other.id}/review`,2,{action:'confirm',version:1})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM matches').get().n,1);
 });
 await t.test('recaps persist over server restart and appear in account export',async()=>{
  await stop();await start();assert.equal((await req('/api/recaps')).body.recaps.length,2);
  assert.equal((await req('/api/me/export')).body.recaps.length,2);
 });
 await t.test('not remembered and expired recaps never affect Elo or block logging',async()=>{
  let r=await req('/api/recaps',1,payload(ids[2]));let mid=r.body.ids[0];
  assert.equal((await req(`/api/recaps/${mid}/review`,2,{action:'skip',version:1})).status,200);
  assert.equal(db.prepare('SELECT elo FROM fighters WHERE id=?').get(ids[2]).elo,500);
  const date=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  r=await req('/api/recaps',1,{...payload(ids[2]),date});mid=r.body.ids[0];db.prepare('UPDATE roll_recaps SET expires_at=0 WHERE id=?').run(mid);
  assert.equal((await req(`/api/recaps/${mid}/review`,2,{action:'confirm',version:1})).status,409);
  assert.equal(db.prepare('SELECT status FROM roll_recaps WHERE id=?').get(mid).status,'expired');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM matches').get().n,1);
 });
 await t.test('old scheduling and independent result endpoints cannot bypass agreement',async()=>{
  assert.equal((await req('/api/requests',0,{toId:ids[1]})).status,404);
  assert.equal((await req('/api/matches/1/result',0,{outcome:'win',method:'submission'})).status,404);
 });
 }finally{if(child)await stop();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
