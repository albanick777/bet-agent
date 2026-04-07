export async function getPatternPicks(apiKey, kvUrl, kvToken) {
  function safeArray(v) { return Array.isArray(v) ? v : []; }

  async function apiGet(url) {
    const r = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }

  async function kvGet(key) {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const d = await r.json();
    if (!d?.result) return null;
    try {
      return JSON.parse(d.result);
    } catch {
      return null;
    }
  }

  // Citește lista echipelor din KV
  const patternTeams = await kvGet("pattern_teams");
  if (!patternTeams || patternTeams.length === 0) return [];

  // Fetch meciurile de azi
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;

  const fixturesRaw = await apiGet(`https://v3.football.api-sports.io/fixtures?date=${today}`);
  const allFixtures = safeArray(fixturesRaw.response);

  const COUNTRY_OFFSET = {
    "England": 1, "Scotland": 1, "Portugal": 1,
    "Spain": 2, "France": 2, "Switzerland": 2, "Belgium": 2,
    "Netherlands": 2, "Germany": 2, "Italy": 2,
    "Turkey": 3, "Greece": 3
  };

  function fmtUTC(ts) {
    if (!ts) return "??:??";
    const d = new Date(ts * 1000);
    return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }

  function fmtLocal(ts, country) {
    if (!ts) return "??:??";
    const off = COUNTRY_OFFSET[country] || 1;
    const d = new Date(ts * 1000 + off * 3600000);
    return `${String(d.getUTCHours() % 24).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }

  const picks = [];

  for (const team of patternTeams) {
    // Verifică dacă echipa joacă azi
    const todayMatch = allFixtures.find(m => {
      const status = m?.fixture?.status?.short || "";
      if (!["NS","TBD"].includes(status)) return false;
      return m?.teams?.home?.id === team.teamId ||
             m?.teams?.away?.id === team.teamId;
    });

    if (!todayMatch) continue;

    const home = todayMatch?.teams?.home?.name || "";
    const away = todayMatch?.teams?.away?.name || "";
    const isHome = todayMatch?.teams?.home?.id === team.teamId;
    const opponent = isHome ? away : home;
    const kickoffTs = todayMatch?.fixture?.timestamp;
    const side = isHome ? "🏠 Acasă" : "✈️ Deplasare";

    picks.push({
      teamName: team.teamName,
      opponent,
      side,
      isHome,
      league: team.league,
      country: team.country,
      pattern: team.pattern,
      patternPct: team.patternPct,
      patternCount: team.patternCount,
      totalMatches: team.totalMatches,
      kickoffUTC: fmtUTC(kickoffTs),
      kickoffLocal: fmtLocal(kickoffTs, team.country),
      match: `${home} vs ${away}`
    });
  }

  // Sortează după procent și returnează top 3
  picks.sort((a, b) => b.patternPct - a.patternPct);
  return picks.slice(0, 3);
}
