window.App = window.App || {};

(function () {
  // Remove obsolete bearer tokens; authentication now uses an HttpOnly cookie.
  try { localStorage.removeItem("matrank_token"); } catch {}

  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json", "X-Matrank-Request": "1" };

    const res = await fetch(path, {
      method,
      credentials: "same-origin",
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
    plusStatus: () => request('GET','/api/plus/status'),
    plus: month => request('GET','/api/plus?month='+encodeURIComponent(month)),
    checkout: (plan,termsVersion) => request('POST','/api/billing/checkout',{plan,termsVersion,acceptTerms:true,startNow:true}),
    billingPortal: () => request('POST','/api/billing/portal',{}),
    journal: () => request('GET','/api/me/journal'),
    saveJournal: data => request('POST','/api/plus/journal',data),
    deleteJournal: id => request('DELETE','/api/plus/journal/'+id,{}),
    saveGoal: data => request('POST','/api/plus/goals',data),
    deleteGoal: id => request('DELETE','/api/plus/goals/'+id,{}),
    saveStyle: data => request('POST','/api/plus/style',data),
    register: (username, password, consent) => request("POST", "/api/register", { username, password, ...consent }),
    login: (email, password) => request("POST", "/api/login", { email, password }),
    forgotPassword: email => request("POST", "/api/forgot-password", {email}),
    resetPassword: (token,password) => request("POST", "/api/reset-password", {token,password}),
    verifyEmail: token => request("POST", "/api/verify-email", {token}),
    getEmail: () => request("GET", "/api/me/email"),
    addEmail: (email,password) => request("POST", "/api/me/email", {email,password}),
    logout: () => request("POST", "/api/logout", {}),
    config: () => request("GET", "/api/config"),
    changePassword: (currentPassword, newPassword) => request("POST", "/api/me/password", { currentPassword, newPassword }),
    logoutAll: () => request("POST", "/api/me/logout-all", {}),
    deleteAccount: (password, confirm) => request("DELETE", "/api/me", { password, confirm }),

    getMe: () => request("GET", "/api/me"),
    updateMe: (patch) => request("PATCH", "/api/me", patch),
    logTraining: () => request("POST", "/api/me/log-training"),

    getFighters: () => request("GET", "/api/fighters"),

    getRecaps: () => request("GET", "/api/recaps"),
    saveRecaps: (draft) => request("POST", "/api/recaps", draft),
    reviewRecap: (id, body) => request("POST", `/api/recaps/${id}/review`, body),

    getMatches: () => request("GET", "/api/matches"),
    likeMatch: (matchId) => request("POST", `/api/matches/${matchId}/like`),
    addComment: (matchId, text, parentId) =>
      request("POST", `/api/matches/${matchId}/comments`, { text, parentId }),

    getFeed: () => request("GET", "/api/feed"),
  };
})();
