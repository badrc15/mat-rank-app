// Never leaks password_hash/salt to the client.
function publicFighter(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    elo: row.elo,
    belt: row.belt,
    weight: row.weight,
    gender: row.gender,
    gym: row.gym,
    matchesPlayed: row.matches_played,
    streak: {
      current: row.streak_current,
      longest: row.streak_longest,
      lastLogDate: row.streak_last_log,
    },
  };
}

module.exports = { publicFighter };
