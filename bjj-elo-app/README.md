# Mat Rank

A head-to-head Elo ranking app for BJJ. Fighters register, send match requests
to opponents before they roll, and both sides confirm the result afterward —
Elo only updates once both accounts agree. Includes belt-based starting Elos,
gyms, weight/belt/gender-filtered rankings, and a scrollable match feed with
likes and threaded comments.

## Requirements

- **Node.js 22.5 or later.** This project uses Node's built-in `node:sqlite`
  module, so there are **no external dependencies to install** — no
  `npm install` step, no native build tools, nothing that can go out of date.
  Check your version with `node --version`.

## Running it locally

```
node server/index.js
```

Then open **http://localhost:3000**. A SQLite database file will be created
automatically at `data/matrank.db` on first run — that file *is* your
database; back it up like you would any other file.

To use a different port:

```
PORT=8080 node server/index.js
```

## Project structure

```
server/               All backend code (plain Node http + node:sqlite, no framework)
  index.js             Entry point — starts the HTTP server, serves the frontend, mounts API routes
  db.js                Database connection + schema (creates tables on first run)
  auth.js              Password hashing (scrypt) and session tokens
  elo.js               Belt starting Elos, K-factor tiers, the Elo formula itself
  router.js            A ~70-line dependency-free HTTP router (path params, JSON body parsing)
  serialize.js         Turns DB rows into the JSON shape the frontend expects (never leaks password hashes)
  sanitize.js          HTML-escaping for free-text fields (usernames, gyms, comments)
  routes/
    auth.js             POST /api/register, POST /api/login
    fighters.js         GET/PATCH profile, roster listing, training-streak logging
    requests.js         Sending/accepting/declining match requests
    matches.js          Submitting results, Elo resolution, likes, comments, the feed

public/                Everything served to the browser — plain HTML/CSS/JS, no build step
  index.html            Page shell; loads the scripts below in order
  css/styles.css        All styling
  js/
    constants.js         Belt/weight-class/method definitions shared by every view
    sanitize.js           Client-side HTML-escaping (defense in depth)
    api.js                fetch() wrapper; attaches the auth token to every request
    state.js              The one shared mutable state object
    main.js               App shell: tab bar, data loading, boot logic
    views/                One file per tab (auth, profile, roster, requests, matches, feed)
```

Every frontend file attaches to a single global `App` object instead of using
ES modules or a bundler — this keeps the "no build step" property end to end.
Load order in `index.html` matters: `constants.js` and `api.js` need to exist
before the view files that use them.

## How the core flow works

1. **Register / log in.** No one can browse fighters or see rankings without
   an account — the home screen is gated (`public/js/views/auth.js`).
2. **Send a request** to an opponent from the Roster tab (`server/routes/requests.js`).
   A fighter with any *unresolved* match is blocked from sending new requests
   until it's settled — this is enforced server-side, not just in the UI.
3. **Accept the request** — this creates a match record with status `awaiting`.
4. **After the fight**, each fighter independently reports their own result
   (win + method, or loss) from their own account. Elo only updates once
   *both* sides agree (`server/routes/matches.js`, `POST /api/matches/:id/result`).
   If they disagree, both results are wiped and each side is asked again.
5. **Elo math** (`server/elo.js`): belts have starting Elos (White 500 → Black
   2150); every promotion resets Elo to the new belt's starting number. New
   fighters at a belt use a higher K-factor (fast-moving, provisional) that
   settles down after 30 fights.
6. **The feed** shows every resolved match with likes and comments (one level
   of reply nesting, enforced server-side).

## Security notes

- Passwords are hashed with `scrypt` (Node's built-in, no external crypto
  library needed) with a random salt per account, and compared with a
  timing-safe comparison.
- Session tokens are 256-bit random values stored in the `sessions` table —
  simple bearer tokens sent as `Authorization: Bearer <token>`, not cookies,
  so there's no CSRF surface to worry about.
- Usernames, gym names, and comments are HTML-escaped **at write time**, so
  every place that later displays them is safe by construction.
- This is a solid starting point, not a finished security audit. Before real
  users touch it, at minimum add: rate limiting on `/api/login` and
  `/api/register` (brute-force protection), session expiry, and HTTPS in
  front of it (see deployment below).

## Deploying it for real

This app has no external dependencies and only needs a writable disk for the
SQLite file, so it runs on almost any Node host:

- **Render / Railway / Fly.io** — point them at this repo, set the start
  command to `node server/index.js`, and make sure the disk holding `data/`
  persists across deploys (Render and Fly both support persistent volumes;
  without one, the database resets every time you redeploy).
- **A VPS** (DigitalOcean, Linode, etc.) — install Node 22+, copy this
  folder over, run it behind a reverse proxy (Caddy or nginx) for HTTPS and
  a real domain, and use a process manager like `pm2` or a systemd service
  so it restarts if it crashes or the server reboots.
- **Environment variable:** set `PORT` if your host requires a specific port
  (most platforms set this for you automatically).

One database file means one server instance — this setup doesn't horizontally
scale across multiple machines out of the box. For a single gym or a small
regional community, one small server is plenty. If this grows well past that,
the natural next step is swapping SQLite for Postgres, which only touches
`server/db.js` and the SQL in `server/routes/*.js` — the rest of the app
(routing, auth, frontend) doesn't need to change.
