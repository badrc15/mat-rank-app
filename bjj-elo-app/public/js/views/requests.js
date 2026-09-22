window.App = window.App || {};
App.views = App.views || {};

App.views.requests = {
  render(main) {
    const data = App.state.requestsData || { incoming: [], outgoing: [] };
    const incoming = data.incoming || [];
    const outgoing = data.outgoing || [];

    let html = "";
    html += `<div class="section-title">Incoming (${incoming.length})</div>`;
    if (incoming.length === 0) {
      html += `<div style="padding:14px 0;color:var(--ink-dim);font-size:13px;">Nothing waiting on you.</div>`;
    } else {
      html += incoming.map((r) => `<div class="row">
        <div><div class="fighter-name">${r.fighter.username}</div><div class="fighter-meta">wants to schedule a fight</div></div>
        <div class="btn-row">
          <button class="btn btn-decline" data-decline="${r.id}">Decline</button>
          <button class="btn btn-primary" data-accept="${r.id}">Accept</button>
        </div>
      </div>`).join("");
    }

    html += `<div class="section-title">Sent (${outgoing.length})</div>`;
    if (outgoing.length === 0) {
      html += `<div style="padding:14px 0;color:var(--ink-dim);font-size:13px;">You haven't sent any requests.</div>`;
    } else {
      html += outgoing.map((r) => {
        const tag = r.status === "pending" ? "Awaiting response" : r.status === "accepted" ? "Accepted" : "Declined";
        return `<div class="row"><div><div class="fighter-name">${r.fighter.username}</div></div><div class="waiting-tag">${tag}</div></div>`;
      }).join("");
    }

    main.innerHTML = html;

    main.querySelectorAll("[data-accept]").forEach((b) => {
      b.onclick = async () => {
        await App.api.respondRequest(b.dataset.accept, true);
        await App.refreshTab("requests");
        await App.refreshTab("matches", true);
      };
    });
    main.querySelectorAll("[data-decline]").forEach((b) => {
      b.onclick = async () => {
        await App.api.respondRequest(b.dataset.decline, false);
        await App.refreshTab("requests");
      };
    });
  },
};
