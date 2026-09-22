window.App = window.App || {};
App.views = App.views || {};

function computeBadgesFor(me, matches, rivals) {
  const badges = [];
  const resolved = (matches || []).filter((m) => m.status === "resolved");

  const giantKill = resolved.some((m) => {
    if (App.outcomeForMe(m, me.id) !== "win") return false;
    return App.isGiantKillMatch(m);
  });
  if (giantKill) badges.push({ icon: "⚔️", label: "Giant Killer", desc: "Beat someone rated 150+ above you" });

  const chrono = resolved.slice().sort((a, b) => a.resolvedAt - b.resolvedAt).reverse();
  let streak = 0;
  for (const m of chrono) {
    if (App.outcomeForMe(m, me.id) === "win") streak++;
    else break;
  }
  if (streak >= 3) badges.push({ icon: "🔥", label: `${streak}-win streak`, desc: "Currently on a run" });

  if ((me.matchesPlayed || 0) >= 30) {
    badges.push({ icon: "🛡️", label: "Established", desc: "30+ logged fights at this belt" });
  }
  if (me.streak && me.streak.current >= 7) {
    badges.push({ icon: "📅", label: "Iron Mat", desc: `${me.streak.current}-day training streak` });
  }
  if (rivals && rivals.length && rivals[0].matches >= 2) {
    badges.push({
      icon: "🥊",
      label: `Rival: ${rivals[0].fighter.username}`,
      desc: `${rivals[0].w}-${rivals[0].l} head to head`,
    });
  }
  return badges;
}

function winRateGaugeSVG(matches, myId) {
  const resolved = (matches || []).filter((m) => m.status === "resolved");
  const wins = resolved.filter((m) => App.outcomeForMe(m, myId) === "win").length;
  const total = resolved.length;
  const rate = total ? wins / total : 0;
  const c = 2 * Math.PI * 42;
  const offset = c * (1 - rate);
  return `<svg viewBox="0 0 100 100" width="100%" height="100%">
    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" stroke-width="9"/>
    <circle id="gaugeFg" class="gauge-fg" cx="50" cy="50" r="42" fill="none" stroke="var(--gold)" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target-offset="${offset}" transform="rotate(-90 50 50)"/>
    <text x="50" y="47" text-anchor="middle" font-family="Oswald, sans-serif" font-size="22" font-weight="600" fill="var(--ink)">${total ? Math.round(rate * 100) + "%" : "—"}</text>
    <text x="50" y="65" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" fill="var(--ink-dim)">${total ? wins + "-" + (total - wins) : "no fights yet"}</text>
  </svg>`;
}

function beltEmblemSVG(f) {
  const bm = App.beltMeta(f.belt);
  const textColor = f.belt === "white" ? "#141414" : "#F5F0E6";
  return `<svg viewBox="0 0 120 120" width="96" height="96" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="emblemClip"><circle cx="60" cy="60" r="52"/></clipPath></defs>
    <circle cx="60" cy="60" r="56" fill="#141414"/>
    <circle cx="60" cy="60" r="52" fill="${bm.color}"/>
    <circle cx="60" cy="60" r="43" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2"/>
    <g clip-path="url(#emblemClip)">
      <polygon class="emblem-shine" points="-40,150 -8,150 62,-30 30,-30" fill="rgba(255,255,255,0.32)"/>
    </g>
    <text x="60" y="57" text-anchor="middle" font-family="Oswald, sans-serif" font-size="13" font-weight="700" letter-spacing="1" fill="${textColor}">${bm.label.toUpperCase()}</text>
    <text x="60" y="73" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" letter-spacing="3" fill="${textColor}" opacity="0.75">BELT</text>
  </svg>`;
}

function animateEloCount(el, target) {
  if (!el) return;
  const start = Math.max(0, target - 120);
  const duration = 700;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

App.views.profile = {
  render(main) {
    const me = App.state.me;
    const ui = App.state.ui;
    const matches = (App.state.matchesData && App.state.matchesData.matches) || [];
    const rivals = (App.state.matchesData && App.state.matchesData.rivals) || [];
    const rank = App.state.fighters.length
      ? App.state.fighters.slice().sort((a, b) => b.elo - a.elo).findIndex((f) => f.id === me.id) + 1
      : null;
    const total = App.state.fighters.length || null;
    const blocked = App.state.requestsData ? !App.state.requestsData.canSendRequests : false;
    const badges = computeBadgesFor(me, matches, rivals);
    const loggedToday = me.streak.lastLogDate === new Date().toISOString().slice(0, 10);
    const topRival = rivals.length && rivals[0].matches >= 2 ? rivals[0] : null;
    const bm = App.beltMeta(me.belt);

    main.innerHTML = `
      ${blocked ? `<div class="block-banner">You have an unresolved match. You can't request new opponents until both sides agree on the result — check the Matches tab.</div>` : ""}
      ${ui.promotionNote ? `<div class="promo-banner">Promoted to ${App.beltMeta(ui.promotionNote.toBelt).label} belt — Elo reset from ${ui.promotionNote.fromElo} to ${ui.promotionNote.toElo}, the starting point for that belt.</div>` : ""}

      <div class="rating-card">
        <div class="rating-top">
          <div>
            <div class="rating-num display" id="eloCount">${me.elo}</div>
            <div class="rating-label">Elo rating</div>
            <div class="k-note">${me.matchesPlayed < 10 ? `Provisional · ${me.matchesPlayed}/10 fights at this belt` : me.matchesPlayed < 30 ? "Standard volatility" : "Established rating"}</div>
          </div>
          ${rank ? `<div class="rank-pill">Rank #${rank} of ${total}</div>` : ""}
        </div>
        <div class="belt-row">
          <div class="belt-chip">
            <label>Belt</label>
            <select id="beltSel">
              ${App.BELTS.map((b) => `<option value="${b.id}" ${b.id === me.belt ? "selected" : ""}>${b.label} (starts ${b.startElo})</option>`).join("")}
            </select>
          </div>
          <div class="belt-chip">
            <label>Weight (kg)</label>
            <input id="weightInput" type="number" min="30" max="200" value="${me.weight || ""}" placeholder="e.g. 77" />
          </div>
        </div>
        <div class="belt-row">
          <div class="belt-chip">
            <label>Division</label>
            <select id="genderSel">
              <option value="" ${!me.gender ? "selected" : ""}>Not set</option>
              ${App.GENDERS.map((g) => `<option value="${g.id}" ${g.id === me.gender ? "selected" : ""}>${g.label}</option>`).join("")}
            </select>
          </div>
          <div class="belt-chip">
            <label>Gym</label>
            <input id="gymInput" type="text" value="${me.gym || ""}" placeholder="e.g. Gracie Barra London" />
          </div>
        </div>
      </div>

      <div class="viz-grid">
        <div class="viz-box">
          <div class="viz-ring">${winRateGaugeSVG(matches, me.id)}</div>
          <div class="viz-label">Win rate</div>
        </div>
        <div class="viz-box viz-box-wide">
          <div class="viz-belt-emblem">${beltEmblemSVG(me)}</div>
          <div class="viz-label">${bm.label} belt</div>
        </div>
      </div>

      <div class="section-title">Training streak</div>
      <div class="streak-card">
        <div class="streak-num"><span class="${me.streak.current > 0 ? "flame-pulse" : ""}">🔥</span> ${me.streak.current}<span class="streak-unit">day${me.streak.current === 1 ? "" : "s"}</span></div>
        <div class="streak-sub">Longest: ${me.streak.longest} day${me.streak.longest === 1 ? "" : "s"}</div>
        <button class="btn ${loggedToday ? "btn-ghost" : "btn-primary"}" id="logTrainBtn" ${loggedToday ? "disabled" : ""}>${loggedToday ? "Logged today ✓" : "Log training today"}</button>
      </div>

      ${badges.length ? `
      <div class="section-title">Badges</div>
      <div class="badge-row">
        ${badges.map((b, i) => `<div class="badge-chip" style="animation-delay:${i * 70}ms" tabindex="0"><span class="badge-icon">${b.icon}</span>${b.label}<span class="badge-tooltip">${b.desc}</span></div>`).join("")}
      </div>` : ""}

      ${topRival ? `
      <div class="section-title">Your rival</div>
      <div class="rival-card">
        <div><b>${topRival.fighter.username}</b> — ${topRival.matches} fight${topRival.matches === 1 ? "" : "s"} together</div>
        <div class="rival-record">${topRival.w}-${topRival.l} <span class="rival-wld">(W-L)</span></div>
      </div>` : ""}

      <div class="section-title">Belt starting points</div>
      <div class="belt-scale">
        ${App.BELTS.map((b) => `<div class="belt-scale-item"><span class="belt-swatch" style="background:${b.color}"></span>${b.label} — ${b.startElo}</div>`).join("")}
      </div>
      <div style="font-size:12px;color:var(--ink-dim);line-height:1.6;margin-top:6px;">
        Every promotion resets your Elo to that belt's starting number, so your rating always reflects how you're doing against people at your current level.
      </div>
      <div class="section-title">How this works</div>
      <div style="font-size:13px;color:var(--ink-dim);line-height:1.6;">
        Send a request before you fight. Once your opponent accepts, it becomes a scheduled match. After the fight, both of you log the result from your own side. Elo only updates once your accounts agree — if they don't match, you'll both be asked to re-enter it.
      </div>
    `;

    document.getElementById("beltSel").onchange = async (e) => {
      const newBelt = e.target.value;
      const oldElo = me.elo;
      const oldBelt = me.belt;
      const { fighter, promotion } = await App.api.updateMe({ belt: newBelt });
      App.state.me = fighter;
      if (promotion) {
        ui.promotionNote = promotion;
        setTimeout(() => { ui.promotionNote = null; App.render(); }, 6000);
      }
      await App.refreshTab("profile");
    };
    document.getElementById("weightInput").onchange = async (e) => {
      const { fighter } = await App.api.updateMe({ weight: e.target.value });
      App.state.me = fighter;
      App.render();
    };
    document.getElementById("genderSel").onchange = async (e) => {
      const { fighter } = await App.api.updateMe({ gender: e.target.value });
      App.state.me = fighter;
      App.render();
    };
    document.getElementById("gymInput").onchange = async (e) => {
      const { fighter } = await App.api.updateMe({ gym: e.target.value });
      App.state.me = fighter;
      App.render();
    };
    document.getElementById("logTrainBtn").onclick = async () => {
      const { fighter } = await App.api.logTraining();
      App.state.me = fighter;
      App.render();
    };

    animateEloCount(document.getElementById("eloCount"), me.elo);
    const gaugeFg = document.getElementById("gaugeFg");
    if (gaugeFg) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          gaugeFg.style.strokeDashoffset = gaugeFg.getAttribute("data-target-offset");
        });
      });
    }
  },
};
