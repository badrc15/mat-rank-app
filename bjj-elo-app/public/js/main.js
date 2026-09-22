window.App = window.App || {};

App.emptyState = function (text) {
  return `<div class="empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/></svg>
    <p>${text}</p>
  </div>`;
};

App.fireConfetti = function () {
  const host = document.getElementById("app");
  if (!host) return;
  const colors = ["#C9A227", "#5C8259", "#EDEAE3", "#2C5F8A", "#6A4C93"];
  const overlay = document.createElement("div");
  overlay.className = "confetti-overlay";
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.setProperty("--r", Math.round(Math.random() * 360));
    p.style.animationDelay = Math.random() * 0.25 + "s";
    p.style.animationDuration = 1.5 + Math.random() * 0.7 + "s";
    overlay.appendChild(p);
  }
  host.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2600);
};

function iconFor(tab, active) {
  const c = active ? "var(--gold)" : "currentColor";
  switch (tab) {
    case "profile": return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6"/></svg>`;
    case "roster": return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="8" cy="9" r="2.6"/><circle cx="17" cy="9" r="2.2"/><path d="M3 19c.6-3 3-5 5-5s4.4 2 5 5"/><path d="M14.5 14.3c1.7.4 3.2 2 3.7 4.4"/></svg>`;
    case "requests": return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>`;
    case "matches": return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M9 15l2 2 4-4"/></svg>`;
    case "feed": return `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 9l5 3-5 3V9z" fill="${c}" stroke="none"/></svg>`;
  }
}

async function loadCommon() {
  const [{ fighter }, { fighters }, reqData] = await Promise.all([
    App.api.getMe(),
    App.api.getFighters(),
    App.api.getRequests(),
  ]);
  App.state.me = fighter;
  App.state.fighters = fighters;
  App.state.requestsData = reqData;
}

App.loadTabData = async function (tab) {
  await loadCommon();
  if (tab === "matches" || tab === "profile") {
    App.state.matchesData = await App.api.getMatches();
  }
  if (tab === "feed") {
    App.state.feedData = await App.api.getFeed();
  }
};

App.setTab = async function (tab) {
  App.state.activeTab = tab;
  await App.loadTabData(tab);
  App.render();
};

App.refreshTab = async function (tab) {
  await App.loadTabData(tab);
  App.render();
};

App.enterApp = async function () {
  await App.setTab(App.state.activeTab || "profile");
};

App.logout = function () {
  App.api.logout();
  App.state.me = null;
  App.state.fighters = [];
  App.state.requestsData = null;
  App.state.matchesData = null;
  App.state.feedData = null;
  App.state.activeTab = "profile";
  App.render();
};

App.render = function () {
  const root = document.getElementById("app");
  if (!App.state.me) {
    App.views.auth.render(root);
    return;
  }

  const me = App.state.me;
  const incomingCount = ((App.state.requestsData && App.state.requestsData.incoming) || []).length;
  const activeTab = App.state.activeTab;

  root.innerHTML = `
    <header>
      <div class="top-row">
        <div class="who">Logged in as <b>${me.username}</b></div>
        <button class="switch-btn" id="logoutBtn">Log out</button>
      </div>
    </header>
    <nav class="tabs" id="tabs">
      ${["profile", "roster", "requests", "matches", "feed"].map((t) => {
        const label = t === "profile" ? "Profile" : t === "roster" ? "Roster" : t === "requests" ? "Requests" : t === "matches" ? "Matches" : "Feed";
        const badge = t === "requests" && incomingCount ? `<span class="count">${incomingCount}</span>` : "";
        return `<button data-tab="${t}" class="${activeTab === t ? "active" : ""}">${badge}${iconFor(t, activeTab === t)}${label}</button>`;
      }).join("")}
    </nav>
    <main id="main" class="${activeTab === "feed" ? "feed-mode" : ""}"></main>
  `;

  document.getElementById("logoutBtn").onclick = () => App.logout();
  root.querySelectorAll("nav.tabs button").forEach((b) => {
    b.onclick = () => App.setTab(b.dataset.tab);
  });

  const main = document.getElementById("main");
  App.views[activeTab].render(main);
};

async function boot() {
  const token = App.api.getToken();
  if (!token) {
    App.views.auth.render(document.getElementById("app"));
    return;
  }
  try {
    const { fighter } = await App.api.getMe();
    App.state.me = fighter;
    await App.enterApp();
  } catch (err) {
    App.api.setToken(null);
    App.views.auth.render(document.getElementById("app"));
  }

  // Background refresh: keeps the current tab's data current without
  // disrupting anything the person is mid-typing or mid-picking.
  setInterval(async () => {
    if (!App.state.me) return;
    const active = document.activeElement;
    const isTyping = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
    if (isTyping || App.state.ui.methodPromptFor) return;

    const mainEl = document.getElementById("main");
    const scrollPos = mainEl ? mainEl.scrollTop : 0;
    try {
      await App.loadTabData(App.state.activeTab);
      App.render();
      const newMain = document.getElementById("main");
      if (newMain) newMain.scrollTop = scrollPos;
    } catch (err) {
      if (err.status === 401) App.logout();
    }
  }, 4000);
}

boot();
