const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
test('verified email signup and single-use account recovery',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'matrank-email-'));let child,db,port;
 const password='a private test passphrase only';let cookie,token;
 async function start(extra={}){child=spawn(process.execPath,['server/index.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',DATA_DIR:dir,NODE_ENV:'test',MAIL_TRANSPORT:'file',...extra},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timed out')),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited'));});child.stdout.on('data',chunk=>{const m=chunk.toString().match(/port (\d+)/);if(m){port=m[1];clearTimeout(timer);resolve();}});});}
 async function stop(){if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 async function req(route,body,cookie){const r=await fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Matrank-Request':'1',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 function messages(){const folder=path.join(dir,'mail-test');return fs.existsSync(folder)?fs.readdirSync(folder).map(f=>JSON.parse(fs.readFileSync(path.join(folder,f),'utf8'))):[];}
 function link(kind,email){return messages().filter(m=>m.to===email).map(m=>m.text.match(new RegExp('#'+kind+'=([a-f0-9]{64})'))).filter(Boolean).map(m=>m[1]);}
 const registration={username:'Email Fighter',email:'Person@Example.test',password,adult:true,acceptTerms:true,termsVersion:'2026-10-03',privacyVersion:'2026-10-03'};
 try{
  await start();db=new DatabaseSync(path.join(dir,'matrank.db'));
  await t.test('adult confirmation and valid email are mandatory',async()=>{
   assert.equal((await req('/api/register',{...registration,adult:false})).status,400);
   assert.equal((await req('/api/register',{...registration,email:'bad'})).status,400);
  });
  await t.test('unverified signup cannot authenticate and tokens are not returned',async()=>{
   const r=await req('/api/register',registration);assert.equal(r.status,202);assert.equal(r.cookie,undefined);assert.equal(r.data.token,undefined);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM fighters').get().n,0);
   assert.equal((await req('/api/login',{email:registration.email,password})).status,401);
   token=link('verify','person@example.test')[0];assert.equal(token.length,64);
   assert.notEqual(db.prepare('SELECT token_hash FROM email_verifications').get().token_hash,token);
  });
  await t.test('verification is single use and email login is case insensitive',async()=>{
   assert.equal((await req('/api/verify-email',{token})).status,200);
   assert.equal((await req('/api/verify-email',{token})).status,400);
   const login=await req('/api/login',{email:'PERSON@example.test',password});assert.equal(login.status,200);cookie=login.cookie;
   assert.equal((await req('/api/login',{email:registration.username,password})).status,401);
   assert.ok(db.prepare('SELECT adult_confirmed_at FROM fighters').get().adult_confirmed_at);
   assert.equal((await req('/api/fighters',null,cookie)).data.fighters[0].email,undefined);
   assert.equal((await req('/api/me/email',null,cookie)).data.email,'person@example.test');
  });
  await t.test('duplicate signup does not overwrite a verified account',async()=>{
   const n=messages().length;
   assert.equal((await req('/api/register',{...registration,username:'Different',password:password+' changed'})).status,202);
   assert.equal(messages().length,n);assert.equal(db.prepare('SELECT COUNT(*) n FROM fighters').get().n,1);
  });
  await t.test('reset response is generic and expiry rejects old links',async()=>{
   const known=await req('/api/forgot-password',{email:'person@example.test'}),unknown=await req('/api/forgot-password',{email:'nobody@example.test'});
   assert.equal(known.status,202);assert.deepEqual(known.data,unknown.data);
   token=link('reset','person@example.test')[0];assert.ok(token);
   assert.notEqual(db.prepare('SELECT token_hash FROM password_resets').get().token_hash,token);
   db.prepare('UPDATE password_resets SET expires_at=0').run();
   assert.equal((await req('/api/reset-password',{token,password:password+' new'})).status,400);
  });
  await t.test('reset survives restart, revokes sessions and permits only one concurrent use',async()=>{
   await req('/api/forgot-password',{email:'person@example.test'});
   token=link('reset','person@example.test').find(value=>require('node:crypto').createHash('sha256').update(value).digest('hex')===db.prepare('SELECT token_hash FROM password_resets WHERE expires_at>0').get().token_hash);
   await stop();await start();
   const results=await Promise.all([req('/api/reset-password',{token,password:password+' new'}),req('/api/reset-password',{token,password:password+' other'})]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
   const newPassword=results[0].status===200?password+' new':password+' other';
   assert.equal((await req('/api/me',null,cookie)).status,401);
   assert.equal((await req('/api/login',{email:registration.email,password})).status,401);
   const login=await req('/api/login',{email:registration.email,password:newPassword});assert.equal(login.status,200);cookie=login.cookie;
   assert.equal((await req('/api/reset-password',{token,password:password+' again'})).status,400);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM password_resets').get().n,0);
  });
  await t.test('existing-account email is private and cannot be replaced through signup',async()=>{
   assert.equal((await req('/api/me/email')).status,401);
   assert.equal((await req('/api/me/email',{email:'attacker@example.test',password},cookie)).status,409);
   assert.equal((await req('/api/me/email',null,cookie)).data.email,'person@example.test');
  });
  await t.test('reset rate limit is durable and signup fails closed without mail',async()=>{
   await req('/api/forgot-password',{email:'person@example.test'});
   assert.equal((await req('/api/forgot-password',{email:'person@example.test'})).status,429);
   await stop();await start({MAIL_TRANSPORT:'none',RESEND_API_KEY:'',SIGNUPS_ENABLED:'true'});
   assert.equal((await req('/api/config')).data.signupsEnabled,false);
   assert.equal((await req('/api/register',registration)).status,503);
   assert.equal((await req('/api/forgot-password',{email:'person@example.test'})).status,503);
  });
 }finally{await stop();if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
