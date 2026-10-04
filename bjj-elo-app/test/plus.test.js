const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
test('Plus privacy, persistence, analytics and payment access',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'matrank-plus-'));process.env.DATA_DIR=dir;process.env.STRIPE_PRICE_MONTHLY='price_month';process.env.STRIPE_PRICE_YEARLY='price_year';process.env.STRIPE_MODE='test';
 const db=require('../server/db'),auth=require('../server/auth'),billing=require('../server/billing');
 const hash=await auth.hashPassword('long-test-only-passphrase');
 const ids=['Plus User','Free User'].map((name,i)=>Number(db.prepare('INSERT INTO fighters(username,password_hash,salt,email,email_verified_at,created_at) VALUES(?,?,?,?,?,?)').run(name,hash.hash,hash.salt,`user${i}@example.test`,Date.now(),Date.now()).lastInsertRowid));
 const cookies=ids.map(id=>'matrank_session='+auth.createSession(id));
 db.prepare('INSERT INTO billing_customers(fighter_id,customer_id) VALUES (?,?)').run(ids[0],'cus_plus');
 const until=Math.floor(Date.now()/1000)+3600;
 let current={id:'sub_plus',customer:'cus_plus',status:'active',items:{data:[{price:{id:'price_month'},current_period_end:until}]},latest_invoice:{status:'paid'},cancel_at_period_end:false},retrievals=0;
 const service=billing.createBilling({subscriptions:{retrieve:async()=>{retrievals++;return structuredClone(current);}}});
 let child,port;
 async function start(){child=spawn(process.execPath,['server/index.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',NODE_ENV:'test',STRIPE_SECRET_KEY:'',BILLING_ENABLED:'false'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited'));});child.stdout.on('data',x=>{const m=x.toString().match(/port (\d+)/);if(m){port=m[1];clearTimeout(timer);resolve();}});});}
 async function stop(){await new Promise(r=>{child.once('exit',r);child.kill();});}
 async function req(route,who=0,body,method){const r=await fetch(`http://127.0.0.1:${port}${route}`,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Matrank-Request':'1',...(who===null?{}:{Cookie:cookies[who]})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 const event=(id,type='customer.subscription.updated')=>({id,type,livemode:false,data:{object:{id:'sub_plus',customer:'cus_plus'}}});
 try{await start();
 await t.test('payment-gated endpoints reject anonymous and free users',async()=>{
  assert.equal((await req('/api/plus',null)).status,401);assert.equal((await req('/api/plus',1)).status,403);assert.equal((await req('/api/plus/style',1,{theme:'gold',banner:'classic'})).status,403);
  assert.equal((await req('/api/billing/checkout',0,{plan:'monthly',acceptTerms:true,startNow:true,termsVersion:billing.VERSION})).status,503);
  assert.equal((await req('/api/plus/status')).data.plus,false);
 });
 await t.test('payment state is fetched and duplicate events are idempotent',async()=>{
  await service.processEvent(event('evt_paid'));assert.equal(billing.status(ids[0]).plus,true);const n=retrievals;await service.processEvent(event('evt_paid'));assert.equal(retrievals,n);
  await assert.rejects(service.processEvent({...event('evt_live'),livemode:true}));
  current.latest_invoice={status:'open'};current.items.data[0].current_period_end=until+3600;await service.processEvent(event('evt_failed'));assert.equal(billing.status(ids[0]).paidUntil,until*1000);
 });
 await t.test('photos validate, stay authenticated, export and persist',async()=>{
  const sharp=require('sharp');const png=await sharp({create:{width:800,height:600,channels:3,background:'#267a82'}}).png().toBuffer();const image='data:image/png;base64,'+png.toString('base64');
  assert.equal((await req('/api/me/avatar',null,{image})).status,401);
  assert.equal((await req('/api/me/avatar',1,{image:'data:image/svg+xml;base64,PHN2Zy8+'})).status,400);
  assert.equal((await req('/api/me/avatar',1,{image:'data:image/png;base64,ZmFrZQ=='})).status,400);
  assert.equal((await req('/api/me/avatar',1,{image})).status,200);
  const f=(await req('/api/me',1)).data.fighter;assert.ok(f.avatarUrl);assert.equal((await req('/api/me')).data.fighter.avatarUrl,null);
  let r=await fetch('http://127.0.0.1:'+port+f.avatarUrl);assert.equal(r.status,401);
  r=await fetch('http://127.0.0.1:'+port+f.avatarUrl,{headers:{Cookie:cookies[0]}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/webp');
  const meta=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.exif,undefined);
  assert.match((await req('/api/me/export',1)).data.photo,/^data:image\/webp;base64,/);
  await stop();await start();assert.equal((await req('/api/me',1)).data.fighter.avatarUrl,f.avatarUrl);
  assert.equal((await req('/api/me/avatar',1,{},'DELETE')).status,200);assert.equal((await req('/api/me',1)).data.fighter.avatarUrl,null);
 });
 const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);let noteId;
 await t.test('journal is private, validates dates, permits edits, and exports',async()=>{
  assert.equal((await req('/api/plus/journal',0,{day:'2026-02-31',technique:'Guard',notes:'Private',nextFocus:''})).status,400);
  assert.equal((await req('/api/plus/journal',0,{day,technique:'Guard',notes:'Private <script>note</script>',nextFocus:'Frames'})).status,200);
  noteId=(await req('/api/plus')).data.journals[0].id;
  assert.equal((await req('/api/me/journal',1)).data.entries.length,0);
  assert.equal((await req('/api/plus/journal/'+noteId,1,{},'DELETE')).status,404);
  assert.equal((await req('/api/plus/journal',0,{id:noteId,day,technique:'Guard',notes:'Updated private note',nextFocus:'Frames'})).status,200);
  assert.equal((await req('/api/me/export')).data.journal[0].notes,'Updated private note');
  assert.equal(JSON.stringify((await req('/api/fighters',1)).data).includes('private note'),false);
 });
 await t.test('confirmed recaps aggregate rating points without inventing round order',async()=>{
  await req('/api/me/log-training',0,{});await req('/api/me/log-training',0,{});
  const r=await req('/api/recaps',0,{date:day,partners:[{opponentId:ids[1],wins:2,losses:1,noWinner:2}]});
  assert.equal((await req('/api/recaps/'+r.data.ids[0]+'/review',1,{action:'confirm',version:1})).status,200);
  const report=(await req('/api/plus?month='+month)).data;
  assert.equal(report.current.trainingDays,1);assert.equal(report.current.wins,2);assert.equal(report.current.losses,1);assert.equal(report.current.noWinner,2);assert.equal(report.history.length,1);assert.equal(report.history[0].rating,report.currentRating);assert.equal(report.rivals[0].history.length,3);
 });
 await t.test('goals and styles validate and persist across restart',async()=>{
  assert.equal((await req('/api/plus/goals',0,{title:'Train consistently',target:8,month})).status,200);
  assert.equal((await req('/api/plus/style',0,{theme:'red;url(evil)',banner:'classic'})).status,400);
  assert.equal((await req('/api/plus/style',0,{theme:'ocean',banner:'aurora',background:'tatami',feed:'spotlight'})).status,200);
  await stop();await start();const data=(await req('/api/plus')).data;assert.equal(data.journals.length,1);assert.equal(data.goals.length,1);assert.equal(data.style.theme,'ocean');assert.equal(data.style.background,'tatami');assert.equal(data.style.feed,'spotlight');
 });
 await t.test('cancellation revokes Plus and replayed older events cannot restore it',async()=>{
  current.status='canceled';await service.processEvent(event('evt_cancel'));assert.equal(billing.status(ids[0]).plus,false);
  await service.processEvent(event('evt_delayed_old'));assert.equal(billing.status(ids[0]).plus,false);
  assert.equal((await req('/api/plus')).status,403);assert.equal((await req('/api/me/journal')).data.entries.length,1);
  assert.equal((await req('/api/me')).data.fighter.style,null);
  assert.equal((await req('/api/plus/journal/'+noteId,0,{},'DELETE')).status,200);
 });
 await t.test('wrong price and expired subscriptions never unlock Plus',async()=>{
  current.status='active';current.latest_invoice.status='paid';current.items.data[0].price.id='price_other';await service.syncSubscription('sub_plus');assert.equal(billing.status(ids[0]).plus,false);
  current.items.data[0].price.id='price_month';current.items.data[0].current_period_end=1;await service.syncSubscription('sub_plus');assert.equal(billing.status(ids[0]).plus,false);
 });
 }finally{await stop();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
