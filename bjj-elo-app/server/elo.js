const BELTS = [
  { id: "white", label: "White", startElo: 500 },
  { id: "blue", label: "Blue", startElo: 800 },
  { id: "purple", label: "Purple", startElo: 1200 },
  { id: "brown", label: "Brown", startElo: 1650 },
  { id: "black", label: "Black", startElo: 2150 },
];

const WEIGHT_CLASSES = [
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

function beltMeta(id) {
  return BELTS.find((b) => b.id === id) || BELTS[0];
}

function isValidBelt(id) {
  return BELTS.some((b) => b.id === id);
}

function weightClassOf(weight) {
  const w = parseFloat(weight);
  if (!w || Number.isNaN(w)) return null;
  return WEIGHT_CLASSES.find((c) => w <= c.max) || WEIGHT_CLASSES[WEIGHT_CLASSES.length - 1];
}

// Provisional fighters (fewer fights at this belt) swing faster; established
// fighters swing less. Resets to provisional whenever a fighter is promoted.
function kFactorFor(matchesPlayed) {
  const n = matchesPlayed || 0;
  if (n < 10) return 50;
  if (n < 30) return 32;
  return 20;
}

// outcome: 'A' or 'B' — which fighter won the match
function computeEloUpdate(eloA, eloB, matchesPlayedA, matchesPlayedB, outcome) {
  const kA = kFactorFor(matchesPlayedA);
  const kB = kFactorFor(matchesPlayedB);
  const expA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expB = 1 - expA;
  const scoreA = outcome === "A" ? 1 : 0;
  const scoreB = 1 - scoreA;
  const newA = Math.round(eloA + kA * (scoreA - expA));
  const newB = Math.round(eloB + kB * (scoreB - expB));
  return { newA, newB, changeA: newA - eloA, changeB: newB - eloB };
}

module.exports = { BELTS, WEIGHT_CLASSES, beltMeta, isValidBelt, weightClassOf, kFactorFor, computeEloUpdate };
