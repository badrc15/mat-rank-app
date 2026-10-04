const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
test('checkout ownership, duplicate protection and signed webhooks',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'billing-test-'));process.env.DATA_DIR=dir;process.env.STRIPE_PRICE_MONTHLY='price_month';process.env.STRIPE_PRICE_YEARLY='price_year';process.env.APP_ORIGIN='https://matrank.example';process.env.STRIPE_PORTAL_CONFIGURATION='bpc_test';process.env.STRIPE_MODE='test';
 // Dummy SDK credential; no network calls are made in this suite.
 process.env.STRIPE_SECRET_KEY='test-only-dummy';process.env.STRIPE_WEBHOOK_SECRET='test-only-signing-secret';
 const db=require('../server/db'),billing=require('../server/billing');
 db.prepare("INSERT INTO fighters(id,username,password_hash,salt,email,email_verified_at,created_at) VALUES(1,'Member','unused','unused','member@example.test',1,1)").run();
 let creations=0,sessionBody,customerBody,subscriptions=[];
 const fake={customers:{create:async data=>{customerBody=data;return{id:'cus_member'};}},subscriptions:{list:async()=>({data:subscriptions})},prices:{retrieve:async id=>({id,active:true,currency:'gbp',unit_amount:299,recurring:{interval:'month',interval_count:1}})},checkout:{sessions:{create:async data=>{creations++;sessionBody=data;return{id:'cs_member',url:'https://checkout.stripe.com/test'};},retrieve:async()=>({status:'open',url:'https://checkout.stripe.com/test'})}},billingPortal:{sessions:{create:async data=>({url:'https://billing.stripe.com/'+data.customer})}}};
 const service=billing.createBilling(fake);
 let server;
 try{
 await t.test('server-owned amount and customer, concurrent checkout reused',async()=>{
  const result=await Promise.all([service.checkout(1,'monthly'),service.checkout(1,'monthly')]);assert.equal(creations,1);assert.equal(result[0],result[1]);assert.equal(customerBody.email,'member@example.test');assert.equal(sessionBody.customer,'cus_member');assert.deepEqual(sessionBody.line_items,[{price:'price_month',quantity:1}]);assert.equal(sessionBody.mode,'subscription');assert.equal(sessionBody.managed_payments.enabled,false);assert.equal(sessionBody.payment_method_types,undefined);assert.match(sessionBody.integration_identifier,/^matrank_plus_[a-z]{8}$/);assert.equal(billing.status(1).plus,false);
  await assert.rejects(service.checkout(1,'free'),/valid plan/);await assert.rejects(service.checkout(1,'yearly'),/open checkout/);
 });
 await t.test('existing subscriptions block checkout and portal is account-bound',async()=>{
  subscriptions=[{id:'sub_existing',status:'active'}];await assert.rejects(service.checkout(1,'monthly'),/already have/);assert.equal(await service.portal(1),'https://billing.stripe.com/cus_member');await assert.rejects(service.portal(999),/No subscription/);
 });
 await t.test('lost checkout responses reuse identical stored parameters and key',async()=>{
  db.prepare("INSERT INTO fighters(id,username,password_hash,salt,email,email_verified_at,created_at) VALUES(2,'Retry Member','unused','unused','retry@example.test',1,2)").run();
  subscriptions=[];let attempts=[];
  const retryApi={...fake,customers:{create:async()=>({id:'cus_retry'})},checkout:{sessions:{create:async(body,options)=>{attempts.push({body,options});if(attempts.length===1)throw new Error('Simulated lost response');return{id:'cs_retry',url:'https://checkout.stripe.com/retry'};}}}};
  await assert.rejects(billing.createBilling(retryApi).checkout(2,'monthly'),/lost response/);
  await billing.createBilling(retryApi).checkout(2,'monthly');assert.deepEqual(attempts[0],attempts[1]);assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_checkout_attempts').get().n,0);
 });
 await t.test('account deletion expires checkout and stops subscriptions before deleting mappings',async()=>{
  const cancelled=[],expired=[];
  const deletionApi={checkout:{sessions:{retrieve:async()=>({id:'cs_member',status:'open'}),expire:async id=>expired.push(id)}},subscriptions:{list:()=>({async *[Symbol.asyncIterator](){yield{id:'sub_active',status:'active'};yield{id:'sub_old',status:'canceled'};}}),cancel:async id=>cancelled.push(id)}};
  await billing.createBilling(deletionApi).cancelForDeletion(1);assert.deepEqual(expired,['cs_member']);assert.deepEqual(cancelled,['sub_active']);assert.equal(db.prepare('SELECT deleting FROM billing_customers WHERE fighter_id=1').get().deleting,1);await assert.rejects(service.checkout(1,'monthly'),/deletion is pending/);
 });
 await t.test('raw webhook signature rejects forged, tampered and expired payloads',async()=>{
  server=http.createServer(billing.webhook);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const raw=JSON.stringify({id:'evt_signature',type:'ignored.event',livemode:false,data:{object:{}}});const stripe=billing.stripe();
  const sign=(payload,timestamp=Math.floor(Date.now()/1000))=>stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET,timestamp});
  const post=(body,signature)=>fetch(url,{method:'POST',headers:{'stripe-signature':signature,'Content-Type':'application/json'},body});
  assert.equal((await post(raw,'forged')).status,400);assert.equal((await post(raw+' ',sign(raw))).status,400);assert.equal((await post(raw,sign(raw,1))).status,400);assert.equal((await post(raw,sign(raw))).status,200);assert.equal((await post(raw,sign(raw))).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_events').get().n,1);
 });
 }finally{if(server)await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
