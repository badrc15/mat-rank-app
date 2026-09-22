window.App = window.App || {};
App.views = App.views || {};

App.views.auth = {
  render(root) {
    const ui = App.state.ui;

    root.innerHTML = `
      <div class="gate">
        <div class="gate-mark"></div>
        <h1>Mat Rank</h1>
        <p>Head-to-head Elo rankings for BJJ. Create an account or sign in to see rankings, send match requests, and log results.</p>

        <div class="auth-tabs">
          <button class="auth-tab ${ui.authMode === "login" ? "active" : ""}" data-mode="login">Sign in</button>
          <button class="auth-tab ${ui.authMode === "register" ? "active" : ""}" data-mode="register">Create account</button>
        </div>

        ${ui.authError ? `<div class="auth-error">${App.escapeHtml(ui.authError)}</div>` : ""}

        <form id="authForm" autocomplete="on">
          <input id="authUsername" name="username" placeholder="Fighter name" autocomplete="username" />
          <input id="authPassword" name="password" type="password" placeholder="Password" autocomplete="${ui.authMode === "login" ? "current-password" : "new-password"}" />
          <button type="submit" class="primary" id="authSubmit" ${ui.authBusy ? "disabled" : ""}>
            ${ui.authBusy ? "Please wait…" : ui.authMode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div class="auth-hint">
          ${ui.authMode === "login"
            ? "New here? Switch to \u201cCreate account\u201d above."
            : "Passwords need at least 6 characters. You can update your belt, weight, gym, and division after signing up."}
        </div>
      </div>
    `;

    root.querySelectorAll(".auth-tab").forEach((btn) => {
      btn.onclick = () => {
        ui.authMode = btn.dataset.mode;
        ui.authError = null;
        App.render();
      };
    });

    const form = document.getElementById("authForm");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById("authUsername").value.trim();
      const password = document.getElementById("authPassword").value;

      if (!username || !password) {
        ui.authError = "Enter a fighter name and password.";
        return App.render();
      }

      ui.authBusy = true;
      ui.authError = null;
      App.render();

      try {
        const fn = ui.authMode === "login" ? App.api.login : App.api.register;
        const { token, fighter } = await fn(username, password);
        App.api.setToken(token);
        App.state.me = fighter;
        ui.authBusy = false;
        await App.enterApp();
      } catch (err) {
        ui.authBusy = false;
        ui.authError = err.message || "Something went wrong.";
        App.render();
      }
    };
  },
};
