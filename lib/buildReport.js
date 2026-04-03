export async function buildEliteReport(lang = "ro", apiKey) {
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY");

  // ─── LIGI NAȚIONALE (prioritate TOP 5) ───────────────────────────────────
  const NATIONAL_LEAGUES = [
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

  // ─── CUPE EUROPENE (fallback dacă nu sunt suficiente meciuri naționale) ───
  const CUP_LEAGUES = [
    { name: "UEFA Champions League", country: "World", code: "UCL" },
    { name: "UEFA Europa League", country: "World", code: "UEL" },
    { name: "UEFA Europa Conference League", country: "World", code: "UECL" }
  ];

  const ALL_APPROVED = [...NATIONAL_LEAGUES, ...CUP_LEAGUES];

  // ─── ECHIPE FIXE PATTERN WATCH ────────────────────────────────────────────
  const PATTERN_TEAMS = [
    { name: "PSV Eindhoven", id: 197, country: "Netherlands" },
    { name: "Club Brugge KV", id: 341, country: "Belgium" },
    { name: "Villarreal", id: 533, country: "Spain" },
    { name: "Werder Bremen", id: 162, country: "Germany" },
    { name: "FC Basel", id: 404, country: "Switzerland" }
  ];

  // ─── BANNED ───────────────────────────────────────────────────────────────
  const BANNED = [
    "women", "woman", "female", "feminine", "frauen", "damen",
    "youth", "u17", "u18", "u19", "u20", "u21", "u23",
    "reserve", "reservas", "friendly", "friendlies",
    "qualification", "qualifying", "amateur",
    "srl", "virtual", "esoccer", "esports"
    "division one", "division two", "league 2", "premier league 2", "development", "academy" ,"under-"
  ];

  function isBanned(name) {
    const t = name.toLowerCase();
    return BANNED.some(k => t.includes(k));
  }

  function getApprovedLeague(leagueName, countryName) {
    if (isBanned(leagueName)) return null;
    return ALL_APPROVED.find(l => {
      const nameMatch = leagueName.toLowerCase() === l.name.toLowerCase();
       
      const countryMatch = l.country === "World" ||
        (countryName || "").toLowerCase() === l.country.toLowerCase();
      return nameMatch && countryMatch;
    }) || null;
  }

  function isNationalLeague(leagueName, countryName) {
    if (isBanned(leagueName)) return false;
    return NATIONAL_LEAGUES.some(l => {
      const nameMatch = leagueName.toLowerCase().includes(l.name.toLowerCase()) ||
        l.name.toLowerCase().includes(leagueName.toLowerCase());
      const countryMatch = (countryName || "").toLowerCase() === l.country.toLowerCase();
      return nameMatch && countryMatch;
    });
  }

  // ─── TIMP ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  const currentHourUTC = now.getUTCHours();
  const currentMinUTC = now.getUTCMinutes();
  const nowMinUTC = currentHourUTC * 60 + currentMinUTC;

  const COUNTRY_OFFSET = {
    "England": 1, "Scotland": 1, "Portugal": 1,
    "Spain": 2, "France": 2, "Switzerland": 2, "Belgium": 2,
    "Netherlands": 2, "Germany": 2, "Italy": 2,
    "Turkey": 3, "Greece": 3, "World": 2
  };

  function safeArray(v) { return Array.isArray(v) ? v : []; }
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }

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

  function marketRisk(s) {
    if (s >= 85) return "SCĂZUT";
    if (s >= 75) return "MEDIU";
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
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d = await r.json();
    if (!d || typeof d !== "object") throw new Error("Invalid response");
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
      return ["FT","AET","PEN"].includes(status) &&
        (sideFilter ? side === sideFilter : !!side);
    });

    const totals = [];
    let over25=0, btts=0, under35=0, win=0, drawHT=0, score2H=0, scoredR1=0;
    const htftMap = {};

    filtered.forEach(m => {
      const { gf, ga } = getGoalsFA(m, teamName);
      const total = gf + ga;
      totals.push(total);
      if (total >= 3) over25++;
      if (gf > 0 && ga > 0) btts++;
      if (total <= 3) under35++;
      if (gf > ga) win++;
      if (gf > 0) scoredR1++;
      const ht = getHtFA(m, teamName);
      if (ht.gf !== null) {
        if (ht.gf === ht.ga) drawHT++;
        const code = `${rc(ht.gf, ht.ga)}/${rc(gf, ga)}`;
        htftMap[code] = (htftMap[code] || 0) + 1;
        if (gf - ht.gf >= 1) score2H++;
      }
    });

    const n = filtered.length;
    const topHtft = Object.entries(htftMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    return {
      totalMatches: n,
      avgGoals: Number(avg(totals).toFixed(2)),
      over25Pct: pct(over25, n),
      bttsPct: pct(btts, n),
      under35Pct: pct(under35, n),
      winPct: pct(win, n),
      drawHTPct: pct(drawHT, n),
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
    return {
      match, league, country,
      kickoffUTC: fmtUTC(kickoffTs),
      kickoffLocal: fmtLocal(kickoffTs, country),
      market, confidence,
      risk: marketRisk(confidence),
      type, reason
    };
  }

  // ─── ANALIZEAZĂ UN MECI ───────────────────────────────────────────────────
  async function analyzeMatch(match) {
    const leagueName = match?.league?.name || "";
    const countryName = match?.league?.country || "";
    const home = match?.teams?.home?.name || "";
    const away = match?.teams?.away?.name || "";
    const fixtureId = match?.fixture?.id;
    const kickoffTs = match?.fixture?.timestamp;
    const matchName = `${home} vs ${away}`;

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

    const hS = summarize(homeHistory, home, "home");
    const aS = summarize(awayHistory, away, "away");

    const predHome = Number(String(prediction?.predictions?.percent?.home || "0").replace("%",""));
    const predAway = Number(String(prediction?.predictions?.percent?.away || "0").replace("%",""));

    const homePen = absencePenalty(injuries, home);
    const awayPen = absencePenalty(injuries, away);
    const avgSP = Math.round((samplePenalty(hS.totalMatches) + samplePenalty(aS.totalMatches)) / 2);
    const avgGoals = (hS.avgGoals + aS.avgGoals) / 2;
    const over25Sig = (hS.over25Pct + aS.over25Pct) / 2;
    const bttsSig = (hS.bttsPct + aS.bttsPct) / 2;
    const under35Sig = (hS.under35Pct + aS.under35Pct) / 2;
    const homeWin = (predHome * 0.55) + (hS.winPct * 0.45) - homePen - samplePenalty(hS.totalMatches);
    const awayWin = (predAway * 0.55) + (aS.winPct * 0.45) - awayPen - samplePenalty(aS.totalMatches);
    const r1Sig = (hS.scoredR1Pct + aS.scoredR1Pct) / 2;
    const r2Sig = (hS.score2HPct + aS.score2HPct) / 2;

    const base = { match: matchName, league: leagueName, country: countryName, kickoffTs };
    const picks = [];

    if (avgGoals >= 2.7 && over25Sig >= 65) {
      const s = over25Sig + 5 - Math.round((homePen+awayPen)/2) - avgSP;
      if (s >= 75) picks.push(buildPick({ ...base, market: "OVER 2.5", score: s, type: "OVER", reason: `Home O2.5: ${hS.over25Pct}% | Away O2.5: ${aS.over25Pct}%` }));
    }
    if (under35Sig >= 78 && avgGoals <= 2.5) {
      const s = under35Sig + 2 - avgSP;
      if (s >= 75) picks.push(buildPick({ ...base, market: "UNDER 3.5", score: s, type: "UNDER", reason: `Media goluri: ${avgGoals.toFixed(1)} | Under3.5: ${under35Sig.toFixed(0)}%` }));
    }
    if (bttsSig >= 65) {
      const s = bttsSig + 3 - Math.round((homePen+awayPen)/2) - avgSP;
      if (s >= 75) picks.push(buildPick({ ...base, market: "BTTS - DA", score: s, type: "BTTS", reason: `Home BTTS: ${hS.bttsPct}% | Away BTTS: ${aS.bttsPct}%` }));
    }
    if (r1Sig >= 75) {
      const s = r1Sig - avgSP;
      if (s >= 75) picks.push(buildPick({ ...base, market: "GOL REPRIZA 1", score: s, type: "TIMING", reason: `Gol R1: Home ${hS.scoredR1Pct}% | Away ${aS.scoredR1Pct}%` }));
    }
    if (r2Sig >= 65) {
      const s = r2Sig - avgSP;
      if (s >= 75) picks.push(buildPick({ ...base, market: "GOL REPRIZA 2", score: s, type: "TIMING", reason: `Gol R2: Home ${hS.score2HPct}% | Away ${aS.score2HPct}%` }));
    }
    if (homeWin >= 76) picks.push(buildPick({ ...base, market: "1X", score: homeWin, type: "SAFE", reason: `Predicție acasă: ${predHome}% | Win acasă: ${hS.winPct}%` }));
    if (awayWin >= 76) picks.push(buildPick({ ...base, market: "X2", score: awayWin, type: "SAFE", reason: `Predicție deplasare: ${predAway}% | Win deplasare: ${aS.winPct}%` }));
    if (hS.topHtftCode && hS.topHtftPct >= 60) {
      const s = hS.topHtftPct + Math.round(predHome * 0.15) - homePen - samplePenalty(hS.totalMatches);
      if (s >= 75) picks.push(buildPick({ ...base, market: `HT/FT ${hS.topHtftCode}`, score: s, type: "HTFT", reason: `Pattern ${hS.topHtftCode}: ${hS.topHtftPct}%` }));
    }

    return picks;
  }

  // ─── FETCH ALL FIXTURES ───────────────────────────────────────────────────
  const fixturesRaw = await apiGet(`https://v3.football.api-sports.io/fixtures?date=${today}`);
  const allFixtures = safeArray(fixturesRaw.response);

  function isValidFixture(match) {
    const status = match?.fixture?.status?.short || "";
    if (!["NS","TBD"].includes(status)) return false;
    const leagueName = match?.league?.name || "";
    const countryName = match?.league?.country || "";
    if (!getApprovedLeague(leagueName, countryName)) return false;
    const kickoffTs = match?.fixture?.timestamp;
    if (kickoffTs) {
      const d = new Date(kickoffTs * 1000);
      const kickMin = d.getUTCHours() * 60 + d.getUTCMinutes();
      const diff = kickMin - nowMinUTC;
      if (diff >= 0 && diff < 45) return false;
    }
    return true;
  }

  const nationalFixtures = allFixtures.filter(m =>
    isValidFixture(m) && isNationalLeague(m?.league?.name || "", m?.league?.country || "")
  );
  const cupFixtures = allFixtures.filter(m =>
    isValidFixture(m) && !isNationalLeague(m?.league?.name || "", m?.league?.country || "")
  );

  // Prioritizare
  const PRIO = ["ENG1","ESP1","ITA1","GER1","FRA1","BEL1","NED1","POR1","TUR1","SCO1","SUI1","GRE1","UCL","UEL","UECL"];
  function getPrio(m) {
    const l = getApprovedLeague(m?.league?.name||"", m?.league?.country||"");
    if (!l) return 99;
    const i = PRIO.indexOf(l.code);
    return i === -1 ? 99 : i;
  }
  nationalFixtures.sort((a, b) => getPrio(a) - getPrio(b));
  cupFixtures.sort((a, b) => getPrio(a) - getPrio(b));

  // Analizăm meciuri naționale mai întâi, apoi completăm cu cupe
  const allPicks = [];
  const analyzedMatches = [];

  for (const match of nationalFixtures.slice(0, 10)) {
    try {
      const picks = await analyzeMatch(match);
      allPicks.push(...picks);
      analyzedMatches.push(match?.teams?.home?.name + " vs " + match?.teams?.away?.name);
    } catch (err) {
      console.error("Eroare meci:", err.message);
    }
  }

  // Dacă avem sub 3 picks naționale, adăugăm meciuri din cupe
  if (allPicks.filter(p => p.confidence >= 75).length < 3) {
    for (const match of cupFixtures.slice(0, 5)) {
      try {
        const picks = await analyzeMatch(match);
        allPicks.push(...picks);
      } catch (err) {
        console.error("Eroare cup:", err.message);
      }
    }
  }

  allPicks.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set();
  const top5 = allPicks.filter(p => {
    const key = `${p.match}-${p.market}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return p.confidence >= 75;
  }).slice(0, 5);

  // ─── PATTERN WATCH — DOAR ECHIPE CARE JOACĂ AZI ──────────────────────────
  const patternWatch = [];

  for (const team of PATTERN_TEAMS) {
    // Caută dacă echipa joacă azi
    const todayMatch = allFixtures.find(m => {
      const status = m?.fixture?.status?.short || "";
      if (!["NS","TBD","1H","2H","HT"].includes(status)) return false;
      return m?.teams?.home?.name === team.name || m?.teams?.away?.name === team.name;
    });

    if (!todayMatch) continue; // Nu joacă azi — skip

    const home = todayMatch?.teams?.home?.name || "";
    const away = todayMatch?.teams?.away?.name || "";
    const isHome = home === team.name;
    const opponent = isHome ? away : home;
    const kickoffTs = todayMatch?.fixture?.timestamp;
    const leagueName = todayMatch?.league?.name || "";

    try {
      const raw = await apiGet(
        `https://v3.football.api-sports.io/fixtures?team=${team.id}&last=15`
      );
      const matches = safeArray(raw.response);
      const sideFilter = isHome ? "home" : "away";
      const stats = summarize(matches, team.name, sideFilter);

      // Cel mai puternic semnal
      const signals = [
        { label: "Over 2.5", val: stats.over25Pct },
        { label: "BTTS", val: stats.bttsPct },
        { label: "Under 3.5", val: stats.under35Pct },
        { label: "Win", val: stats.winPct },
        { label: "Gol R1", val: stats.scoredR1Pct },
        { label: "Gol R2", val: stats.score2HPct }
      ].sort((a, b) => b.val - a.val)[0];

      patternWatch.push({
        name: team.name,
        country: team.country,
        opponent,
        isHome,
        kickoffUTC: fmtUTC(kickoffTs),
        kickoffLocal: fmtLocal(kickoffTs, team.country),
        league: leagueName,
        stats,
        topSignal: signals
      });
    } catch (err) {
      console.error(`Pattern error ${team.name}:`, err.message);
    }
  }

  // ─── STATUS ───────────────────────────────────────────────────────────────
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
    totalMatches: analyzedMatches.length,
    totalPicks: allPicks.length,
    top5,
    patternWatch
  };
}
