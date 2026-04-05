export async function buildEliteReport(lang = "ro", apiKey) {
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY");

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

  const CUP_LEAGUES = [
    { name: "UEFA Champions League", country: "World", code: "UCL" },
    { name: "UEFA Europa League", country: "World", code: "UEL" },
    { name: "UEFA Europa Conference League", country: "World", code: "UECL" }
  ];

  const ALL_APPROVED = [...NATIONAL_LEAGUES, ...CUP_LEAGUES];

  const PATTERN_TEAMS = [
    { name: "PSV Eindhoven", id: 197, country: "Netherlands" },
    { name: "Club Brugge KV", id: 341, country: "Belgium" },
    { name: "Villarreal", id: 533, country: "Spain" },
    { name: "Werder Bremen", id: 162, country: "Germany" },
    { name: "FC Basel", id: 404, country: "Switzerland" }
  ];

  const BANNED = [
    "women", "woman", "female", "feminine", "frauen", "damen",
    "youth", "u17", "u18", "u19", "u20", "u21", "u23",
    "reserve", "reservas", "friendly", "friendlies",
    "qualification", "qualifying", "amateur",
    "srl", "virtual", "esoccer", "esports",
    "division one", "division two", "league 2", "premier league 2",
    "development", "academy", "under-"
  ];

  function isBanned(name) {
    const t = name.toLowerCase();
    return BANNED.some(k => t.includes(k) || t.endsWith(k));
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
      const nameMatch = leagueName.toLowerCase() === l.name.toLowerCase();
      const countryMatch = (countryName || "").toLowerCase() === l.country.toLowerCase();
      return nameMatch && countryMatch;
    });
  }

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
    if (s >= 80) return "MEDIU";
    return "RIDICAT";
  }

  function samplePenalty(n) {
    if (n >= 10) return 0;
    if (n >= 8) return 2;
    if (n >= 6) return 5;
    if (n >= 4) return 9;
    return 15;
  }

  async function apiGet(url) {
    const r = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d = await r.json();
    if (!d || typeof d !== "object") throw new Error("Invalid response");
    return d;
  }

  // ─── MODEL ELO ────────────────────────────────────────────────────────────
  function computeELO(matches, teamName) {
    let elo = 1500;
    const K = 32;
    const sorted = [...matches]
      .filter(m => ["FT","AET","PEN"].includes(m?.fixture?.status?.short || ""))
      .sort((a, b) => (a?.fixture?.timestamp || 0) - (b?.fixture?.timestamp || 0));

    sorted.forEach(m => {
      const isHome = m?.teams?.home?.name === teamName;
      const homeGoals = Number(m?.goals?.home ?? 0);
      const awayGoals = Number(m?.goals?.away ?? 0);
      const myGoals = isHome ? homeGoals : awayGoals;
      const oppGoals = isHome ? awayGoals : homeGoals;
      const homeAdvantage = isHome ? 50 : 0;
      const expectedScore = 1 / (1 + Math.pow(10, -(homeAdvantage) / 400));
      let actualScore = 0.5;
      if (myGoals > oppGoals) actualScore = 1;
      if (myGoals < oppGoals) actualScore = 0;
      elo = elo + K * (actualScore - expectedScore);
    });
    return Math.round(elo);
  }

  // ─── MODEL POISSON ────────────────────────────────────────────────────────
  function poissonProb(lambda, k) {
    let factorial = 1;
    for (let i = 1; i <= k; i++) factorial *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
  }

  function computePoissonPredictions(homeAttack, homeDefense, awayAttack, awayDefense, leagueAvgGoals = 2.7) {
    const homeLambda = homeAttack * awayDefense * leagueAvgGoals;
    const awayLambda = awayAttack * homeDefense * leagueAvgGoals;

    let homeWin = 0, draw = 0, awayWin = 0;
    let over15 = 0, over25 = 0, over35 = 0, btts = 0;

    for (let h = 0; h <= 6; h++) {
      for (let a = 0; a <= 6; a++) {
        const prob = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
        if (h > a) homeWin += prob;
        else if (h === a) draw += prob;
        else awayWin += prob;
        const total = h + a;
        if (total > 1.5) over15 += prob;
        if (total > 2.5) over25 += prob;
        if (total > 3.5) over35 += prob;
        if (h > 0 && a > 0) btts += prob;
      }
    }

    const expectedTotalGoals = homeLambda + awayLambda;
    const firstHalfLambda = expectedTotalGoals * 0.45;
    const firstHalfGoal = 1 - poissonProb(firstHalfLambda, 0);

    return {
      homeWinPct: Math.round(homeWin * 100),
      drawPct: Math.round(draw * 100),
      awayWinPct: Math.round(awayWin * 100),
      over15Pct: Math.round(over15 * 100),
      over25Pct: Math.round(over25 * 100),
      over35Pct: Math.round(over35 * 100),
      bttsPct: Math.round(btts * 100),
      firstHalfGoalPct: Math.round(firstHalfGoal * 100),
      homeLambda: Number(homeLambda.toFixed(2)),
      awayLambda: Number(awayLambda.toFixed(2)),
      expectedGoals: Number(expectedTotalGoals.toFixed(2))
    };
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
    let filtered = matches.filter(m => {
      const side = getTeamSide(m, teamName);
      const status = m?.fixture?.status?.short || "";
      return ["FT","AET","PEN"].includes(status) &&
        (sideFilter ? side === sideFilter : !!side);
    });

    // ── FALLBACK — dacă mai puțin de 5 meciuri pe side, luăm toate ──
    if (filtered.length < 5) {
      filtered = matches.filter(m => {
        const side = getTeamSide(m, teamName);
        const status = m?.fixture?.status?.short || "";
        return ["FT","AET","PEN"].includes(status) && !!side;
      });
    }

    const totals = [], goalsFor = [], goalsAgainst = [];
    let over25=0, btts=0, under35=0, win=0, score2H=0, scoredR1=0;
    const htftMap = {};

    filtered.forEach(m => {
      const { gf, ga } = getGoalsFA(m, teamName);
      const total = gf + ga;
      totals.push(total);
      goalsFor.push(gf);
      goalsAgainst.push(ga);
      if (total >= 3) over25++;
      if (gf > 0 && ga > 0) btts++;
      if (total <= 3) under35++;
      if (gf > ga) win++;
      if (gf > 0) scoredR1++;
      const ht = getHtFA(m, teamName);
      if (ht.gf !== null) {
        const code = `${rc(ht.gf, ht.ga)}/${rc(gf, ga)}`;
        htftMap[code] = (htftMap[code] || 0) + 1;
        if (gf - ht.gf >= 1) score2H++;
      }
    });

    const n = filtered.length;
    const topHtft = Object.entries(htftMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];
    const avgGF = avg(goalsFor);
    const avgGA = avg(goalsAgainst);
    const leagueAvg = 2.7;
    const attackStrength = avgGF / (leagueAvg / 2);
    const defenseWeakness = avgGA / (leagueAvg / 2);

    return {
      totalMatches: n,
      avgGoals: Number(avg(totals).toFixed(2)),
      avgGF: Number(avgGF.toFixed(2)),
      avgGA: Number(avgGA.toFixed(2)),
      attackStrength: Number(attackStrength.toFixed(3)),
      defenseWeakness: Number(defenseWeakness.toFixed(3)),
      over25Pct: pct(over25, n),
      bttsPct: pct(btts, n),
      under35Pct: pct(under35, n),
      winPct: pct(win, n),
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

  // ─── CORNERE — medie din ultimele 3 meciuri per echipă ───────────────────
  async function getCornersAvg(fixtureIds) {
    if (!fixtureIds || fixtureIds.length === 0) return null;
    let total = 0, count = 0;
    const fetches = fixtureIds.slice(0, 3).map(id =>
      apiGet(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${id}`)
        .catch(() => null)
    );
    const results = await Promise.all(fetches);
    for (const r of results) {
      if (!r) continue;
      const stats = safeArray(r.response);
      let matchCorners = 0;
      for (const teamStats of stats) {
        const cornerStat = safeArray(teamStats?.statistics).find(
          s => s?.type === "Corner Kicks"
        );
        if (cornerStat?.value != null) {
          matchCorners += Number(cornerStat.value) || 0;
        }
      }
      if (matchCorners > 0) { total += matchCorners; count++; }
    }
    return count > 0 ? Number((total / count).toFixed(1)) : null;
  }

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

    const homeELO = computeELO(homeHistory, home);
    const awayELO = computeELO(awayHistory, away);
    const eloDiff = homeELO - awayELO;

    const predHome = Number(String(prediction?.predictions?.percent?.home || "0").replace("%",""));
    const predAway = Number(String(prediction?.predictions?.percent?.away || "0").replace("%",""));

    const homePen = absencePenalty(injuries, home);
    const awayPen = absencePenalty(injuries, away);
    const homeSP = samplePenalty(hS.totalMatches);
    const awaySP = samplePenalty(aS.totalMatches);
    const avgSP = Math.round((homeSP + awaySP) / 2);

    const poisson = computePoissonPredictions(
      hS.attackStrength || 1,
      hS.defenseWeakness || 1,
      aS.attackStrength || 1,
      aS.defenseWeakness || 1,
      2.7
    );

    function combinedConfidence(poissonPct, classicPct, apiPct, penalty) {
      const raw = (poissonPct * 0.40) + (classicPct * 0.35) + (apiPct * 0.25);
      return Math.round(raw - penalty);
    }

    const base = { match: matchName, league: leagueName, country: countryName, kickoffTs };
    const picks = [];
    const MIN_CONFIDENCE = 80;

    // ── OVER 2.5 ──────────────────────────────────────────────────────────
    const over25Classic = (hS.over25Pct + aS.over25Pct) / 2;
    const over25Score = combinedConfidence(
      poisson.over25Pct, over25Classic,
      predHome > predAway ? predHome * 0.8 : predAway * 0.8,
      avgSP + Math.round((homePen + awayPen) / 2)
    );
    if (over25Score >= MIN_CONFIDENCE && poisson.expectedGoals >= 2.5) {
      picks.push(buildPick({
        ...base, market: "OVER 2.5", score: over25Score, type: "OVER",
        reason: `Poisson xG: ${poisson.expectedGoals} | Over2.5: ${poisson.over25Pct}% | Classic: ${over25Classic.toFixed(0)}%`
      }));
    }

    // ── UNDER 2.5 ─────────────────────────────────────────────────────────
    const under25Poisson = 100 - poisson.over25Pct;
    const under25Classic = (hS.under35Pct + aS.under35Pct) / 2;
    const under25Score = combinedConfidence(
      under25Poisson, under25Classic,
      100 - Math.max(predHome, predAway), avgSP
    );
    if (under25Score >= MIN_CONFIDENCE && poisson.expectedGoals <= 2.3) {
      picks.push(buildPick({
        ...base, market: "UNDER 2.5", score: under25Score, type: "UNDER",
        reason: `Poisson xG: ${poisson.expectedGoals} | Under2.5: ${under25Poisson}%`
      }));
    }

    // ── BTTS ──────────────────────────────────────────────────────────────
    const bttsClassic = (hS.bttsPct + aS.bttsPct) / 2;
    const bttsScore = combinedConfidence(
      poisson.bttsPct, bttsClassic, 60,
      avgSP + Math.round((homePen + awayPen) / 2)
    );
    if (bttsScore >= MIN_CONFIDENCE) {
      picks.push(buildPick({
        ...base, market: "BTTS - DA", score: bttsScore, type: "BTTS",
        reason: `Poisson BTTS: ${poisson.bttsPct}% | Classic: ${bttsClassic.toFixed(0)}%`
      }));
    }

   

    // ── 1X ────────────────────────────────────────────────────────────────
    const homeWinPoisson = poisson.homeWinPct + poisson.drawPct;
    const oneXScore = combinedConfidence(
      homeWinPoisson, hS.winPct,
      predHome + (predHome * 0.3),
      homePen + homeSP
    );
    if (oneXScore >= MIN_CONFIDENCE && eloDiff >= 50) {
      picks.push(buildPick({
        ...base, market: "1X", score: oneXScore, type: "SAFE",
        reason: `Poisson 1X: ${homeWinPoisson}% | ELO diff: +${eloDiff} | API: ${predHome}%`
      }));
    }

    // ── X2 ────────────────────────────────────────────────────────────────
    const awayWinPoisson = poisson.awayWinPct + poisson.drawPct;
    const x2Score = combinedConfidence(
      awayWinPoisson, aS.winPct,
      predAway + (predAway * 0.3),
      awayPen + awaySP
    );
    if (x2Score >= MIN_CONFIDENCE && eloDiff <= -50) {
      picks.push(buildPick({
        ...base, market: "X2", score: x2Score, type: "SAFE",
        reason: `Poisson X2: ${awayWinPoisson}% | ELO diff: ${eloDiff} | API: ${predAway}%`
      }));
    }

    // ── HT/FT ─────────────────────────────────────────────────────────────
    if (hS.topHtftCode && hS.topHtftPct >= 55) {
      const htftScore = combinedConfidence(
        hS.topHtftPct, hS.topHtftPct, predHome * 0.5,
        homePen + homeSP
      );
      if (htftScore >= MIN_CONFIDENCE) {
        picks.push(buildPick({
          ...base, market: `HT/FT ${hS.topHtftCode}`, score: htftScore, type: "HTFT",
          reason: `Pattern ${hS.topHtftCode}: ${hS.topHtftPct}% | ELO: ${homeELO}`
        }));
      }
    }

    // ── CORNERE OVER 9.5 ──────────────────────────────────────────────────
    try {
      const homeFixtureIds = homeHistory
        .filter(m => ["FT","AET","PEN"].includes(m?.fixture?.status?.short || ""))
        .slice(0, 3)
        .map(m => m?.fixture?.id)
        .filter(Boolean);

      const awayFixtureIds = awayHistory
        .filter(m => ["FT","AET","PEN"].includes(m?.fixture?.status?.short || ""))
        .slice(0, 3)
        .map(m => m?.fixture?.id)
        .filter(Boolean);

      const [homeCorners, awayCorners] = await Promise.all([
        getCornersAvg(homeFixtureIds),
        getCornersAvg(awayFixtureIds)
      ]);

      if (homeCorners !== null && awayCorners !== null) {
        const avgCorners = (homeCorners + awayCorners) / 2;
        // Confidence bazat pe media cornere
        const cornerConf = avgCorners >= 11 ? 85
          : avgCorners >= 10 ? 82
          : avgCorners >= 9.5 ? 80
          : 0;

        if (cornerConf >= MIN_CONFIDENCE) {
          picks.push(buildPick({
            ...base,
            market: "CORNERE OVER 9.5",
            score: cornerConf - avgSP,
            type: "CORNERS",
            reason: `Medie cornere: ${avgCorners} (acasă: ${homeCorners} | deplasare: ${awayCorners})`
          }));
        }
      }
    } catch (cornerErr) {
      // Silently skip dacă API cornere pică
    }

    return picks;
  }

  // ─── FETCH FIXTURES ───────────────────────────────────────────────────────
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

  const PRIO = ["ENG1","ESP1","ITA1","GER1","FRA1","BEL1","NED1","POR1","TUR1","SCO1","SUI1","GRE1","UCL","UEL","UECL"];
  function getPrio(m) {
    const l = getApprovedLeague(m?.league?.name||"", m?.league?.country||"");
    if (!l) return 99;
    const i = PRIO.indexOf(l.code);
    return i === -1 ? 99 : i;
  }
  nationalFixtures.sort((a, b) => getPrio(a) - getPrio(b));
  cupFixtures.sort((a, b) => getPrio(a) - getPrio(b));

  const allPicks = [];
  const analyzedCount = { total: 0 };

  for (const match of nationalFixtures.slice(0, 10)) {
    try {
      const picks = await analyzeMatch(match);
      allPicks.push(...picks);
      analyzedCount.total++;
    } catch (err) {
      console.error("Eroare meci:", err.message);
    }
  }

  if (allPicks.filter(p => p.confidence >= 80).length < 3) {
    for (const match of cupFixtures.slice(0, 5)) {
      try {
        const picks = await analyzeMatch(match);
        allPicks.push(...picks);
        analyzedCount.total++;
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
    return p.confidence >= 80;
  }).slice(0, 5);

  // ─── PATTERN WATCH ────────────────────────────────────────────────────────
  const patternWatch = [];

  for (const team of PATTERN_TEAMS) {
    const todayMatch = allFixtures.find(m => {
      const status = m?.fixture?.status?.short || "";
      if (!["NS","TBD","1H","2H","HT"].includes(status)) return false;
      return m?.teams?.home?.name === team.name || m?.teams?.away?.name === team.name;
    });

    if (!todayMatch) continue;

    const home = todayMatch?.teams?.home?.name || "";
    const away = todayMatch?.teams?.away?.name || "";
    const isHome = home === team.name;
    const opponent = isHome ? away : home;
    const kickoffTs = todayMatch?.fixture?.timestamp;
    const leagueName = todayMatch?.league?.name || "";

    try {
      const raw = await apiGet(`https://v3.football.api-sports.io/fixtures?team=${team.id}&last=15`);
      const matches = safeArray(raw.response);
      const sideFilter = isHome ? "home" : "away";
      const stats = summarize(matches, team.name, sideFilter);
      const elo = computeELO(matches, team.name);

      const signals = [
        { label: "Over 2.5", val: stats.over25Pct },
        { label: "BTTS", val: stats.bttsPct },
        { label: "Under 3.5", val: stats.under35Pct },
        { label: "Win", val: stats.winPct },
        { label: "Gol R1", val: stats.scoredR1Pct },
        { label: "Gol R2", val: stats.score2HPct }
      ].sort((a, b) => b.val - a.val)[0];

      patternWatch.push({
        name: team.name, country: team.country,
        opponent, isHome,
        kickoffUTC: fmtUTC(kickoffTs),
        kickoffLocal: fmtLocal(kickoffTs, team.country),
        league: leagueName, elo, stats,
        topSignal: signals
      });
    } catch (err) {
      console.error(`Pattern error ${team.name}:`, err.message);
    }
  }

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
    totalMatches: analyzedCount.total,
    totalPicks: allPicks.length,
    top5,
    patternWatch
  };
}
