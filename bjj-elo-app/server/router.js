const { URL } = require("url");

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, routePath, handler) {
    const paramNames = [];
    const pattern = routePath.replace(/:[a-zA-Z]+/g, (m) => {
      paramNames.push(m.slice(1));
      return "([^/]+)";
    });
    const regex = new RegExp(`^${pattern}$`);
    this.routes.push({ method, regex, paramNames, handler });
  }

  get(p, h) { this.add("GET", p, h); }
  post(p, h) { this.add("POST", p, h); }
  patch(p, h) { this.add("PATCH", p, h); }
  del(p, h) { this.add("DELETE", p, h); }

  // Returns false if no route matched (caller should send its own 404),
  // otherwise handles the request and returns true.
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;

      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      const query = Object.fromEntries(url.searchParams);

      let body = {};
      if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
        body = await parseBody(req);
      }

      try {
        await route.handler(req, res, { params, query, body });
      } catch (err) {
        console.error(err);
        if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status === 503 ? "Please try again shortly." : "Server error" });
      }
      return true;
    }
    return false;
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    let oversized = false;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      const limit = req.url.split('?')[0] === '/api/me/avatar' ? 2900000 : 16384;
      if (bytes > limit) { oversized = true; reject(Object.assign(new Error("Request too large"), { status: 413 })); return; }
      data += chunk;
    });
    req.on("end", () => {
      if (oversized) return;
      if (!data) return resolve({});
      try {
        const value = JSON.parse(data);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
        resolve(value);
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Request aborted")));
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = { Router, sendJson, parseBody };
