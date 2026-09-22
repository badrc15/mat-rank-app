window.App = window.App || {};

App.escapeHtml = function (str) {
  return String(str == null ? "" : str).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
};
