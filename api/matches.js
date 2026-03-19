export default async function handler(req, res) {
  try {
    const API_KEY = process.env.API_FOOTBALL_KEY;

    const LEAGUES = [
      39,  // Premier League
      140, // La Liga
      135, // Serie A
      78,  // Bundesliga
      61,  // Ligue 1
      144, // Jupiler Pro League
      88,  // Eredivisie
      94,  // Primeira Liga
      71,  // Serie B
      141, // Segunda
      79   // 2. Bundesliga
    ];

    const TODAY = new Date();
    const yyyy = TODAY.getFullYear();
    const mm = String(TODAY.getMonth() + 1).padStart(2, "0");
    const dd = String(TODAY.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    async function apiGet(url) {
      const r = await fetch(url, {
        headers: {
          "x-apisports-key": API_KEY
        }
      });
      const data = await r.json();
      return data.response || [];
    }

    function avg(arr) {
      if (!arr.length) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    function pct(n, total) {
      if (!total) return 0;
      return Math.round((n / total) * 100);
    }

    function getTotalGoals(f) {
      const home = f.goals?.home ?? 0;
      const away = f.goals?.away ?? 0;
      return home + away;
    }

    function isBTTS(f) {
      const home = f.goals?.home ?? 0;
      const away = f.goals?.away ?? 0;
      return home > 0 && away > 0;
    }

    function getTeamSide(f, teamId) {
      if (f.teams?.home?.id === teamId) return "home";
      if (f.teams?.away?.id === teamId) return "away";
      return null;
    }

    function getTeamGoals(f, teamId) {
      const side = getTeamSide(f, teamId);
      if (!side) return { gf: 0, ga: 0 };
      if (side === "home") {
        return {
          gf: f.goals?.home ?? 0,
          ga: f.goals?.away ?? 0
        };
      }
      return {
        gf: f.goals?.away ?? 0,
        ga: f.goals?.home ?? 0
      };
    }

    function resultLetter(gf, ga) {
      if (gf > ga) return "W";
      if (gf < ga) return "L";
      return "D";
    }

    function getHTFTCode(f, teamId) {
      const side = getTeamSide(f, teamId);
      if (!side) return null;

      const htHome = f.score?.halftime?.home;
      const htAway = f.score?.halftime?.away;
      const ftHome = f.goals?.home ?? 0;
      const ftAway = f.goals?.away ?? 0;

      if (htHome === null || htAway === null || htHome === undefined || htAway === undefined) {
        return null;
      }

      const ht =
        side === "home"
          ? resultLetter(htHome, htAway)
          : resultLetter(htAway, htHome);

      const ft =
        side === "home"
          ? resultLetter(ftHome, ftAway)
          : resultLetter(ftAway, ftHome);

      return `${ht}/${ft}`;
    }

    function summarizeFixtures(fixtures, teamId) {
      const totals = [];
      let over15 = 0;
      let over25 = 0;
      let under35 = 0;
      let btts = 0;
      let scored = 0;
      let conceded = 0;
      let win = 0;
      let drawHT = 0;
      let leadHT = 0;
      const htft = {};

      for (const f of fixtures) {
        const total = getTotalGoals(f);
        totals.push(total);

        if (total >= 2) over15++;
        if (total >= 3) over25++;
        if (total <= 3) under35++;
        if (isBTTS(f)) btts++;

        const tg = getTeamGoals(f, teamId);
        if (tg.gf > 0) scored++;
        if (tg.ga > 0) conceded++;
        if (tg.gf > tg.ga) win++;

        const side = getTeamSide(f, teamId);
        if (side) {
          const htHome = f.score?.halftime?.home;
          const htAway = f.score?.halftime?.away;

          if (htHome !== undefined && htAway !== undefined && htHome !== null && htAway !== null) {
            const teamHT = side === "home" ? htHome : htAway;
            const oppHT = side === "home" ? htAway : htHome;
            if (teamHT === oppHT) drawHT++;
            if (teamHT > oppHT) leadHT++;
          }
        }

        const code = getHTFTCode(f, teamId);
        if (code) htft[code] = (htft[code] || 0) + 1;
      }

      const totalMatches = fixtures.length || 1;
      const topHtft = Object.entries(htft).sort((a, b) => b[1] - a[1])[0] || [null, 0];

      return {
        matches: fixtures.length,
        avgGoals: Number(avg(totals).toFixed(2)),
        over15Pct: pct(over15, totalMatches),
        over25Pct: pct(over25, totalMatches),
        under35Pct: pct(under35, totalMatches),
        bttsPct: pct(btts, totalMatches),
        scoredPct: pct(scored, totalMatches),
        concededPct: pct(conceded, totalMatches),
        winPct: pct(win, totalMatches),
        drawHTPct: pct(drawHT, totalMatches),
        leadHTPct: pct(leadHT, totalMatches),
        topHtftCode: topHtft[0],
        topHtftPct: pct(topHtft[1], totalMatches)
      };
    }

    const fixtureBuckets = await Promise.all(
      LEAGUES.map((leagueId) =>
        apiGet(
          `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2025&date=${todayStr}`
        )
      )
    );

    const fixturesToday = fixtureBuckets
      .flat()
      .filter((f) => f.fixture?.status?.short === "NS")
      .slice(0, 12);

    const safePicks = [];
    const aggressivePicks = [];
    const cornersPicks = [];
    const htftWatchlist = [];

    for (const fixture of fixturesToday) {
      const fixtureId = fixture.fixture?.id;
      const homeId = fixture.teams?.home?.id;
      const awayId = fixture.teams?.away?.id;

      if (!fixtureId || !homeId || !awayId) continue;

      const [homeLast, awayLast, predictionArr, injuriesArr] = await Promise.all([
        apiGet(`https://v3.football.api-sports.io/fixtures?team=${homeId}&last=10`),
        apiGet(`https://v3.football.api-sports.io/fixtures?team=${awayId}&last=10`),
        apiGet(`https://v3.football.api-sports.io/predictions?fixture=${fixtureId}`),
        apiGet(`https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`)
      ]);

      const homeHome = homeLast.filter((f) => getTeamSide(f, homeId) === "home").slice(0, 5);
      const awayAway = awayLast.filter((f) => getTeamSide(f, awayId) === "away").slice(0, 5);

      const homeStats = summarizeFixtures(homeHome.length ? homeHome : homeLast, homeId);
      const awayStats = summarizeFixtures(awayAway.length ? awayAway : awayLast, awayId);

      const pred = predictionArr[0] || {};
      const predHome = Number((pred.predictions?.percent?.home || "0").replace("%", ""));
      const predDraw = Number((pred.predictions?.percent?.draw || "0").replace("%", ""));
      const predAway = Number((pred.predictions?.percent?.away || "0").replace("%", ""));

      const injuryHome = injuriesArr.filter((x) => x.team?.id === homeId).length;
      const injuryAway = injuriesArr.filter((x) => x.team?.id === awayId).length;

      const injuryPenaltyHome = injuryHome >= 4 ? 10 : injuryHome >= 2 ? 5 : injuryHome >= 1 ? 2 : 0;
      const injuryPenaltyAway = injuryAway >= 4 ? 10 : injuryAway >= 2 ? 5 : injuryAway >= 1 ? 2 : 0;

      const match = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
      const league = fixture.league?.name || "-";

      if (homeStats.topHtftCode && homeStats.topHtftPct >= 60) {
        htftWatchlist.push({
          team: fixture.teams.home.name,
          side: "HOME",
          league,
          pattern: homeStats.topHtftCode,
          confidence: homeStats.topHtftPct
        });
      }

      if (awayStats.topHtftCode && awayStats.topHtftPct >= 60) {
        htftWatchlist.push({
          team: fixture.teams.away.name,
          side: "AWAY",
          league,
          pattern: awayStats.topHtftCode,
          confidence: awayStats.topHtftPct
        });
      }

      const over15Score = Math.round(
        (homeStats.over15Pct * 0.35) +
        (awayStats.over15Pct * 0.35) +
        (homeStats.scoredPct * 0.15) +
        (awayStats.scoredPct * 0.15)
      ) - Math.round((injuryPenaltyHome + injuryPenaltyAway) / 2);

      if (over15Score >= 75) {
        safePicks.push({
          match,
          league,
          market: "OVER 1.5",
          confidence: over15Score,
          type: "SAFE",
          risk: over15Score >= 85 ? "LOW" : "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: pred.predictions?.winner?.name || fixture.teams.home.name,
          reason: `Home O1.5 ${homeStats.over15Pct}% | Away O1.5 ${awayStats.over15Pct}%`
        });
      }

      const over25Score = Math.round(
        (homeStats.over25Pct * 0.4) +
        (awayStats.over25Pct * 0.4) +
        (homeStats.bttsPct * 0.1) +
        (awayStats.bttsPct * 0.1)
      ) - Math.round((injuryPenaltyHome + injuryPenaltyAway) / 2);

      if (over25Score >= 74) {
        safePicks.push({
          match,
          league,
          market: "OVER 2.5",
          confidence: over25Score,
          type: "SAFE",
          risk: over25Score >= 84 ? "LOW" : "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: pred.predictions?.winner?.name || fixture.teams.home.name,
          reason: `Home O2.5 ${homeStats.over25Pct}% | Away O2.5 ${awayStats.over25Pct}%`
        });
      }

      const bttsScore = Math.round(
        (homeStats.bttsPct * 0.4) +
        (awayStats.bttsPct * 0.4) +
        (homeStats.scoredPct * 0.1) +
        (awayStats.scoredPct * 0.1)
      ) - Math.round((injuryPenaltyHome + injuryPenaltyAway) / 2);

      if (bttsScore >= 72) {
        safePicks.push({
          match,
          league,
          market: "BTTS",
          confidence: bttsScore,
          type: "SAFE",
          risk: bttsScore >= 82 ? "LOW" : "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: pred.predictions?.winner?.name || fixture.teams.home.name,
          reason: `Home BTTS ${homeStats.bttsPct}% | Away BTTS ${awayStats.bttsPct}%`
        });
      }

      const homeSafeScore = Math.round((predHome * 0.6) + (homeStats.winPct * 0.4)) - injuryPenaltyHome;
      if (homeSafeScore >= 76) {
        safePicks.push({
          match,
          league,
          market: "1X",
          confidence: homeSafeScore,
          type: "SAFE",
          risk: homeSafeScore >= 86 ? "LOW" : "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: pred.predictions?.winner?.name || fixture.teams.home.name,
          reason: `Pred home ${predHome}% | Home wins ${homeStats.winPct}%`
        });
      }

      const awaySafeScore = Math.round((predAway * 0.6) + (awayStats.winPct * 0.4)) - injuryPenaltyAway;
      if (awaySafeScore >= 76) {
        safePicks.push({
          match,
          league,
          market: "X2",
          confidence: awaySafeScore,
          type: "SAFE",
          risk: awaySafeScore >= 86 ? "LOW" : "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: pred.predictions?.winner?.name || fixture.teams.home.name,
          reason: `Pred away ${predAway}% | Away wins ${awayStats.winPct}%`
        });
      }

      if (homeStats.topHtftCode === "W/W" && homeStats.topHtftPct >= 60 && predHome >= 55) {
        aggressivePicks.push({
          match,
          league,
          market: "HT/FT 1/1",
          confidence: Math.min(92, Math.round((homeStats.topHtftPct * 0.65) + (predHome * 0.35)) - injuryPenaltyHome),
          type: "AGGRESSIVE",
          risk: "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: fixture.teams.home.name,
          reason: `Home W/W ${homeStats.topHtftPct}%`
        });
      }

      if (homeStats.drawHTPct >= 40 && homeStats.winPct >= 55 && predHome >= 50) {
        aggressivePicks.push({
          match,
          league,
          market: "HT/FT X/1",
          confidence: Math.min(89, Math.round((homeStats.drawHTPct * 0.45) + (homeStats.winPct * 0.35) + (predHome * 0.2)) - injuryPenaltyHome),
          type: "AGGRESSIVE",
          risk: "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: fixture.teams.home.name,
          reason: `Draw HT ${homeStats.drawHTPct}% | Win ${homeStats.winPct}%`
        });
      }

      if (awayStats.drawHTPct >= 40 && awayStats.winPct >= 55 && predAway >= 50) {
        aggressivePicks.push({
          match,
          league,
          market: "HT/FT X/2",
          confidence: Math.min(89, Math.round((awayStats.drawHTPct * 0.45) + (awayStats.winPct * 0.35) + (predAway * 0.2)) - injuryPenaltyAway),
          type: "AGGRESSIVE",
          risk: "MEDIUM",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: fixture.teams.away.name,
          reason: `Draw HT ${awayStats.drawHTPct}% | Win ${awayStats.winPct}%`
        });
      }

      if (homeStats.drawHTPct >= 50 && awayStats.drawHTPct >= 50 && predDraw >= 28) {
        aggressivePicks.push({
          match,
          league,
          market: "HT/FT X/X",
          confidence: Math.min(84, Math.round((homeStats.drawHTPct * 0.35) + (awayStats.drawHTPct * 0.35) + (predDraw * 0.3))),
          type: "AGGRESSIVE",
          risk: "HIGH",
          projectedGoals: Number(((homeStats.avgGoals + awayStats.avgGoals) / 2).toFixed(2)),
          winnerName: "Draw",
          reason: `Draw HT strong on both sides`
        });
      }
    }

    safePicks.sort((a, b) => b.confidence - a.confidence);
    aggressivePicks.sort((a, b) => b.confidence - a.confidence);
    cornersPicks.sort((a, b) => b.confidence - a.confidence);
    htftWatchlist.sort((a, b) => b.confidence - a.confidence);

    const all = [...safePicks, ...aggressivePicks, ...cornersPicks].sort((a, b) => b.confidence - a.confidence);

    const top1 = all[0] || null;
    const top3 = all.slice(0, 3);
    const top5 = all.slice(0, 5);

    const eliteSafe = safePicks.filter((x) => x.confidence >= 80).length;
    const smartBlock = eliteSafe < 2;

    const warnings = [];
    if (smartBlock) warnings.push("SMART BLOCK: prea puține safe picks elite.");
    if (!aggressivePicks.length) warnings.push("Nu există HT/FT puternic azi.");
    if (!top1) warnings.push("Nu există pick principal azi.");

    return res.status(200).json({
      smartBlock,
      top1,
      top3,
      top5,
      safePicks,
      aggressivePicks,
      cornersPicks,
      htftWatchlist: htftWatchlist.slice(0, 10),
      recommendedTicketSize: smartBlock ? "1-2 meciuri" : "2-3 meciuri",
      warnings
    });
  } catch (err) {
    return res.status(500).json({
      error: "SERVER ERROR",
      message: err.message
    });
  }
}
