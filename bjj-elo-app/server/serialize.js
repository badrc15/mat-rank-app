// Never leaks password_hash/salt to the client.
function publicFighter(row) {
  if (!row) return { id: null, username: "Deleted account", elo: 0, belt: "white", weight: "", gender: "", gym: "", matchesPlayed: 0, streak: { current: 0, longest: 0, lastLogDate: null } };
  return {
    id: row.id,
    username: row.username,
    elo: row.elo,
    belt: row.belt,
    weight: row.weight,
    gender: row.gender,
    gym: row.gym,
    style: require('./plus').publicStyle(row.id),
    avatarUrl: (()=>{const p=require('./db').prepare('SELECT version FROM profile_photos WHERE fighter_id=?').get(row.id);return p ? '/api/fighters/'+row.id+'/avatar?v='+p.version : null;})(),
    matchesPlayed: row.matches_played,
    streak: {
      current: row.streak_current,
      longest: row.streak_longest,
      lastLogDate: row.streak_last_log,
    },
  };
}

module.exports = { publicFighter };
