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
      const outer = JSON.parse(d.result);
      const inner = typeof outer.value === "string" ? outer.value : JSON.stringify(outer.value);
      return JSON.parse(inner);
    } catch {
      return null;
    }
  }

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

  // ── TRADUCERE PATTERN → PARIU EXACT ─────────────────────────────────────
  // Pattern e din perspectiva echipei scanate
  // isHome = echipa scanată joacă acasă
  // Trebuie să traducem în termeni de pariu standard (1=acasă, X=egal, 2=deplasare)
  function translatePattern(pattern, isHome) {
    const [ht, ft] = pattern.split("/");

    function tobet(result, isHome) {
      if (result === "W") return isHome ? "1" : "2"; // echipa scanată câștigă
      if (result === "L") return isHome ? "2" : "1"; // echipa scanată pierde
      return "X"; // egal
    }

    const htBet = tobet(ht, isHome);
    const ftBet = tobet(ft, isHome);

    return `${htBet}/${ftBet}`;
  }

  function patternExplain(pattern, teamName, isHome, opponent) {
    const [ht, ft] = pattern.split("/");
    const side = isHome ? "acasă" : "în deplasare";

    const htText = ht === "W" ? `${teamName} conduce la pauză`
      : ht === "L" ? `${opponent} conduce la pauză`
      : "Egal la pauză";

    const ftText = ft === "W" ? `${teamName} câștigă meciul`
      : ft === "L" ? `${opponent} câștigă meciul`
      : "Meci egal la final";

    return `${htText} → ${ftText}`;
  }

  // ── CITIRE LISTA DIN KV ──────────────────────────────────────────────────
  const patternTeams = await kvGet("pattern_teams");
  if (!patternTeams || patternTeams.length === 0) return [];

  // ── MECIURILE DE AZI ────────────────────────────────────────────────────
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;

  const fixturesRaw = await apiGet(`https://v3.football.api-sports.io/fixtures?date=${today}`);
  const allFixtures = safeArray(fixturesRaw.response);

  const picks = [];

  for (const team of patternTeams) {
    const todayMatch = allFixtures.find(m => {
      const status = m?.fixture?.status?.short || "";
      if (!["NS","TBD"].includes(status)) return false;
      return m?.teams?.home?.id === team.teamId ||
             m?.teams?.away?.id === team.teamId;
    });

    if (!todayMatch) continue;

    const homeId = todayMatch?.teams?.home?.id;
    const homeName = todayMatch?.teams?.home?.name || "";
    const awayName = todayMatch?.teams?.away?.name || "";
    const isHome = homeId === team.teamId;
    const opponent = isHome ? awayName : homeName;
    const kickoffTs = todayMatch?.fixture?.timestamp;

    // Traducere pattern → pariu exact
    const betCode = translatePattern(team.pattern, isHome);
    const explanation = patternExplain(team.pattern, team.teamName, isHome, opponent);

    picks.push({
      teamName: team.teamName,
      opponent,
      isHome,
      side: isHome ? "🏠 Acasă" : "✈️ Deplasare",
      league: team.league,
      country: team.country,
      pattern: team.pattern,
      betCode,
      explanation,
      patternPct: team.patternPct,
      patternCount: team.patternCount,
      totalMatches: team.totalMatches,
      kickoffUTC: fmtUTC(kickoffTs),
      kickoffLocal: fmtLocal(kickoffTs, team.country),
      match: `${homeName} vs ${awayName}`
    });
  }

  picks.sort((a, b) => b.patternPct - a.patternPct);
  return picks.slice(0, 3);
}
