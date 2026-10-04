const http = require("http");
const path = require("path");
const fs = require("fs");
const { Router } = require("./router");
const { security } = require("./security");
const db = require("./db");
function cleanExpiredRecords() {
  db.prepare("DELETE FROM sessions WHERE created_at <= ?").run(Date.now() - 7 * 86400000);
  db.prepare("DELETE FROM rate_limits WHERE resets_at <= ?").run(Date.now());
  db.prepare("DELETE FROM email_verifications WHERE expires_at <= ?").run(Date.now());
  db.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(Date.now());
}
cleanExpiredRecords();
setInterval(cleanExpiredRecords, 3600000).unref();

const router = new Router();
require("./routes/auth")(router);
require("./routes/fighters")(router);
require("./routes/recaps")(router);
require("./routes/matches")(router);
require("./routes/plus")(router);
require("./routes/appearance")(router);

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  // Prevent path traversal outside the public directory.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Not a static asset — fall back to index.html (single-page app).
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // Stripe signs the raw bytes; this one endpoint does not use browser CSRF headers.
  if (req.method === 'POST' && req.url === '/api/billing/webhook') return require('./billing').webhook(req,res);
  if (security(req, res)) return;
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  if (req.url.startsWith("/api/")) {
    let handled;
    try { handled = await router.handle(req, res); }
    catch (err) {
      if (!res.headersSent) { res.writeHead(err.status || 400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.status === 413 ? "Request too large." : "Invalid request." })); }
      return;
    }
    if (!handled && !res.headersSent) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
    return;
  }
  serveStatic(req, res);
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mat Rank running on port ${server.address().port}`);
});
