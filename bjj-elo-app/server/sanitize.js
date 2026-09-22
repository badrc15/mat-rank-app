function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

// Free-text fields (usernames, gym names, comments) are escaped the moment
// they're written, so every place that later displays them is safe by
// construction rather than relying on each render call site to remember to escape.
function sanitizeText(str, maxLen = 60) {
  return escapeHtml(String(str || "").trim()).slice(0, maxLen);
}

module.exports = { escapeHtml, sanitizeText };
