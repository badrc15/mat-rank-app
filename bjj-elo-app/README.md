# Mat Rank

BJJ ranking app using Node's HTTP server and built-in SQLite. Requires Node 22.20 or later. No third-party runtime dependencies.

## Run locally

Run `npm start` in this directory, then open http://localhost:3000. The database defaults to `data/matrank.db`, resolved relative to this project, not the terminal's current folder. Refreshing a page does not remove accounts. The HttpOnly cookie restores the session for seven days.

Set `DATA_DIR` to an existing database directory to keep using that data. On Fly this MUST be `/data`, backed by the existing `matrank_data` volume. Never replace that volume with an empty one or switch database locations without copying and verifying existing data. No user database was migrated or altered while implementing these changes; tests use separate temporary databases.

Environment variables are read from the process. `.env.example` is documentation only; the server does not automatically load it. Production registration is closed unless `SIGNUPS_ENABLED=true`. Local development permits test registration. Test with `npm test`.

## Accounts and security

- New passwords: 15–128 characters, basic common-password rejection, random salts, asynchronous scrypt N=131072/r=8/p=1. At most two concurrent password derivations. This is not a comprehensive breached-password database.
- Existing password hashes continue to work and upgrade when the owner signs in. Existing shorter passwords remain valid until changed. Existing bearer sessions require one fresh sign-in after this update.
- Random 256-bit session cookies; only SHA-256 token hashes stored in SQLite. HttpOnly, SameSite=Lax, seven-day expiry, Secure in production. No new local-storage tokens or tokens in JSON responses.
- Logout revokes the session server-side. Password changes revoke all other devices; account controls can revoke every session.
- Persistent IP/account rate limits, CSRF protection for JSON mutations, limited body size, request timeouts, CSP and security headers. `Fly-Client-IP` is trusted only when `FLY_APP_NAME` is present; keep the service behind Fly's proxy in that environment.
- Terms and privacy versions plus acceptance timestamp are recorded for new accounts. Accepting terms is not consent to optional marketing/data use. Existing accounts are not retroactively marked as accepting new terms.
- Account export and password-confirmed deletion. Completed matches retain deleted fighter IDs under a “Deleted account” label to preserve opponents' results. This is pseudonymisation, not guaranteed anonymity.
- There is no automated forgotten-password recovery, email verification or MFA yet. Do not reset passwords based on a claimed nickname or an unverified email. Decide and implement a verified recovery process before opening public registration.
- Browser fonts are local fallbacks; no third-party tracking scripts, fonts, advertising or analytics cookies. The only cookie is essential authentication. No consent-forcing cookie banner.

## Storage and backups

SQLite uses WAL, full synchronous durability and a busy timeout. Schema changes are additive. Run one machine against one persistent volume: independent SQLite volumes do not replicate. Do not enable horizontal scaling without a database replication/migration design.

Use `npm run backup` with `DATA_DIR` pointing at the live database. It uses SQLite's online backup API, then runs an integrity check on the output. `BACKUP_DIR` selects the destination; it defaults to the ignored `backups/` directory. Do not copy only `matrank.db` while WAL writes are active.

Backups contain personal data and password hashes. Restrict access and copy them to encrypted off-host storage under a defined retention policy. The script is manual, not a configured backup schedule. Fly snapshots are configured for seven-day retention but have not been verified because the Fly trial has expired. A volume on the same machine is not disaster recovery.

Restore procedure: stop the service; preserve the current database and its WAL/SHM files together for rollback; restore a verified backup to the configured database directory without mixing it with old WAL/SHM files; restrict file access; start one machine and verify accounts/match counts. Reapply deletion requests made after the snapshot. Perform a restore drill in an isolated environment before launch.

## Deployment status and steps

An existing Fly login for the operator and `fly.toml` app `bjj-elo-app` were found. Fly rejected status and volume inspection because the trial has ended. Nothing has been deployed by this change. Reactivate the existing Fly account at https://fly.io/trial; do not create a replacement app/volume blindly because existing data may be there.

Once access is restored:

1. Inspect `fly status --app bjj-elo-app`, `fly machines list --app bjj-elo-app`, and `fly volumes list --app bjj-elo-app`.
2. Verify the current database and volume mount and create a verified backup before migration. Confirm there is one serving machine and one authoritative database; reconcile any existing duplicate volumes before proceeding.
3. Run `npm test` locally. Validate the Fly config. Production defaults are HTTPS, `/data` persistence, a `/health` check and closed registration.
4. Deploy from this folder with `fly deploy --ha=false`. This can update billed Fly resources; no plan or billing changes have been made here.
5. Verify HTTPS, cookie flags, mounted database, account persistence after a machine restart, logs and backups. Use disposable test accounts and remove test personal data.
6. Complete `LAUNCH-CHECKLIST.md`, replace preview policies with reviewed operational facts, and only then enable registration. A domain is optional: Fly provides an app subdomain after deployment.

The legal HTML pages are generated from `server/generate-legal.js`; update the source and run it when changing policies. Keep the server's policy version and pages in agreement. No claim of complete legal compliance is made.

## After-training workflow

Use **Log rolls** after class: choose a training date from the last 14 days and enter remembered wins, losses and no-winner rounds for up to 20 partners. No attendance check, advance request, coach action, push notification or complete record of every round is required. Rosters offer a Log rolls shortcut; recent partners appear first.

**Recaps** shows counts from the viewer's perspective. Only the other participant can confirm the latest proposal. Corrections swap responsibility for confirmation; stale versions are rejected. “I don't remember”, withdrawal and expiry close records without Elo changes. A pending recap expires 14 days after initial submission; corrections do not extend that deadline. No unresolved-recap restriction prevents logging other partners. One record per unordered pair/date prevents reciprocal duplicates and retry duplication. A conflicting batch rolls back entirely; drafts remain in the current browser session for correction.

Confirmation is one SQLite transaction including all generated match history and both rating changes. No-winner rounds are recorded in the recap and never count as losses or rated matches. Decisive rounds all use the same pre-recap ratings/K factors and changes are summed: unknown round order cannot affect the result. Different recaps apply in confirmation order. Win-streak badges were removed because batch counts cannot establish round order. Training streaks and overall win rates remain.

An additive migration preserves old confirmed history and retires unfinished advance requests/matches. Old scheduling and direct-result endpoints are no longer mounted. Recaps are included in exports and removed on participant account deletion. Confirmation is final in the current UI; incorrect confirmed results require operator support. Public registration remains closed pending safeguarding work.

Validation: `npm test` covers account security plus direct logging, reciprocal duplicates, batch rollback, participant authorization, correction/version rules, one-time Elo effects, no-winner rounds, expiry, persistence and retired endpoints. Hosting still requires user-completed authentication; the app is not yet deployed remotely.

## Email accounts (3 October 2026)

Signup requires an adult declaration, current terms acceptance and email verification. Pending signup data expires in 24 hours; a verified account is created only when the user confirms the email link. Login uses email; older accounts without email may still log in by nickname and add a private verified email in Account & privacy.

Forgot password issues a hashed, single-use 30-minute token. Reset revokes all sessions and outstanding reset links; links use URL fragments and are removed from browser history after loading. Failed delivery invalidates the issued token and logs a non-sensitive operational error. Responses do not disclose whether an email belongs to an account.

Live delivery requires RESEND_API_KEY, EMAIL_FROM on a verified sender domain, EMAIL_DOMAIN_VERIFIED=true and an HTTPS APP_ORIGIN. EMAIL_DOMAIN_VERIFIED is an operator deployment assertion, not automatic domain verification. Signup also requires SIGNUPS_ENABLED=true in production. Do not enable it until LAUNCH-CHECKLIST.md is resolved. The operator has no sender domain yet. Local automated tests use MAIL_TRANSPORT=file with NODE_ENV=test in isolated temporary storage; file transport cannot run in production.

The cookie popup has a Got it button and can be reopened with Cookie information. Only the essential session cookie and notice-dismissal local storage are used.
