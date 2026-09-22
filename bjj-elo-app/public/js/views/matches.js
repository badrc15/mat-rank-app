window.App = window.App || {};
App.views = App.views || {};

App.views.matches = {
  render(main) {
    const ui = App.state.ui;
    const me = App.state.me;
    const data = App.state.matchesData || { matches: [], rivals: [] };
    const matches = data.matches || [];
    const rivals = data.rivals || [];

    if (matches.length === 0) {
      main.innerHTML = App.emptyState(
        "No scheduled fights yet. Accept a request to open a match here."
      );
      return;
    }

    const open = matches.filter((m) => m.status !== "resolved");
    const topRivalId =
      rivals.length && rivals[0].matches >= 2 ? rivals[0].opp : null;

    let html = `<div class="section-title">Open (${open.length})</div>`;

    if (open.length === 0) {
      html += `<div style="padding:4px 0 4px;color:var(--ink-dim);font-size:13px;">
        Nothing pending — send a request from the Roster tab before your next roll.
      </div>`;
    } else {
      html += open
        .map((m) => {
          const isA = m.fighterA.id === me.id;
          const opp = isA ? m.fighterB : m.fighterA;
          const myResult = m.myResult;

          let body = "";

          if (m.conflict) {
            body += `<div class="conflict-banner">
              Your results didn't match. Enter it again — once you both agree, elo updates.
            </div>`;
          }

          if (myResult) {
            body += `<div class="match-status">
              You logged it. Waiting on ${opp.username} to confirm.
            </div>`;
          } else if (ui.methodPromptFor === m.id) {
            body += `<div class="match-status">How did it end?</div>
              <div class="result-btns method-btns">
                ${App.METHODS.map(
                  (mo) =>
                    `<button class="btn btn-primary" data-submit="${m.id}|win:${mo.id}">
                      ${mo.label}
                    </button>`
                ).join("")}
              </div>
              <button class="btn btn-ghost" style="margin-top:8px;" data-cancel-method="${m.id}">
                Back
              </button>`;
          } else {
            body += `<div class="match-status">Log how the fight went.</div>
              <div class="result-btns">
                <button class="btn btn-primary" data-open-method="${m.id}">
                  I won
                </button>
                <button class="btn btn-decline" data-submit="${m.id}|loss">
                  I lost
                </button>
              </div>`;
          }

          return `<div class="match-card">
            <div class="match-vs">
              <span class="vname">${me.username}</span>
              <span class="vsplit">vs</span>
              <span class="vname">${opp.username}</span>
            </div>
            ${body}
          </div>`;
        })
        .join("");
    }

    html += `<div class="section-title">Fight history</div>`;

    if (rivals.length === 0) {
      html += `<div style="padding:4px 0 20px;color:var(--ink-dim);font-size:13px;">
        No confirmed results yet.
      </div>`;
    } else {
      html += rivals
        .map(
          (r) => `<div class="row">
            <div>
              <div class="fighter-name">
                ${r.fighter.username}${
            r.opp === topRivalId
              ? '<span class="rival-tag">rival</span>'
              : ""
          }
              </div>
              <div class="fighter-meta">
                ${r.matches} fight${r.matches === 1 ? "" : "s"} together
              </div>
            </div>
            <div class="fighter-elo display">${r.w}-${r.l}</div>
          </div>`
        )
        .join("");
    }

    main.innerHTML = html;

    // Handle "I won" button
    main.querySelectorAll("[data-open-method]").forEach((b) => {
      b.addEventListener("click", (event) => {
        event.preventDefault();

        ui.methodPromptFor = Number(b.dataset.openMethod);
        App.render();
      });
    });

    // Handle "Back" button
    main.querySelectorAll("[data-cancel-method]").forEach((b) => {
      b.addEventListener("click", (event) => {
        event.preventDefault();

        ui.methodPromptFor = null;
        App.render();
      });
    });

    // Handle result submission buttons
    main.querySelectorAll("[data-submit]").forEach((b) => {
      b.addEventListener("click", async (event) => {
        event.preventDefault();

        const [mid, resultStr] = b.dataset.submit.split("|");
        ui.methodPromptFor = null;

        const [outcome, method] = resultStr.split(":");

        try {
          const { notable } = await App.api.submitResult(
            mid,
            outcome,
            method || undefined
          );

          if (notable) {
            setTimeout(() => App.fireConfetti(), 150);
          }

          await App.refreshTab("matches");
          await App.refreshTab("profile", true);
        } catch (err) {
          console.error("Failed to submit match result:", err);
          alert(err.message);
        }
      });
    });
  },
};