# Free hosting preparation — 3 October 2026

Status: not deployed. No paid plan or service has been provisioned.

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

## Authentication blocker

Stripe CLI 1.53.0, Directory 0.3.5 and Projects 0.46.0 are available. Catalog discovery worked, but provisioning preflight returned `BROWSER_AUTH_REQUIRED`; it could not check account eligibility. No project was initialized. The Projects skill requires stopping for user-completed browser authentication rather than retrying initialization.

The CLI's message/remedy, verbatim:

> Run `stripe login --non-interactive --new-session` to print JSON with `browser_url`, `verification_code`, and `next_step`; present `browser_url` and `verification_code` to the user, then run the emitted `next_step` command to complete login before retrying. `--new-session` is required: without it the Stripe CLI prints "already logged in" and exits 0 without authenticating, and that exit 0 is not success. If the CLI rejects `--new-session` as an unknown flag (Stripe CLI older than 1.50.0), run the same command without that flag — on those versions it prints the same JSON handoff when no session exists. If any login attempt prints "already logged in" instead of JSON, stop and tell the user to run `stripe projects init` themselves in a terminal with browser access — a session already exists, so `stripe login` prints the same "already logged in" for them and cannot authenticate Projects either. Never retry the original command until a login has actually completed. Try the login once only: if the same check still fails after a login that completed successfully, another sign-in will not change it — stop and tell the user to run `stripe projects init` themselves in a terminal with browser access.

On this machine the CLI is invoked through `npx --yes @stripe/cli@latest` rather than a global `stripe` executable. The user can run interactive `npx --yes @stripe/cli@latest projects init` from this app folder to complete the browser sign-in and setup themselves. Do not select or accept a paid service.
