# Deployment status — 4 October 2026

Live preview: https://mat-rank-app-production-56cf.up.railway.app

The tested account and recap release is deployed over HTTPS. Public signup remains closed and emailReady is false because the operator has no verified sender domain. This is a deployed preview, not a completed public launch.

## Hosting and cost

Railway project e37af765-6fab-436e-b4a9-b22255d2ac72, service c998d439-bd14-4ec3-8c15-0feaebfe9c8e, environment 6913f993-b5c1-42b4-828e-2b82b018f530.

Railway's live account API reports a trial with 30 days and approximately $5 credit remaining, underlying plan label HOBBY, and an empty paid-subscriptions list. The Stripe catalog resource is railway/free. No paid subscription was selected. Railway's published trial policy says unused trial credit expires after 30 days and the account then reverts to Free with $1 credit per month. This is a limited allowance, not unlimited uptime. A requested $1 hard usage cap was rejected: the CLI only permits $0 or at least $10. No higher cap was accepted. Idle sleeping is enabled. Verify future billing status before any upgrade.

Official reference: https://docs.railway.com/pricing/free-trial

One replica is configured in europe-west4-drams3a (Amsterdam). A 500 MB persistent volume is attached at /data. The server refuses to start on Railway unless DATA_DIR matches RAILWAY_VOLUME_MOUNT_PATH. Remote database integrity and restart-persistence testing still require a temporary SSH key; approval is pending. Automated local tests verify database persistence and migrations.

## Releasing updates

The reviewed source is on GitHub branch codex/production-accounts. The provider-created GitHub binding deployed main when asked to redeploy from source. The old deployment was stopped with the operator's permission. The new code was deployed from a clean git archive containing only tracked files, through railway up with --path-as-root. No credentials, local database or demo accounts were uploaded. Do not use redeploy --from-source until the GitHub binding is fixed and its branch is independently verified.

Railway rejected the old railway.json configuration mechanism. The file was removed; service settings now specify rootDirectory=/bjj-elo-app, dockerfilePath=Dockerfile, startCommand=node server/index.js, /health, one replica, idle sleeping and three maximum restart attempts. Use a fresh full-repository git archive for CLI upload so that /bjj-elo-app exists in the uploaded tree. Target the explicit project, service and environment IDs above.

Environment: NODE_ENV=production, DATA_DIR=/data, SIGNUPS_ENABLED=false, EMAIL_DOMAIN_VERIFIED=false, APP_ORIGIN=https://mat-rank-app-production-56cf.up.railway.app.

## Email and launch blockers

Resend Free and an email resource are provisioned. Live delivery requires a domain the operator controls, verified DNS records, a sender address, RESEND_API_KEY configured securely on Railway, and a real delivery test. Do not claim email delivery is working or enable public signup before that. The operator has no domain or public contact postal address yet. This release is adults-only; the age checkbox is self-declaration, not verified age assurance. See LAUNCH-CHECKLIST.md for privacy, moderation, retention and operational requirements.

Earlier Fly data has not been migrated or reconciled. Do not replace it or claim it was imported. A failed provisioning attempt left an empty Railway project 2aba5f90-dbcb-470b-984f-59843291cc27 with no deployment; it is not the live app.

## Verification completed

31 automated tests pass. Live /health returns ok; /api/config returns the current version and closed registration. Terms, Privacy and Cookies return 200. The authentication cookie uses HttpOnly, SameSite=Lax and Secure; HSTS is enabled. Browser checks confirm the updated login, forgot-password link, cookie popup, dismissal persistence and standalone terms page.
