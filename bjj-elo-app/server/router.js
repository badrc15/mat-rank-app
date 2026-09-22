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
        if (!res.headersSent) sendJson(res, 500, { error: "Server error" });
      }
      return true;
    }
    return false;
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
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
