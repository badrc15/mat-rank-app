const db = require('./db');
const Stripe = require('stripe');
const { randomBytes } = require('node:crypto');
const VERSION = '2026-10-04';
const locks = new Map();
async function exclusive(key, action) {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
function prices() { return { monthly: process.env.STRIPE_PRICE_MONTHLY, yearly: process.env.STRIPE_PRICE_YEARLY }; }
function enabled() {
  return process.env.BILLING_ENABLED === 'true' && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && prices().monthly && prices().yearly && process.env.STRIPE_PORTAL_CONFIGURATION) && /^https:\/\//.test(process.env.APP_ORIGIN || '') && process.env.BILLING_LAUNCH_READY === 'true';
}
let client;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Billing not configured');
  return client ||= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-09-30.endive', maxNetworkRetries: 2, timeout: 15000 });
}
function subscriptionRows(id) {
  return db.prepare('SELECT s.* FROM billing_subscriptions s JOIN billing_customers c ON c.customer_id=s.customer_id WHERE c.fighter_id=? ORDER BY paid_until DESC').all(id);
}
function status(id) {
  const rows = subscriptionRows(id), now = Date.now();
  const current = rows.find(s => ['active', 'trialing', 'past_due'].includes(s.status) && s.paid_until > now);
  const row = current || rows[0];
  return { plus: Boolean(current), status: row?.status || 'free', paidUntil: row?.paid_until || null, cancelling: Boolean(row?.cancel_at_period_end), hasCustomer: Boolean(db.prepare('SELECT 1 FROM billing_customers WHERE fighter_id=?').get(id)), checkoutEnabled: enabled(), termsVersion: VERSION, prices: { monthly: 299, yearly: 2400 }, currency: 'gbp' };
}
function oid(value) { return typeof value === 'string' ? value : value?.id; }
function createBilling(api) {
  async function syncSubscription(subscriptionId) {
    // Fetch current state rather than trusting event order or a browser return URL.
    const sub = await api.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
    const customer = oid(sub.customer);
    if (!db.prepare('SELECT 1 FROM billing_customers WHERE customer_id=?').get(customer)) return;
    const items = sub.items?.data || [];
    const item = items.find(i => Object.values(prices()).filter(Boolean).includes(oid(i.price)));
    const old = db.prepare('SELECT paid_until FROM billing_subscriptions WHERE id=?').get(sub.id);
    let until = old?.paid_until || 0;
    if (!item || !['active','trialing','past_due'].includes(sub.status) || sub.pause_collection) until = 0;
    else if (sub.status === 'trialing') until = Number(sub.trial_end || 0) * 1000;
    else if (sub.latest_invoice?.status === 'paid') until = Number(item.current_period_end || sub.current_period_end || 0) * 1000;
    db.prepare(`INSERT INTO billing_subscriptions VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,paid_until=excluded.paid_until,cancel_at_period_end=excluded.cancel_at_period_end,price_id=excluded.price_id,updated_at=excluded.updated_at`).run(sub.id,customer,sub.status,until,sub.cancel_at_period_end ? 1 : 0,oid(item?.price) || null,Date.now());
  }
  async function checkout(id, plan) {
    return exclusive('account:'+id, async () => {
      if (!Object.hasOwn(prices(), plan) || !prices()[plan]) throw Object.assign(new Error('Choose a valid plan.'), { status: 400 });
      const fighter = db.prepare('SELECT * FROM fighters WHERE id=?').get(id);
      if (!fighter?.email_verified_at) throw Object.assign(new Error('Verify your account email before subscribing.'), { status: 409 });
      let mapping = db.prepare('SELECT * FROM billing_customers WHERE fighter_id=?').get(id);
      if (mapping?.deleting) throw Object.assign(new Error('Account deletion is pending. Contact support or finish deleting your account.'),{status:409});
      if (!mapping) {
        const customer = await api.customers.create({ email: fighter.email }, { idempotencyKey: 'matrank-customer-'+id+'-'+fighter.created_at });
        db.prepare('INSERT INTO billing_customers(fighter_id,customer_id) VALUES (?,?)').run(id,customer.id);
        mapping = db.prepare('SELECT * FROM billing_customers WHERE fighter_id=?').get(id);
      }
      const subscriptions = await api.subscriptions.list({ customer: mapping.customer_id, status: 'all', limit: 100 });
      if (subscriptions.data.some(s => !['canceled','incomplete_expired'].includes(s.status))) throw Object.assign(new Error('You already have a subscription. Use Manage subscription.'), { status: 409 });
      if (mapping.checkout_id) {
        const existing = await api.checkout.sessions.retrieve(mapping.checkout_id);
        if (existing.status === 'open') {
          if (mapping.checkout_plan === plan) return existing.url;
          throw Object.assign(new Error('You have an open checkout for the other plan. Complete it or try again after it expires in 30 minutes.'), { status: 409 });
        }
      }
      const price = await api.prices.retrieve(prices()[plan]);
      if (!price.active || price.currency !== 'gbp' || price.unit_amount !== (plan === 'monthly' ? 299 : 2400) || price.recurring?.interval !== (plan === 'monthly' ? 'month' : 'year') || price.recurring?.interval_count !== 1) throw new Error('Configured price does not match advertised plan');
      const origin = process.env.APP_ORIGIN;
      // Keep the exact parameters across retries, including after a process restart.
      let attempt = db.prepare('SELECT * FROM billing_checkout_attempts WHERE fighter_id=?').get(id);
      if (attempt && attempt.plan !== plan) throw Object.assign(new Error('Retry your previous plan first to resolve the pending checkout.'), {status:409});
      if (!attempt) {
        const payload = { mode: 'subscription', managed_payments: {enabled:false}, customer: mapping.customer_id, line_items: [{ price: price.id, quantity: 1 }], success_url: origin+'/#plus=success', cancel_url: origin+'/#plus=cancelled', expires_at: Math.floor(Date.now()/1000)+1800, consent_collection: { terms_of_service: 'required' }, custom_text: { terms_of_service_acceptance: { message: `I agree to the [Mat Rank Plus terms](${origin}/plus-terms.html).` } }, integration_identifier: 'matrank_plus_'+Array.from(randomBytes(8), b => String.fromCharCode(97+b%26)).join('') };
        db.prepare('INSERT INTO billing_checkout_attempts VALUES(?,?,?,?)').run(id,plan,randomBytes(24).toString('hex'),JSON.stringify(payload));
        attempt=db.prepare('SELECT * FROM billing_checkout_attempts WHERE fighter_id=?').get(id);
      }
      const session = await api.checkout.sessions.create(JSON.parse(attempt.payload), {idempotencyKey:attempt.attempt_key});
      db.prepare('UPDATE billing_customers SET checkout_id=?,checkout_plan=?,accepted_at=?,terms_version=? WHERE fighter_id=?').run(session.id,plan,Date.now(),VERSION,id);
      db.prepare('DELETE FROM billing_checkout_attempts WHERE fighter_id=?').run(id);
      if (!session.url) throw Object.assign(new Error('The previous checkout has closed. Please try again.'),{status:409});
      return session.url;
    });
  }
  async function portal(id) {
    const customer = db.prepare('SELECT customer_id FROM billing_customers WHERE fighter_id=?').get(id);
    if (!customer) throw Object.assign(new Error('No subscription to manage.'), { status: 404 });
    return (await api.billingPortal.sessions.create({ customer: customer.customer_id, configuration: process.env.STRIPE_PORTAL_CONFIGURATION, return_url: process.env.APP_ORIGIN+'/#plus=manage' })).url;
  }
  async function processEvent(event) {
    if (Boolean(event.livemode) !== (process.env.STRIPE_MODE === 'live')) throw new Error('Stripe mode mismatch');
    const obj = event.data.object;
    const customer = oid(obj.customer);
    return exclusive('customer:'+customer, async () => {
      if (db.prepare('SELECT 1 FROM billing_events WHERE id=?').get(event.id)) return;
      let sub;
      if (event.type.startsWith('customer.subscription.')) sub = obj.id;
      else if (event.type.startsWith('invoice.')) sub = oid(obj.parent?.subscription_details?.subscription || obj.subscription);
      else if (['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type)) sub = oid(obj.subscription);
      if (sub) await syncSubscription(sub);
      db.prepare('INSERT OR IGNORE INTO billing_events VALUES (?,?)').run(event.id,Date.now());
    });
  }
  async function cancelForDeletion(id) {
    return exclusive('account:'+id, async () => {
      const row = db.prepare('SELECT * FROM billing_customers WHERE fighter_id=?').get(id);
      if (!row) return;
      db.prepare('UPDATE billing_customers SET deleting=1 WHERE fighter_id=?').run(id);
      const attempt=db.prepare('SELECT * FROM billing_checkout_attempts WHERE fighter_id=?').get(id);
      if(attempt){
        const recovered=await api.checkout.sessions.create(JSON.parse(attempt.payload),{idempotencyKey:attempt.attempt_key});
        if(recovered.status==='open')await api.checkout.sessions.expire(recovered.id);
        db.prepare('DELETE FROM billing_checkout_attempts WHERE fighter_id=?').run(id);
      }
      if (row.checkout_id) {
        const session = await api.checkout.sessions.retrieve(row.checkout_id);
        if (session.status === 'open') await api.checkout.sessions.expire(session.id);
      }
      for await (const sub of api.subscriptions.list({ customer: row.customer_id, status: 'all', limit: 100 })) {
        if (!['canceled','incomplete_expired'].includes(sub.status)) await api.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
      }
    });
  }
  return { checkout, portal, processEvent, syncSubscription, cancelForDeletion };
}
async function webhook(req, res) {
  const { sendJson } = require('./router');
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) return sendJson(res,503,{error:'Billing unavailable.'});
  let raw;
  try {
    raw = await new Promise((resolve,reject) => {
      const chunks=[]; let size=0;
      req.on('data', c => { size+=c.length; if(size>262144) reject(new Error('Oversized webhook')); else chunks.push(c); });
      req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);req.on('aborted',()=>reject(new Error('Aborted')));
    });
    const event = stripe().webhooks.constructEvent(raw,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);
    await createBilling(stripe()).processEvent(event);
    sendJson(res,200,{received:true});
  } catch (err) {
    // Never log raw payment payloads, authorization headers, or SDK errors.
    const invalid = err.type === 'StripeSignatureVerificationError' || err.message === 'Oversized webhook';
    sendJson(res,invalid?400:503,{error:invalid?'Invalid webhook.':'Webhook processing will retry.'});
  }
}
module.exports = { status, enabled, createBilling, stripe, webhook, VERSION };
