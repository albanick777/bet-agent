export async function buildEliteReport(lang = "ro", apiKey) {
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY");

  const safeLang = String(lang || "ro").toLowerCase() === "en" ? "en" : "ro";

  // ─── LIGI APROBATE STRICT (doar prima divizie europeană + UEFA) ────────────
  const APPROVED_LEAGUES = [
    { name: "UEFA Champions League", country: "World", code: "UCL" },
    { name: "UEFA Europa League", country: "World", code: "UEL" },
    { name: "UEFA Europa Conference League", country: "World", code: "UECL" },
    { name: "Premier League", country: "England", code: "ENG1" },
    { name: "La Liga", country: "Spain", code: "ESP1" },
    { name: "Serie A", country: "Italy", code: "ITA1" },
    { name: "Bundesliga", country: "Germany", code: "GER1" },
    { name: "Ligue 1", country: "France", code: "FRA1" },
    { name: "Eredivisie", country: "Netherlands", code: "NED1" },
    { name: "Jupiler Pro League", country: "Belgium", code: "BEL1" },
    { name: "Primeira Liga", country: "Portugal", code: "POR1" },
    { name: "Super Lig", country: "Turkey", code: "TUR1" },
    { name: "Scottish Premiership", country: "Scotland", code: "SCO1" },
    { name: "Super League", country: "Switzerland", code: "SUI1" },
    { name: "Super League 1", country: "Greece", code: "GRE1" }
  ];

  // ─── ECHIPE CANDIDATE PATTERN WATCH (câte 3 per țară) ────────────────────
  const PATTERN_CANDIDATES = {
    Netherlands: [
      { name: "Ajax", id: 194 },
      { name: "PSV Eindhoven", id: 197 },
      { name: "Feyenoord", id: 198 },
      { name: "AZ Alkmaar", id: 200 },
      { name: "FC Twente", id: 202 }
    ],
    Belgium: [
      { name: "Club Brugge KV", id: 341 },
      { name: "Anderlecht", id: 346 },
      { name: "Genk", id: 343 },
      { name: "Union Saint-Gilloise", id: 628 },
      { name: "Gent", id: 344 }
    ],
    Spain: [
      { name: "Athletic Club", id: 531 },
      { name: "Villarreal", id: 533 },
      { name: "Osasuna", id: 727 },
      { name: "Getafe", id: 546 },
      { name: "Rayo Vallecano", id: 728 }
    ],
    Germany: [
      { name: "Bayer Leverkusen", id: 168 },
      { name: "Freiburg", id: 160 },
      { name: "Mainz 05", id: 164 },
      { name: "Augsburg", id: 170 },
      { name: "Werder Bremen", id: 162 }
    ],
    Switzerland: [
      { name: "FC Basel", id: 404 },
      { name: "Young Boys", id: 405 },
      { name: "FC Zurich", id: 406 },
      { name: "Servette", id: 408 },
      { name: "Lugano", id: 410 }
    ]
  };

  // ─── BANNED ───────────────────────────────────────────────────────────────
  const BANNED_KEYWORDS = [
    "women", "woman", "female", "feminine", "frauen", "damen",
    "youth", "u17", "u18", "u19", "u20", "u21", "u23",
    "reserve", "reservas", "réserve",
    "friendly", "friendlies", "amical",
    "qualification", "qualifying",
    "amateur", "srl", "virtual", "esoccer", "esports"
  ];

  function isBanned(leagueName) {
    const text = leagueName.toLowerCase();
    return BANNED_KEYWORDS.some(k => text.includes(k));
  }

  function getApprovedLeague(leagueName, countryName) {
    if (isBanned(leagueName)) return null;
    return APPROVED_LEAGUES.find(l => {
      const nameMatch = leagueName.toLowerCase().includes(l.name.toLowerCase()) ||
        l.name.toLowerCase().includes(leagueName.toLowerCase());
      const countryMatch = l.country === "World" ||
        (countryName || "").toLowerCase() === l.country.toLowerCase();
      return nameMatch && countryMatch;
    }) || null;
  }

  // ─── TIMP ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  const currentHourUTC = now.getUTCHours();
  const currentMinUTC = now.getUTCMinutes();
  const nowMinutesUTC = currentHourUTC * 60 + currentMinUTC;

  // ─── UTILITĂȚI ────────────────────────────────────────────────────────────
  function safeArray(v) { return Array.isArray(v) ? v : []; }
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }

  function formatTimeUTC(ts) {
    if (!ts) return "??:??";
    const d = new Date(ts * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  function formatTimeLocal(ts, offsetHours) {
    if (!ts) return "??:??";
    const d = new Date(ts * 1000 + offsetHours * 3600 * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  const COUNTRY_OFFSET = {
    "England": 1, "Scotland": 1,
    "Spain": 2, "France": 2, "Switzerland": 2, "Belgium": 2,
    "Netherlands": 2, "Germany": 2, "Italy": 2, "Portugal": 1,
    "Turkey": 3, "Greece": 3,
    "World": 2
  };

  function marketRisk(score) {
    if (score >= 85) return "SCĂZUT";
    if (score >= 75) return "MEDIU";
    return "RIDICAT";
  }

  function samplePenalty(n) {
    if (n >= 8) return 0;
    if (n >= 6) return 4;
    if (n >= 4) return 8;
    return 14;
  }

  async function apiGet(url) {
    const r = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
    const d = await r.json();
    if (!d || typeof d !== "object") throw new Error("Invalid API response");
    return d;
  }

  function getTeamSide(match, teamName) {
    if (match?.teams?.home?.name === teamName) return "home";
    if (match?.teams?.away?.name === teamName) return "away";
    return null;
  }

  function getGoalsFA(match, teamName) {
    const side = getTeamSide(match, teamName);
    const hg = Number(match?.goals?.home ?? 0);
    const ag = Number(match?.goals?.away ?? 0);
    if (side === "home") return { gf: hg, ga: ag };
    if (side === "away") return { gf: ag, ga: hg };
    return { gf: 0, ga: 0 };
  }

  function getHtFA(match, teamName) {
    const side = getTeamSide(match, teamName);
    const htH = match?.score?.halftime?.home;
    const htA = match?.score?.halftime?.away;
    if (htH == null || htA == null) return { gf: null, ga: null };
    if (side === "home") return { gf: Number(htH), ga: Number(htA) };
    if (side === "away") return { gf: Number(htA), ga: Number(htH) };
    return { gf: null, ga: null };
  }

  function rc(gf, ga) {
    if (gf > ga) return "W";
    if (gf < ga) return "L";
    return "D";
  }

  function summarize(matches, teamName, sideFilter) {
    const filtered = matches.filter(m => {
      const side = getTeamSide(m, teamName);
      const status = m?.fixture?.status?.short || "";
      return ["FT", "AET", "PEN"].includes(status) &&
        (sideFilter ? side === sideFilter : !!side);
    });

    const totals = [];
    let over15 = 0, over25 = 0, btts = 0, under35 = 0;
    let win = 0, drawHT = 0, leadHT = 0, score2H = 0, scoredR1 = 0;
    const htftMap = {};

    filtered.forEach(m => {
      const { gf, ga } = getGoalsFA(m, teamName);
      const total = gf + ga;
      totals.push(total);
      if (total >= 2) over15++;
      if (total >= 3) over25++;
      if (gf > 0 && ga > 0) btts++;
      if (total <= 3) under35++;
      if (gf > ga) win++;
      if (gf > 0) scoredR1++;

      const ht = getHtFA(m, teamName);
      if (ht.gf !== null) {
        if (ht.gf === ht.ga) drawHT++;
        if (ht.gf > ht.ga) leadHT++;
        const htftCode = `${rc(ht.gf, ht.ga)}/${rc(gf, ga)}`;
        htftMap[htftCode] = (htftMap[htftCode] || 0) + 1;
        if (gf - ht.gf >= 1) score2H++;
      }
    });

    const n = filtered.length;
    const topHtft = Object.entries(htftMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    return {
      totalMatches: n,
      avgGoals: Number(avg(totals).toFixed(2)),
      over15Pct: pct(over15, n),
      over25Pct: pct(over25, n),
      bttsPct: pct(btts, n),
      under35Pct: pct(under35, n),
      winPct: pct(win, n),
      drawHTPct: pct(drawHT, n),
      leadHTPct: pct(leadHT, n),
      score2HPct: pct(score2H, n),
      scoredR1Pct: pct(scoredR1, n),
      topHtftCode: topHtft[0],
      topHtftPct: pct(topHtft[1], n)
    };
  }

  function absencePenalty(injuries, teamName) {
    const n = injuries.filter(i => i?.team?.name === teamName).length;
    if (n >= 5) return 12;
    if (n >= 3) return 7;
    if (n >= 1) return 3;
    return 0;
  }

  function buildPick({ match, league, country, kickoffTs, market, score, type, reason }) {
    const confidence = Math.max(0, Math.min(99, Math.round(score)));
    const offset = COUNTRY_OFFSET[country] || 1;
    return {
      match, league, country,
      kickoffUTC: formatTimeUTC(kickoffTs),
      kickoffLocal: formatTimeLocal(kickoffTs, offset),
      market, confidence,
      risk: marketRisk(confidence),
      type, reason
    };
  }

  // ─── FETCH FIXTURES ───────────────────────────────────────────────────────
  const fixturesRaw = await apiGet(
    `https://v3.football.api-sports.io/fixtures?date=${today}`
  );
  const allFixtures = safeArray(fixturesRaw.response);

  // ─── FILTRARE STRICTĂ ─────────────────────────────────────────────────────
  const filteredFixtures = allFixtures.filter(match => {
    const leagueName = match?.league?.name || "";
    const countryName = match?.league?.country || "";
    const status = match?.fixture?.status?.short || "";

    if (!["NS", "TBD"].includes(status)) return false;
    if (!getApprovedLeague(leagueName, countryName)) return false;

    // Exclude meciuri care încep în mai puțin de 45 minute
    const kickoffTs = match?.fixture?.timestamp;
    if (kickoffTs) {
      const kickoffMin = new Date(kickoffTs * 1000).getUTCHours() * 60 +
        new Date(kickoffTs * 1000).getUTCMinutes();
      const diff = kickoffMin - nowMinutesUTC;
      if (diff >= 0 && diff < 45) return false;
    }

    return true;
  });

  // Prioritizare ligi
  const LEAGUE_PRIORITY = ["UCL", "UEL", "UECL", "ENG1", "ESP1", "ITA1", "GER1", "FRA1", "BEL1", "NED1", "POR1", "TUR1", "SCO1", "SUI1", "GRE1"];
  filteredFixtures.sort((a, b) => {
    const la = getApprovedLeague(a?.league?.name || "", a?.league?.country || "");
    const lb = getApprovedLeague(b?.league?.name || "", b?.league?.country || "");
    const ia = la ? LEAGUE_PRIORITY.indexOf(la.code) : 99;
    const ib = lb ? LEAGUE_PRIORITY.indexOf(lb.code) : 99;
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const candidates = filteredFixtures.slice(0, 12);
  const allPicks = [];

  // ─── ANALIZĂ MECIURI ──────────────────────────────────────────────────────
  for (const match of candidates) {
    const leagueName = match?.league?.name || "";
    const countryName = match?.league?.country || "";
    const approvedLeague = getApprovedLeague(leagueName, countryName);
    if (!approvedLeague) continue;

    const home = match?.teams?.home?.name || "";
    const away = match?.teams?.away?.name || "";
    const fixtureId = match?.fixture?.id;
    const kickoffTs = match?.fixture?.timestamp;
    const matchName = `${home} vs ${away}`;

    try {
      const [homeRaw, awayRaw, predRaw, injRaw] = await Promise.all([
        apiGet(`https://v3.football.api-sports.io/fixtures?team=${match?.teams?.home?.id}&last=15`),
        apiGet(`https://v3.football.api-sports.io/fixtures?team=${match?.teams?.away?.id}&last=15`),
        apiGet(`https://v3.football.api-sports.io/predictions?fixture=${fixtureId}`),
        apiGet(`https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`)
      ]);

      const homeHistory = safeArray(homeRaw.response);
      const awayHistory = safeArray(awayRaw.response);
      const prediction = safeArray(predRaw.response)[0] || {};
      const injuries = safeArray(injRaw.response);

      const homeStats = summarize(homeHistory, home, "home");
      const awayStats = summarize(awayHistory, away, "away");

      const predHome = Number(String(prediction?.predictions?.percent?.home || "0").replace("%", ""));
      const predAway = Number(String(prediction?.predictions?.percent?.away || "0").replace("%", ""));

      const homePen = absencePenalty(injuries, home);
      const awayPen = absencePenalty(injuries, away);
      const homeSP = samplePenalty(homeStats.totalMatches);
      const awaySP = samplePenalty(awayStats.totalMatches);
      const avgSP = Math.round((homeSP + awaySP) / 2);
      const avgGoals = (homeStats.avgGoals + awayStats.avgGoals) / 2;
      const over25Signal = (homeStats.over25Pct + awayStats.over25Pct) / 2;
      const bttsSignal = (homeStats.bttsPct + awayStats.bttsPct) / 2;
      const under35Signal = (homeStats.under35Pct + awayStats.under35Pct) / 2;
      const homeWin = (predHome * 0.55) + (homeStats.winPct * 0.45) - homePen - homeSP;
      const awayWin = (predAway * 0.55) + (awayStats.winPct * 0.45) - awayPen - awaySP;
      const scoredR1Signal = (homeStats.scoredR1Pct + awayStats.scoredR1Pct) / 2;
      const scoredR2Signal = (homeStats.score2HPct + awayStats.score2HPct) / 2;

      const base = { match: matchName, league: leagueName, country: countryName, kickoffTs };

      // OVER 2.5
      if (avgGoals >= 2.7 && over25Signal >= 65) {
        const score = over25Signal + 5 - Math.round((homePen + awayPen) / 2) - avgSP;
        if (score >= 75) allPicks.push(buildPick({ ...base, market: "OVER 2.5", score, type: "OVER", reason: `Home O2.5: ${homeStats.over25Pct}% | Away O2.5: ${awayStats.over25Pct}%` }));
      }

      // UNDER 3.5
      if (under35Signal >= 78 && avgGoals <= 2.5) {
        const score = under35Signal + 2 - avgSP;
        if (score >= 75) allPicks.push(buildPick({ ...base, market: "UNDER 3.5", score, type: "UNDER", reason: `Media goluri: ${avgGoals.toFixed(1)} | Under35: ${under35Signal.toFixed(0)}%` }));
      }

      // BTTS
      if (bttsSignal >= 65) {
        const score = bttsSignal + 3 - Math.round((homePen + awayPen) / 2) - avgSP;
        if (score >= 75) allPicks.push(buildPick({ ...base, market: "BTTS - DA", score, type: "BTTS", reason: `Home BTTS: ${homeStats.bttsPct}% | Away BTTS: ${awayStats.bttsPct}%` }));
      }

      // GOL REPRIZA 1
      if (scoredR1Signal >= 75) {
        const score = scoredR1Signal - avgSP;
        if (score >= 75) allPicks.push(buildPick({ ...base, market: "GOL REPRIZA 1", score, type: "TIMING", reason: `Home goluri R1: ${homeStats.scoredR1Pct}% | Away: ${awayStats.scoredR1Pct}%` }));
      }

      // GOL REPRIZA 2
      if (scoredR2Signal >= 65) {
        const score = scoredR2Signal - avgSP;
        if (score >= 75) allPicks.push(buildPick({ ...base, market: "GOL REPRIZA 2", score, type: "TIMING", reason: `Home goluri R2: ${homeStats.score2HPct}% | Away: ${awayStats.score2HPct}%` }));
      }

      // 1X
      if (homeWin >= 76) allPicks.push(buildPick({ ...base, market: "1X", score: homeWin, type: "SAFE", reason: `Predicție acasă: ${predHome}% | Win acasă: ${homeStats.winPct}%` }));

      // X2
      if (awayWin >= 76) allPicks.push(buildPick({ ...base, market: "X2", score: awayWin, type: "SAFE", reason: `Predicție deplasare: ${predAway}% | Win deplasare: ${awayStats.winPct}%` }));

      // HT/FT
      if (homeStats.topHtftCode && homeStats.topHtftPct >= 60) {
        const score = homeStats.topHtftPct + Math.round(predHome * 0.15) - homePen - homeSP;
        if (score >= 75) allPicks.push(buildPick({ ...base, market: `HT/FT ${homeStats.topHtftCode}`, score, type: "HTFT", reason: `Pattern ${homeStats.topHtftCode} acasă: ${homeStats.topHtftPct}%` }));
      }

    } catch (err) {
      console.error(`Eroare ${matchName}:`, err.message);
    }
  }

  // Deduplicare + sortare + top 5
  allPicks.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set();
  const top5 = allPicks.filter(p => {
    const key = `${p.match}-${p.market}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return p.confidence >= 75;
  }).slice(0, 5);

  // ─── PATTERN WATCH ────────────────────────────────────────────────────────
  // Selectează automat cea mai consistentă echipă din fiecare țară
  const patternWatch = [];

  for (const [country, teamList] of Object.entries(PATTERN_CANDIDATES)) {
    let bestTeam = null;
    let bestScore = -1;

    // Procesăm în paralel toate echipele din țara respectivă
    const results = await Promise.all(
      teamList.map(async (team) => {
        try {
          const raw = await apiGet(
            `https://v3.football.api-sports.io/fixtures?team=${team.id}&last=15`
          );
          const matches = safeArray(raw.response);
          const homeStats = summarize(matches, team.name, "home");
          const awayStats = summarize(matches, team.name, "away");

          // Consistency score = semnalul cel mai dominant
          const signals = [
            Math.max(homeStats.over25Pct, 100 - homeStats.over25Pct),
            Math.max(homeStats.bttsPct, 100 - homeStats.bttsPct),
            Math.max(homeStats.winPct, 100 - homeStats.winPct),
            Math.max(awayStats.over25Pct, 100 - awayStats.over25Pct),
            Math.max(awayStats.bttsPct, 100 - awayStats.bttsPct)
          ];
          const consistencyScore = Math.round(
            signals.reduce((a, b) => a + b, 0) / signals.length
          );

          return { team, homeStats, awayStats, consistencyScore };
        } catch {
          return null;
        }
      })
    );

    // Găsim echipa cu cel mai bun consistency score
    for (const r of results) {
      if (r && r.consistencyScore > bestScore && r.homeStats.totalMatches >= 3) {
        bestScore = r.consistencyScore;
        bestTeam = r;
      }
    }

    if (bestTeam) {
      patternWatch.push({
        country,
        name: bestTeam.team.name,
        consistencyScore: bestTeam.consistencyScore,
        home: bestTeam.homeStats,
        away: bestTeam.awayStats
      });
    }
  }

  // ─── STATUS ZI ────────────────────────────────────────────────────────────
  const statusZi = top5.length === 0
    ? "NO BET DAY"
    : top5[0]?.confidence >= 85 || top5.length >= 3
      ? "ZI JUCABILĂ"
      : "SMART BLOCK";

  return {
    status: "OK",
    date: today,
    hourUTC: currentHourUTC,
    statusZi,
    totalMatches: candidates.length,
    totalPicks: allPicks.length,
    top5,
    patternWatch
  };
}
