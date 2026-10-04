# Free hosting preparation — 3 October 2026

Status: Railway Free, Railway hosting and Resend Free/email have been provisioned. No paid plan was selected. The app is not live: the public URL returns 404 pending Railway CLI sign-in, build-root configuration and a persistent volume.

## Candidate: Railway Free

The provider directory and Railway documentation list a $0/month Free plan with $1 of usage credit each month, 0.5 GB RAM and 0.5 GB volume storage. A new account initially has a limited trial, then reverts to Free. This is a limited free allowance, not unlimited free hosting or a guarantee of continuous uptime. Do not activate Hobby/Pro, add a paid subscription, or buy credits under the user's free-only instruction.

Sources: https://docs.railway.com/pricing/plans and https://docs.railway.com/pricing/free-trial

Render Free cannot mount a persistent local disk, and its free Postgres expires after 30 days. Deploying this app unchanged there would risk losing accounts. Render plus an external free database remains an alternative that requires a database adapter migration.

## Prepared deployment

`railway.json` describes the existing Docker build, start command, health check and bounded restart policy. It does not provision a volume, choose a plan, set variables, or guarantee a $0 bill.

After authentication and confirmation that a Free plan is actually available to this account:

1. Create the app on the Free plan only. Use `bjj-elo-app` as the service root/build context and `/bjj-elo-app/railway.json` as the config path when deploying the repository.
2. Attach one persistent volume at `/data` before starting the service. Keep one replica; do not use multiple independent SQLite volumes.
3. Set `NODE_ENV=production`, `DATA_DIR=/data`, `SIGNUPS_ENABLED=false`, and `APP_ORIGIN` to the actual generated HTTPS origin. Use the port supplied by Railway. Do not copy the Fly origin.
4. Verify the platform's current trusted proxy/client-IP behaviour before changing rate limiting; currently non-Fly requests are grouped by the socket's remote address. Do not blindly trust a client-supplied forwarding header.
5. Enable supported idle sleeping and verify usage stops within free-plan limits. Do not add a paid backup or other paid add-on. Keep verified backups outside the host under a retention policy.
6. Back up and reconcile any existing account database before migration. Existing Fly data remains inaccessible because its trial has ended. Do not silently replace it with an empty database or upload local test accounts.
7. Deploy, verify HTTPS and cookie flags, account persistence after a restart, and the mounted volume. Update the preview policies to the verified hosting processor and region; the current documents still describe the earlier Fly plan.
8. Keep production registration closed until the existing children's privacy and safety launch gaps are resolved.

## Current deployment state — 4 October 2026

- GitHub repository: badrc15/mat-rank-app, branch codex/production-accounts.
- Railway project: e37af765-6fab-436e-b4a9-b22255d2ac72.
- Public address reserved: https://mat-rank-app-production-56cf.up.railway.app (not serving the app yet).
- Stripe Projects is authenticated. Direct Railway CLI access still requires the user to complete Railway sign-in.
- The first hosting request failed because the branch had not yet been pushed; that errored record was untracked. A replacement hosting request completed successfully after publishing the branch.
- Resend Free and an email API resource are provisioned. The operator has no domain; delivery to users is blocked until a sender domain is verified. Do not enable EMAIL_DOMAIN_VERIFIED or SIGNUPS_ENABLED before the necessary checks.
- The release is now adults-only. Public account signup remains disabled.

No local demo database or credentials were pushed to GitHub. Production on Railway refuses to start without a persistent volume mounted at DATA_DIR.
