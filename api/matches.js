export default async function handler(req, res) {
  const API_KEY = process.env.API_FOOTBALL_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      status: "ERROR",
      message: "Missing API_FOOTBALL_KEY"
    });
  }

  const lang = String(req.query.lang || "ro").toLowerCase() === "en" ? "en" : "ro";

  const T = {
    ro: {
      play: "ZI JUCABILĂ",
      nobet: "NO BET DAY",
      smartBlock: "SMART BLOCK",
      top1: "TOP 1",
      top3: "TOP 3",
      top5: "TOP 5",
      safe: "SAFE PICKS",
      value: "VALUE PICKS",
      htft: "HT/FT PICKS",
      corners: "CORNERS PICKS",
      tracked: "TRACKED TEAMS",
      low: "LOW",
      medium: "MEDIUM",
      high: "HIGH",
      yes: "DA",
      no: "NU",
      verdict: "VERDICT",
      reason: "MOTIV",
      risk: "RISC"
    },
    en: {
      play: "PLAY DAY",
      nobet: "NO BET DAY",
      smartBlock: "SMART BLOCK",
      top1: "TOP 1",
      top3: "TOP 3",
      top5: "TOP 5",
      safe: "SAFE PICKS",
      value: "VALUE PICKS",
      htft: "HT/FT PICKS",
      corners: "CORNERS PICKS",
      tracked: "TRACKED TEAMS",
      low: "LOW",
      medium: "MEDIUM",
      high: "HIGH",
      yes: "YES",
      no: "NO",
      verdict: "VERDICT",
      reason: "REASON",
      risk: "RISK"
    }
  }[lang];

  const ELITE_CONFIG = {
    leagues: [
      { code: "JAPAN", keywords: ["J-League", "J1 League", "Japan"] },
      { code: "KOREA", keywords: ["K League", "K-League", "Korea Republic", "South Korea"] },
      { code: "BELGIUM", keywords: ["Belgium", "Jupiler Pro League"] },
      { code: "ITALY", keywords: ["Serie A", "Serie B", "Italy"] },
      { code: "SPAIN", keywords: ["La Liga", "Segunda", "Spain"] },
      { code: "GERMANY", keywords: ["Bundesliga", "2. Bundesliga", "Germany"] }
    ],
    trackedTeams: {
      JAPAN: [
        "Kawasaki Frontale",
        "Yokohama F. Marinos",
        "Kashima Antlers",
        "Urawa Red Diamonds"
      ],
      KOREA: [
        "Ulsan Hyundai",
        "Jeonbuk Hyundai Motors",
        "Pohang Steelers"
      ],
      BELGIUM: [
        "Club Brugge KV",
        "Genk",
        "Union St. Gilloise",
        "Anderlecht"
      ],
      ITALY: [
        "Atalanta",
        "Inter",
        "Cesena"
      ],
      SPAIN: [
        "Celta Vigo",
        "Girona",
        "Villarreal"
      ],
      GERMANY: [
        "Bayer Leverkusen",
        "Bayern Munich",
        "Stuttgart"
      ]
    }
  };

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  const currentHour = now.getUTCHours();

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  function includesAny(text, keywords) {
    const value = String(text || "").toLowerCase();
    return keywords.some((k) => value.includes(k.toLowerCase()));
  }

  function detectLeagueCode(leagueName) {
    const found = ELITE_CONFIG.leagues.find((l) => includesAny(leagueName, l.keywords));
    return found ? found.code : null;
  }

  function isTrackedTeam(leagueCode, teamName) {
    const list = ELITE_CONFIG.trackedTeams[leagueCode] || [];
    return list.includes(teamName);
  }

  function marketRisk(score) {
    if (score >= 85) return T.low;
    if (score >= 75) return T.medium;
    return T.high;
  }

  async function apiGet(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY
      }
    });
    const data = await response.json();
    return data;
  }

  function getTeamSide(match, teamName) {
    const home = match?.teams?.home?.name || "";
    const away = match?.teams?.away?.name || "";
    if (home === teamName) return "home";
    if (away === teamName) return "away";
    return null;
  }

  function getGoalsForAgainst(match, teamName) {
    const side = getTeamSide(match, teamName);
    const homeGoals = Number(match?.goals?.home ?? 0);
    const awayGoals = Number(match?.goals?.away ?? 0);

    if (side === "home") {
      return { gf: homeGoals, ga: awayGoals };
    }
    if (side === "away") {
      return { gf: awayGoals, ga: homeGoals };
    }
    return { gf: 0, ga: 0 };
  }

  function getHtForAgainst(match, teamName) {
    const side = getTeamSide(match, teamName);
    const htHome = match?.score?.halftime?.home;
    const htAway = match?.score?.halftime?.away;

    if (htHome === null || htHome === undefined || htAway === null || htAway === undefined) {
      return { gf: null, ga: null };
    }

    if (side === "home") return { gf: Number(htHome), ga: Number(htAway) };
    if (side === "away") return { gf: Number(htAway), ga: Number(htHome) };
    return { gf: null, ga: null };
  }

  function resultCode(gf, ga) {
    if (gf > ga) return "W";
    if (gf < ga) return "L";
    return "D";
  }

  function htftCode(match, teamName) {
    const ht = getHtForAgainst(match, teamName);
    const ft = getGoalsForAgainst(match, teamName);

    if (ht.gf === null || ht.ga === null) return null;

    return `${resultCode(ht.gf, ht.ga)}/${resultCode(ft.gf, ft.ga)}`;
  }

  function summarizeTeamHistory(matches, teamName, sideFilter) {
    const filtered = matches.filter((m) => {
      const side = getTeamSide(m, teamName);
      return sideFilter ? side === sideFilter : !!side;
    });

    const totals = [];
    let over15 = 0;
    let over25 = 0;
    let btts = 0;
    let under35 = 0;
    let win = 0;
    let drawHT = 0;
    let leadHT = 0;
    let score2HPattern = 0;

    const htftMap = {};

    filtered.forEach((m) => {
      const { gf, ga } = getGoalsForAgainst(m, teamName);
      const total = gf + ga;
      totals.push(total);

      if (total >= 2) over15++;
      if (total >= 3) over25++;
      if (gf > 0 && ga > 0) btts++;
      if (total <= 3) under35++;
      if (gf > ga) win++;

      const ht = getHtForAgainst(m, teamName);
      if (ht.gf !== null) {
        if (ht.gf === ht.ga) drawHT++;
        if (ht.gf > ht.ga) leadHT++;
      }

      const htft = htftCode(m, teamName);
      if (htft) {
        htftMap[htft] = (htftMap[htft] || 0) + 1;
      }

      // simple 2nd half pattern:
      if (ht.gf !== null) {
        const secondHalfGoalsFor = gf - ht.gf;
        if (secondHalfGoalsFor >= 1) score2HPattern++;
      }
    });

    const totalMatches = filtered.length;
    const topHtft = Object.entries(htftMap).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    return {
      totalMatches,
      avgGoals: Number(avg(totals).toFixed(2)),
      over15Pct: pct(over15, totalMatches),
      over25Pct: pct(over25, totalMatches),
      bttsPct: pct(btts, totalMatches),
      under35Pct: pct(under35, totalMatches),
      winPct: pct(win, totalMatches),
      drawHTPct: pct(drawHT, totalMatches),
      leadHTPct: pct(leadHT, totalMatches),
      score2HPct: pct(score2HPattern, totalMatches),
      topHtftCode: topHtft[0],
      topHtftPct: pct(topHtft[1], totalMatches)
    };
  }

  function computeAbsencePenalty(injuries, teamName) {
    const teamInjuries = injuries.filter((i) => i?.team?.name === teamName);
    const count = teamInjuries.length;

    if (count >= 5) return 10;
    if (count >= 3) return 6;
    if (count >= 1) return 2;
    return 0;
  }

  function buildPick({
    match,
    league,
    market,
    score,
    reason,
    type,
    extra = {}
  }) {
    return {
      match,
      league,
      market,
      confidence: Math.max(0, Math.min(99, Math.round(score))),
      risk: marketRisk(score),
      type,
      reason,
      verdict: score >= 75 ? T.yes : T.no,
      ...extra
    };
  }

  try {
    const fixturesData = await apiGet(`https://v3.football.api-sports.io/fixtures?date=${today}`);
    const allFixtures = safeArray(fixturesData.response);

    const upcoming = allFixtures.filter((match) => {
      const status = match?.fixture?.status?.short || "";
      return status === "NS" || status === "TBD";
    });

    const candidateFixtures = upcoming.filter((match) => {
      const leagueName = match?.league?.name || "";
      const leagueCode = detectLeagueCode(leagueName);
      if (!leagueCode) return false;

      const home = match?.teams?.home?.name || "";
      const away = match?.teams?.away?.name || "";

      return isTrackedTeam(leagueCode, home) || isTrackedTeam(leagueCode, away);
    });

    const analyzed = [];

    for (const match of candidateFixtures.slice(0, 10)) {
      const league = match?.league?.name || "";
      const leagueCode = detectLeagueCode(league);
      const home = match?.teams?.home?.name || "";
      const away = match?.teams?.away?.name || "";
      const fixtureId = match?.fixture?.id;
      const matchName = `${home} vs ${away}`;

      const [homeHistoryRaw, awayHistoryRaw, predictionRaw, injuriesRaw] = await Promise.all([
        apiGet(`https://v3.football.api-sports.io/fixtures?team=${match?.teams?.home?.id}&last=12`),
        apiGet(`https://v3.football.api-sports.io/fixtures?team=${match?.teams?.away?.id}&last=12`),
        apiGet(`https://v3.football.api-sports.io/predictions?fixture=${fixtureId}`),
        apiGet(`https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`)
      ]);

      const homeHistory = safeArray(homeHistoryRaw.response);
      const awayHistory = safeArray(awayHistoryRaw.response);
      const prediction = safeArray(predictionRaw.response)[0] || {};
      const injuries = safeArray(injuriesRaw.response);

      const homeHomeStats = summarizeTeamHistory(homeHistory, home, "home");
      const awayAwayStats = summarizeTeamHistory(awayHistory, away, "away");

      const predHome = Number(String(prediction?.predictions?.percent?.home || "0").replace("%", ""));
      const predDraw = Number(String(prediction?.predictions?.percent?.draw || "0").replace("%", ""));
      const predAway = Number(String(prediction?.predictions?.percent?.away || "0").replace("%", ""));

      const homePenalty = computeAbsencePenalty(injuries, home);
      const awayPenalty = computeAbsencePenalty(injuries, away);

      const avgGoalsSignal = (homeHomeStats.avgGoals + awayAwayStats.avgGoals) / 2;
      const over25Signal = (homeHomeStats.over25Pct + awayAwayStats.over25Pct) / 2;
      const bttsSignal = (homeHomeStats.bttsPct + awayAwayStats.bttsPct) / 2;
      const under35Signal = (homeHomeStats.under35Pct + awayAwayStats.under35Pct) / 2;
      const homeWinSignal = (predHome * 0.55) + (homeHomeStats.winPct * 0.45) - homePenalty;
      const awayWinSignal = (predAway * 0.55) + (awayAwayStats.winPct * 0.45) - awayPenalty;

      // SAFE / VALUE
      const localPicks = [];

      if (avgGoalsSignal >= 2.7 && over25Signal >= 60) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "OVER 2.5",
          score: over25Signal + 8 - Math.round((homePenalty + awayPenalty) / 2),
          type: "VALUE",
          reason: lang === "ro"
            ? `Pattern ofensiv confirmat | Home O2.5 ${homeHomeStats.over25Pct}% | Away O2.5 ${awayAwayStats.over25Pct}%`
            : `Attacking pattern confirmed | Home O2.5 ${homeHomeStats.over25Pct}% | Away O2.5 ${awayAwayStats.over25Pct}%`
        }));
      }

      if (bttsSignal >= 62) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "BTTS",
          score: bttsSignal + 4 - Math.round((homePenalty + awayPenalty) / 2),
          type: "VALUE",
          reason: lang === "ro"
            ? `Ambele echipe au profil BTTS`
            : `Both teams show BTTS profile`
        }));
      }

      if (under35Signal >= 75 && avgGoalsSignal <= 2.7) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "UNDER 3.5",
          score: under35Signal + 2,
          type: "SAFE",
          reason: lang === "ro"
            ? `Meci controlat, profil low chaos`
            : `Controlled match, low chaos profile`
        }));
      }

      if (homeWinSignal >= 74) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "1X",
          score: homeWinSignal,
          type: "SAFE",
          reason: lang === "ro"
            ? `Acasă mai stabilă + model favorabil`
            : `Stronger home stability + favorable model`
        }));
      }

      if (awayWinSignal >= 74) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "X2",
          score: awayWinSignal,
          type: "SAFE",
          reason: lang === "ro"
            ? `Deplasare solidă + model favorabil`
            : `Strong away profile + favorable model`
        }));
      }

      // HT/FT
      if (homeHomeStats.topHtftCode === "W/W" && homeHomeStats.topHtftPct >= 55) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "HT/FT 1/1",
          score: homeHomeStats.topHtftPct + Math.round(predHome * 0.2) - homePenalty,
          type: "HTFT",
          reason: lang === "ro"
            ? `Pattern acasă 1/1 confirmat`
            : `Confirmed home 1/1 pattern`
        }));
      }

      if (homeHomeStats.drawHTPct >= 40 && homeHomeStats.winPct >= 55) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "HT/FT X/1",
          score: Math.round((homeHomeStats.drawHTPct * 0.45) + (homeHomeStats.winPct * 0.35) + (predHome * 0.2)) - homePenalty,
          type: "HTFT",
          reason: lang === "ro"
            ? `Intră lent, termină puternic`
            : `Slow start, strong finish`
        }));
      }

      if (awayAwayStats.drawHTPct >= 40 && awayAwayStats.winPct >= 55) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "HT/FT X/2",
          score: Math.round((awayAwayStats.drawHTPct * 0.45) + (awayAwayStats.winPct * 0.35) + (predAway * 0.2)) - awayPenalty,
          type: "HTFT",
          reason: lang === "ro"
            ? `Pattern de revenire în deplasare`
            : `Away comeback pattern`
        }));
      }

      // 2nd half / timing
      if (homeHomeStats.score2HPct >= 58 || awayAwayStats.score2HPct >= 58) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: lang === "ro" ? "GOL REPRIZA 2" : "2ND HALF GOAL",
          score: Math.max(homeHomeStats.score2HPct, awayAwayStats.score2HPct),
          type: "TIMING",
          reason: lang === "ro"
            ? `Pattern puternic pe repriza a doua`
            : `Strong second-half pattern`
        }));
      }

      // Corners basic elite
      const cornersBase =
        (homeHomeStats.over15Pct + awayAwayStats.over15Pct + homeHomeStats.winPct + awayAwayStats.winPct) / 4;

      if (cornersBase >= 63) {
        localPicks.push(buildPick({
          match: matchName,
          league,
          market: "OVER 8.5 CORNERS",
          score: cornersBase + 6,
          type: "CORNERS",
          reason: lang === "ro"
            ? `Ritm și presiune favorabile pentru cornere`
            : `Tempo and pressure support corners`
        }));
      }

      analyzed.push({
        match: matchName,
        league,
        leagueCode,
        home,
        away,
        predHome,
        predDraw,
        predAway,
        localPicks
      });
    }

    const allPicks = analyzed.flatMap((x) => x.localPicks).filter((x) => x && x.confidence >= 72);
    allPicks.sort((a, b) => b.confidence - a.confidence);

    const safePicks = allPicks.filter((x) => x.type === "SAFE").slice(0, 5);
    const valuePicks = allPicks.filter((x) => x.type === "VALUE").slice(0, 5);
    const htftPicks = allPicks.filter((x) => x.type === "HTFT").slice(0, 5);
    const cornersPicks = allPicks.filter((x) => x.type === "CORNERS").slice(0, 5);
    const timingPicks = allPicks.filter((x) => x.type === "TIMING").slice(0, 5);

    const top1 = allPicks[0] || null;
    const top3 = allPicks.slice(0, 3);
    const top5 = allPicks.slice(0, 5);

    const trackedTeams = analyzed.map((x) => ({
      league: x.league,
      home: x.home,
      away: x.away
    }));

    const statusZi = allPicks.length === 0
      ? T.nobet
      : (top1 && top1.confidence >= 84 ? T.play : T.smartBlock);

    return res.status(200).json({
      status: "OK",
      lang,
      labels: T,
      date: today,
      hourUTC: currentHour,
      statusZi,
      totalMatches: candidateFixtures.length,
      totalPicks: allPicks.length,
      top1,
      top3,
      top5,
      safePicks,
      valuePicks,
      htftPicks,
      cornersPicks,
      timingPicks,
      trackedTeams
    });
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      message: err.message
    });
  }
}
