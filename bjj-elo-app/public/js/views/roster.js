window.App = window.App || {};
App.views = App.views || {};

function fighterRow(f, blocked, me, pendingToIds, rankLabel) {
  const isMe = f.id === me.id;
  const pending = pendingToIds.has(f.id);
  const disabled = blocked || pending;
  const label = pending ? "Requested" : "Request";
  const bm = App.beltMeta(f.belt);
  return `<div class="row">
    <div>
      <div class="fighter-name">${rankLabel !== undefined ? `<span class="rank-num">${rankLabel}</span>` : ""}<span class="belt-swatch" style="background:${bm.color}"></span>${f.username}${isMe ? " (you)" : ""}</div>
      <div class="fighter-meta">${f.gym ? f.gym + " · " : ""}${bm.label} belt${f.weight ? " · " + f.weight + "kg" : ""}${f.gender ? " · " + (f.gender === "women" ? "Women" : "Men") : ""}</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="fighter-elo display">${f.elo}</div>
      ${isMe ? "" : `<button class="btn ${pending ? "btn-ghost" : "btn-primary"}" data-req="${f.id}" ${disabled ? "disabled" : ""}>${label}</button>`}
    </div>
  </div>`;
}

function gymListFrom(fighters) {
  const seen = {};
  fighters.forEach((f) => {
    if (f.gym && f.gym.trim()) {
      const key = f.gym.trim().toLowerCase();
      if (!seen[key]) seen[key] = f.gym.trim();
    }
  });
  return Object.values(seen).sort((a, b) => a.localeCompare(b));
}

App.views.roster = {
  render(main) {
    const ui = App.state.ui;
    const me = App.state.me;
    const all = App.state.fighters.slice().sort((a, b) => b.elo - a.elo);
    const blocked = App.state.requestsData ? !App.state.requestsData.canSendRequests : false;
    const pendingToIds = new Set(
      ((App.state.requestsData && App.state.requestsData.outgoing) || [])
        .filter((r) => r.status === "pending")
        .map((r) => r.fighter.id)
    );

    if (all.length <= 1) {
      main.innerHTML = App.emptyState("No other fighters yet. Invite training partners to create accounts and they'll show up here.");
      return;
    }

    const gyms = gymListFrom(all);
    const gymFiltered = ui.rosterGym === "all" ? all : all.filter((f) => (f.gym || "").trim().toLowerCase() === ui.rosterGym);
    const genderFiltered = ui.rosterGender === "all" ? gymFiltered : gymFiltered.filter((f) => f.gender === ui.rosterGender);

    let html = `<div class="gym-select-row">
      <select id="gymSelect">
        <option value="all" ${ui.rosterGym === "all" ? "selected" : ""}>All gyms (cross-gym rolls)</option>
        ${gyms.map((g) => `<option value="${g.toLowerCase()}" ${ui.rosterGym === g.toLowerCase() ? "selected" : ""}>${g}</option>`).join("")}
      </select>
    </div>`;
    html += `<div class="chip-row">
      <button class="chip ${ui.rosterGender === "all" ? "active" : ""}" data-gender="all">All</button>
      <button class="chip ${ui.rosterGender === "women" ? "active" : ""}" data-gender="women">Women</button>
      <button class="chip ${ui.rosterGender === "men" ? "active" : ""}" data-gender="men">Men</button>
    </div>`;
    html += `<div class="chip-row">
      ${["overall", "belt", "weight"].map((v) => `<button class="chip ${ui.rosterView === v ? "active" : ""}" data-view="${v}">${v === "overall" ? "Overall" : v === "belt" ? "By belt" : "By weight"}</button>`).join("")}
    </div>`;

    if (genderFiltered.length === 0) {
      html += `<div class="group-empty">Nobody matches this filter yet.</div>`;
      main.innerHTML = html;
      wireRosterChips(main);
      return;
    }

    const scopeLabel = ui.rosterGym === "all" ? "Overall" : gyms.find((g) => g.toLowerCase() === ui.rosterGym) || "Gym";

    if (ui.rosterView === "overall") {
      html += `<div class="section-title">${scopeLabel}${ui.rosterGender !== "all" ? ` · ${ui.rosterGender === "women" ? "Women's" : "Men's"}` : ""} ranking · ${genderFiltered.length} fighters</div>`;
      html += genderFiltered.map((f, i) => fighterRow(f, blocked, me, pendingToIds, i + 1)).join("");
    } else if (ui.rosterView === "belt") {
      App.BELTS.forEach((b) => {
        const group = genderFiltered.filter((f) => f.belt === b.id);
        html += `<div class="group-title">
          <span class="gname"><span class="belt-swatch" style="background:${b.color}"></span>${b.label} belt</span>
          <span class="gcount">${group.length}</span>
        </div>`;
        html += group.length
          ? group.map((f, i) => fighterRow(f, blocked, me, pendingToIds, i + 1)).join("")
          : `<div class="group-empty">No fighters in this belt yet.</div>`;
      });
    } else if (ui.rosterView === "weight") {
      const withWeight = genderFiltered.filter((f) => App.weightClassOf(f.weight));
      const withoutWeight = genderFiltered.filter((f) => !App.weightClassOf(f.weight));
      App.WEIGHT_CLASSES.forEach((wc) => {
        const group = withWeight.filter((f) => App.weightClassOf(f.weight).label === wc.label);
        html += `<div class="group-title">
          <span class="gname">${wc.label}${wc.max !== Infinity ? ` (up to ${wc.max}kg)` : ` (${App.WEIGHT_CLASSES[App.WEIGHT_CLASSES.length - 2].max}kg+)`}</span>
          <span class="gcount">${group.length}</span>
        </div>`;
        html += group.length
          ? group.map((f, i) => fighterRow(f, blocked, me, pendingToIds, i + 1)).join("")
          : `<div class="group-empty">No fighters in this weight class yet.</div>`;
      });
      if (withoutWeight.length) {
        html += `<div class="group-title"><span class="gname">Weight not set</span><span class="gcount">${withoutWeight.length}</span></div>`;
        html += withoutWeight.map((f) => fighterRow(f, blocked, me, pendingToIds)).join("");
      }
    }

    main.innerHTML = html;
    wireRosterChips(main);

    function wireRosterChips(scope) {
      const gymSel = scope.querySelector("#gymSelect");
      if (gymSel) gymSel.onchange = (e) => { ui.rosterGym = e.target.value; App.render(); };
      scope.querySelectorAll("[data-gender]").forEach((b) => {
        b.onclick = () => { ui.rosterGender = b.dataset.gender; App.render(); };
      });
      scope.querySelectorAll("[data-view]").forEach((b) => {
        b.onclick = () => { ui.rosterView = b.dataset.view; App.render(); };
      });
      scope.querySelectorAll("[data-req]").forEach((b) => {
        b.onclick = async () => {
          try {
            await App.api.sendRequest(parseInt(b.dataset.req, 10));
            await App.refreshTab("roster");
            await App.refreshTab("requests", true);
          } catch (err) {
            alert(err.message);
          }
        };
      });
    }
  },
};
