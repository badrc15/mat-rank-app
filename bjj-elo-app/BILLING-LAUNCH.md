# Mat Rank Plus launch handoff

Implemented: progress/rating chart and milestones, detailed rivalry histories, private journal with monthly training-day goals, in-app monthly report, themes/profile banners and downloadable PNG cards. Free users retain core features. Expired members retain journal read/export/delete. No browser or success-URL field grants Plus.

Subscription price: GBP 299 pence monthly; GBP 2400 pence annually. Recurring, no trial. Price IDs are selected on the server and validated against advertised amounts/intervals. Stripe Checkout collects payment details; Stripe customer portal manages cancellation and cards. No Stripe script is loaded on app pages.

## Current provider state

- CLI account: `acct_1UM3gvI365ZpaPTL` (Matrank); live API access not available in the current CLI session. Business website and descriptor were updated by the owner.
- Isolated connected sandbox: `acct_1ULyZiIjiIGO8TbO` (Matrank sandbox).
- Sandbox product: `matrank_plus`.
- Sandbox monthly price: `price_1UMfB9IjiIGO8TbOAPfPyTPF`.
- Sandbox yearly price: `price_1UMfCkIjiIGO8TbOdglOqYFJ`.
- Sandbox portal configuration: `bpc_1UMsl9IjiIGO8TbOUzoGxihF` (cancellation at period end, payment method updates, invoice history).
- Stripe accepted a sandbox Checkout Session with the planned monthly price and terms checkbox. No test payment or app-to-Stripe end-to-end webhook delivery has been completed yet.
- Account defaults enabled Managed Payments; this integration explicitly sets `managed_payments.enabled=false` for standard merchant-operated subscriptions. Do not remove this without redesigning merchant-of-record, tax and terms behavior.
- These sandbox IDs cannot be used with a live key or a different Stripe account.
- No live secret/restricted key or webhook signing secret has been installed in the app. No real charge has been taken.

## Before enabling purchases

1. Complete Stripe business verification/bank details. Verify live charges and payouts readiness. Use an accurate Mat Rank statement descriptor.
2. Complete verified account-email delivery; public signup is still closed. Decide a publishable business address and update Plus terms. Confirm VAT position and selling territories; the UK price is the final advertised price. Do not enable automatic tax without an active registration and tax review.
3. Finalise consumer disclosures, contract-confirmation and renewal emails, cooling-off/refund operations and applicable subscription rules. Replace preview wording only when operating arrangements are actually ready.
4. Use a dedicated restricted server key, scoped to Customers write, Checkout Sessions write, Prices read, Subscriptions write (account deletion cancels renewal), and Billing Portal Sessions write. Store in Railway secret variables. Do not put keys in Git, browser scripts or chat. Provisioning catalog/webhook/portal configuration requires additional setup permissions; these are not needed by the running app.
5. Create the same single Plus product and monthly/yearly GBP prices in live mode (299/2400, interval count 1, inclusive tax behavior). Add the live Plus terms URL in Stripe's public business settings, required for the Checkout terms checkbox. Create a dedicated portal configuration with invoice history, payment method update and subscription cancellation at period end enabled. Disable plan switching until supported pricing and tax behavior is validated.
6. Register `https://mat-rank-app-production-56cf.up.railway.app/api/billing/webhook` with API version `2026-09-30.endive`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`. Store its signing secret in Railway.
7. Set STRIPE_MODE, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, STRIPE_PORTAL_CONFIGURATION, APP_ORIGIN. Test a real sandbox checkout end-to-end, including delayed payment, renewal failure, cancellation and portal return, on an isolated test deployment with its own database and matching sandbox credentials. Local automated tests use a mocked Stripe API and real signature verification; they do not replace this provider test.
8. Only then enable BILLING_LAUNCH_READY=true and BILLING_ENABLED=true. Do not enable either for the current preview. Keep existing Railway volume and email/signup gates intact.

## Operations

Webhook handling verifies raw-body signatures, rejects wrong mode, serialises updates for a customer and fetches current subscription state to avoid stale event regressions. It records event IDs after successful processing. Paid access has a time limit; a failed renewal never extends it. Unrecognised prices do not grant access. Customer ownership comes from the local customer-ID mapping, not user-editable metadata.

Failed webhook responses must be retried through Stripe. Monitor failed deliveries and reconciliation before paid launch. Refund/cooling-off requests require operator action; cancelling renewal in the portal is not a refund. When refunding a cancelled subscription, end access consistently. Consider a reconciliation job and a documented retention schedule for billing events as volume grows.

Account deletion first expires open checkout and cancels Stripe subscriptions; deletion fails closed if billing cannot be stopped. Stripe's financial records are retained according to its obligations; explain this in the final privacy notice. Do not delete billing mappings manually while subscriptions remain active.

Rating graphs group confirmed recap rounds as one change. Monthly summaries use training dates; subsequent confirmations may update prior months. Past training dates that were never stored cannot be reconstructed. Training goals and current streak logs use UTC day boundaries, as the existing app does.
