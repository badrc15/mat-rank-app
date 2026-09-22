window.App = window.App || {};

App.BELTS = [
  { id: "white", label: "White", color: "#F2F0E9", startElo: 500 },
  { id: "blue", label: "Blue", color: "#2C5F8A", startElo: 800 },
  { id: "purple", label: "Purple", color: "#6A4C93", startElo: 1200 },
  { id: "brown", label: "Brown", color: "#6B4423", startElo: 1650 },
  { id: "black", label: "Black", color: "#141414", startElo: 2150 },
];

App.WEIGHT_CLASSES = [
  { label: "Rooster", max: 57.5 },
  { label: "Light Feather", max: 64 },
  { label: "Feather", max: 70 },
  { label: "Light", max: 76 },
  { label: "Middle", max: 82.3 },
  { label: "Medium Heavy", max: 88.3 },
  { label: "Heavy", max: 94.3 },
  { label: "Super Heavy", max: 100.5 },
  { label: "Ultra Heavy", max: Infinity },
];

App.GENDERS = [
  { id: "women", label: "Women" },
  { id: "men", label: "Men" },
];

App.METHODS = [
  { id: "submission", label: "Submission" },
  { id: "points", label: "Points" },
  { id: "decision", label: "Decision" },
];

App.beltMeta = function (id) {
  return App.BELTS.find((b) => b.id === id) || App.BELTS[0];
};

App.methodLabel = function (id) {
  const m = App.METHODS.find((x) => x.id === id);
  return m ? m.label : null;
};

App.weightClassOf = function (weight) {
  const w = parseFloat(weight);
  if (!w || Number.isNaN(w)) return null;
  return App.WEIGHT_CLASSES.find((c) => w <= c.max) || App.WEIGHT_CLASSES[App.WEIGHT_CLASSES.length - 1];
};

App.timeAgo = function (ts) {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = Math.floor(hrs / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

App.isGiantKillMatch = function (m) {
  if (m.preEloA == null || m.preEloB == null) return false;
  const winnerPre = m.winner === "A" ? m.preEloA : m.preEloB;
  const loserPre = m.winner === "A" ? m.preEloB : m.preEloA;
  return loserPre - winnerPre >= 150;
};

App.outcomeForMe = function (m, myId) {
  const iAmA = m.fighterA.id === myId;
  const iWon = (m.winner === "A" && iAmA) || (m.winner === "B" && !iAmA);
  return iWon ? "win" : "loss";
};
