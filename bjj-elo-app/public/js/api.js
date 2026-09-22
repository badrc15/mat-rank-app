window.App = window.App || {};

(function () {
  const TOKEN_KEY = "matrank_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  App.api = {
    getToken,
    setToken,

    register: (username, password) => request("POST", "/api/register", { username, password }),
    login: (username, password) => request("POST", "/api/login", { username, password }),
    logout: () => setToken(null),

    getMe: () => request("GET", "/api/me"),
    updateMe: (patch) => request("PATCH", "/api/me", patch),
    logTraining: () => request("POST", "/api/me/log-training"),

    getFighters: () => request("GET", "/api/fighters"),

    getRequests: () => request("GET", "/api/requests"),
    sendRequest: (toId) => request("POST", "/api/requests", { toId }),
    respondRequest: (id, accept) => request("PATCH", `/api/requests/${id}`, { accept }),

    getMatches: () => request("GET", "/api/matches"),
    submitResult: (matchId, outcome, method) =>
      request("POST", `/api/matches/${matchId}/result`, { outcome, method }),
    likeMatch: (matchId) => request("POST", `/api/matches/${matchId}/like`),
    addComment: (matchId, text, parentId) =>
      request("POST", `/api/matches/${matchId}/comments`, { text, parentId }),

    getFeed: () => request("GET", "/api/feed"),
  };
})();
