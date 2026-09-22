window.App = window.App || {};
App.views = App.views || {};

function feedFighterChip(f, isWinner) {
  const bm = App.beltMeta(f.belt);
  const division = f.gender === "women" ? "Women" : f.gender === "men" ? "Men" : null;
  const parts = [bm.label];
  if (f.weight) parts.push(f.weight + "kg");
  if (division) parts.push(division);
  if (f.gym) parts.push(f.gym);
  return `<div class="feed-fighter">
    <span class="belt-swatch" style="background:${bm.color}"></span>
    <div class="feed-fighter-text">
      <div class="feed-fighter-name ${isWinner ? "feed-fighter-name-winner" : ""}">${f.username}</div>
      <div class="feed-fighter-meta">${parts.join(" · ")}</div>
    </div>
  </div>`;
}

function renderCommentThread(matchId, comments) {
  const top = comments.filter((c) => !c.parentId);
  if (top.length === 0) return `<div class="feed-comment-empty">No comments yet — be the first.</div>`;
  return top.map((c) => renderCommentNode(matchId, c, comments)).join("");
}

function renderCommentNode(matchId, c, all, isReply) {
  const ui = App.state.ui;
  const name = c.author ? c.author.username : "Unknown";
  const replies = all.filter((r) => r.parentId === c.id);
  const showReplyBox = ui.replyingTo === c.id;
  return `<div class="feed-comment ${isReply ? "feed-comment-reply" : ""}">
    <div class="feed-comment-line"><b>${name}</b> ${c.text}</div>
    <div class="feed-comment-meta">
      <span class="feed-comment-time">${App.timeAgo(c.createdAt)}</span>
      <button class="feed-reply-btn" data-reply-to="${c.id}">${showReplyBox ? "Cancel" : "Reply"}</button>
    </div>
    ${showReplyBox ? `
      <div class="feed-reply-input-row">
        <input type="text" class="feed-comment-input" data-reply-input="${c.id}" data-reply-match="${matchId}" placeholder="Reply to ${name}…" maxlength="280" />
        <button class="btn btn-primary feed-comment-send" data-reply-send="${matchId}|${c.id}">Send</button>
      </div>` : ""}
    ${replies.map((r) => renderCommentNode(matchId, r, all, true)).join("")}
  </div>`;
}

function feedCard(m) {
  const ui = App.state.ui;
  const winner = m.winner === "A" ? m.fighterA : m.fighterB;
  const loser = m.winner === "A" ? m.fighterB : m.fighterA;
  const winnerChange = m.winner === "A" ? m.eloChangeA : m.eloChangeB;
  const bm = App.beltMeta(winner.belt);
  const giant = App.isGiantKillMatch(m);
  const comments = m.comments || [];
  const expanded = ui.expandedFeedId === m.id;
  const method = App.methodLabel(m.method);

  return `<div class="feed-card" style="background:linear-gradient(160deg, ${bm.color}22 0%, var(--bg-raised) 55%)">
    ${giant ? `<div class="feed-tag feed-tag-giant" tabindex="0">⚔️ Giant Killer<span class="badge-tooltip feed-tag-tooltip">Won against someone rated 150+ points higher</span></div>` : ""}
    <div class="feed-belt-edge" style="background:${bm.color}"></div>
    <div class="feed-body">
      <div class="feed-vs">
        <span class="feed-winner">${winner.username}</span>
        <span class="feed-beat">defeated</span>
        <span class="feed-loser">${loser.username}</span>
      </div>
      <div class="feed-fighters">
        ${feedFighterChip(winner, true)}
        <div class="feed-fighter-divider">VS</div>
        ${feedFighterChip(loser, false)}
      </div>
      <div class="feed-stats-row">
        <div class="elo-pill elo-up">+${winnerChange ?? "—"} elo</div>
        ${method ? `<div class="method-pill">via ${method}</div>` : ""}
        <div class="feed-time">${App.timeAgo(m.resolvedAt)}</div>
      </div>
      <div class="feed-actions">
        <button class="feed-action-btn ${m.liked ? "feed-like-active" : ""}" data-like="${m.id}">
          <span class="feed-like-icon">${m.liked ? "❤️" : "🤍"}</span> ${m.likeCount || 0}
        </button>
        <button class="feed-action-btn" data-toggle-comments="${m.id}">💬 ${comments.length}</button>
      </div>
      ${expanded ? `
      <div class="feed-comments">
        ${renderCommentThread(m.id, comments)}
        <div class="feed-comment-input-row">
          <input type="text" class="feed-comment-input" data-comment-input="${m.id}" placeholder="Add a comment…" maxlength="280" />
          <button class="btn btn-primary feed-comment-send" data-comment-send="${m.id}">Post</button>
        </div>
      </div>` : ""}
    </div>
  </div>`;
}

App.views.feed = {
  render(main) {
    const ui = App.state.ui;
    const feed = (App.state.feedData && App.state.feedData.feed) || [];

    if (feed.length === 0) {
      main.innerHTML = App.emptyState("No confirmed results yet. Once fights get logged and agreed on, they'll show up here as a scrollable feed everyone can see.");
      return;
    }

    main.innerHTML = `<div class="feed-scroll">${feed.map(feedCard).join("")}</div>`;

    main.querySelectorAll("[data-like]").forEach((b) => {
      b.onclick = async () => {
        await App.api.likeMatch(b.dataset.like);
        await App.refreshTab("feed", true);
      };
    });
    main.querySelectorAll("[data-toggle-comments]").forEach((b) => {
      b.onclick = () => {
        const id = parseInt(b.dataset.toggleComments, 10);
        ui.expandedFeedId = ui.expandedFeedId === id ? null : id;
        App.render();
      };
    });
    main.querySelectorAll("[data-comment-send]").forEach((b) => {
      b.onclick = async () => {
        const mid = b.dataset.commentSend;
        const input = main.querySelector(`[data-comment-input="${mid}"]`);
        if (input && input.value.trim()) {
          await App.api.addComment(mid, input.value);
          await App.refreshTab("feed", true);
        }
      };
    });
    main.querySelectorAll("[data-comment-input]").forEach((inp) => {
      inp.onkeydown = async (e) => {
        if (e.key === "Enter" && inp.value.trim()) {
          await App.api.addComment(inp.dataset.commentInput, inp.value);
          await App.refreshTab("feed", true);
        }
      };
    });
    main.querySelectorAll("[data-reply-to]").forEach((b) => {
      b.onclick = () => {
        const id = parseInt(b.dataset.replyTo, 10);
        ui.replyingTo = ui.replyingTo === id ? null : id;
        App.render();
      };
    });
    main.querySelectorAll("[data-reply-send]").forEach((b) => {
      b.onclick = async () => {
        const [mid, parentId] = b.dataset.replySend.split("|");
        const input = main.querySelector(`[data-reply-input="${parentId}"]`);
        if (input && input.value.trim()) {
          ui.replyingTo = null;
          await App.api.addComment(mid, input.value, parentId);
          await App.refreshTab("feed", true);
        }
      };
    });
    main.querySelectorAll("[data-reply-input]").forEach((inp) => {
      inp.onkeydown = async (e) => {
        if (e.key === "Enter" && inp.value.trim()) {
          App.state.ui.replyingTo = null;
          await App.api.addComment(inp.dataset.replyMatch, inp.value, inp.dataset.replyInput);
          await App.refreshTab("feed", true);
        }
      };
    });
  },
};
