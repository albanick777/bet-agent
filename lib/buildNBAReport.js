export async function buildNBAReport(apiKey) {
  if (!apiKey) throw new Error("Missing API key");

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;

  async function apiGet(url) {
    const r = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    if (!r.ok) throw new Error(`NBA API ${r.status}`);
    const d = await r.json();
    if (!d || typeof d !== "object") throw new Error("Invalid response");
    return d;
  }

  function safeArray(v) { return Array.isArray(v) ? v : []; }

  function fmtUTC(ts) {
    if (!ts) return "??:??";
    const d = new Date(ts);
    return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }

  function fmtLocal(ts, offsetHours) {
    if (!ts) return "??:??";
    const d = new Date(new Date(ts).getTime() + offsetHours * 3600000);
    return `${String(d.getUTCHours() % 24).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }

  function marketRisk(s) {
    if (s >= 85) return "SCĂZUT";
    if (s >= 75) return "MEDIU";
    return "RIDICAT";
  }

  // Fetch today's NBA games
  const gamesRaw = await apiGet(
    `https://v2.nba.api-sports.io/games?date=${today}`
  );
  const games = safeArray(gamesRaw.response).filter(g => {
    const status = g?.status?.short;
    return status === 1 || status === "NS"; // Not started
  });

  if (!games.length) return { picks: [], date: today, sport: "NBA" };

  const picks = [];

  for (const game of games.slice(0, 8)) {
    try {
      const homeId = game?.teams?.home?.id;
      const awayId = game?.teams?.visitors?.id;
      const homeName = game?.teams?.home?.name || "";
      const awayName = game?.teams?.visitors?.name || "";
      const gameTime = game?.date?.start;
      const matchName = `${homeName} vs ${awayName}`;

      // Fetch last 10 games for each team
      const [homeRaw, awayRaw] = await Promise.all([
        apiGet(`https://v2.nba.api-sports.io/games?team=${homeId}&last=10`),
        apiGet(`https://v2.nba.api-sports.io/games?team=${awayId}&last=10`)
      ]);

      const homeGames = safeArray(homeRaw.response).filter(g =>
        g?.status?.short === 3 || g?.status?.short === "FT"
      );
      const awayGames = safeArray(awayRaw.response).filter(g =>
        g?.status?.short === 3 || g?.status?.short === "FT"
      );

      if (homeGames.length < 4 || awayGames.length < 4) continue;

      // Calculate stats
      function teamStats(games, teamName) {
        let totalPts = 0, totalPtsAgainst = 0, wins = 0;
        let over210 = 0, over220 = 0, over230 = 0;

        games.forEach(g => {
          const isHome = g?.teams?.home?.name === teamName;
          const myPts = isHome
            ? Number(g?.scores?.home?.points || 0)
            : Number(g?.scores?.visitors?.points || 0);
          const oppPts = isHome
            ? Number(g?.scores?.visitors?.points || 0)
            : Number(g?.scores?.home?.points || 0);
          const total = myPts + oppPts;

          totalPts += myPts;
          totalPtsAgainst += oppPts;
          if (myPts > oppPts) wins++;
          if (total > 210) over210++;
          if (total > 220) over220++;
          if (total > 230) over230++;
        });

        const n = games.length;
        return {
          avgPts: Math.round(totalPts / n),
          avgPtsAgainst: Math.round(totalPtsAgainst / n),
          avgTotal: Math.round((totalPts + totalPtsAgainst) / n),
          winPct: Math.round((wins / n) * 100),
          over210Pct: Math.round((over210 / n) * 100),
          over220Pct: Math.round((over220 / n) * 100),
          over230Pct: Math.round((over230 / n) * 100),
          n
        };
      }

      const hS = teamStats(homeGames, homeName);
      const aS = teamStats(awayGames, awayName);

      const avgTotal = Math.round((hS.avgTotal + aS.avgTotal) / 2);
      const over215Signal = (hS.over210Pct + aS.over210Pct) / 2;
      const over225Signal = (hS.over220Pct + aS.over220Pct) / 2;

      // Home advantage +5%
      const homeWinSignal = Math.min(99, hS.winPct + 5);
      const awayWinSignal = aS.winPct;

      // OVER picks
      if (over215Signal >= 75) {
        picks.push({
          match: matchName,
          sport: "NBA",
          kickoffUTC: fmtUTC(gameTime),
          kickoffLocal: fmtLocal(gameTime, 4), // Georgia UTC+4
          market: `OVER 215.5 pts`,
          confidence: Math.round(over215Signal),
          risk: marketRisk(over215Signal),
          reason: `Home avg total: ${hS.avgTotal} | Away avg total: ${aS.avgTotal}`
        });
      }

      if (over225Signal >= 75) {
        picks.push({
          match: matchName,
          sport: "NBA",
          kickoffUTC: fmtUTC(gameTime),
          kickoffLocal: fmtLocal(gameTime, 4),
          market: `OVER 225.5 pts`,
          confidence: Math.round(over225Signal),
          risk: marketRisk(over225Signal),
          reason: `Media combinată: ${avgTotal} pts | Over225: ${over225Signal.toFixed(0)}%`
        });
      }

      // Moneyline favorit
      if (homeWinSignal >= 75) {
        picks.push({
          match: matchName,
          sport: "NBA",
          kickoffUTC: fmtUTC(gameTime),
          kickoffLocal: fmtLocal(gameTime, 4),
          market: `${homeName} WIN (ML)`,
          confidence: homeWinSignal,
          risk: marketRisk(homeWinSignal),
          reason: `Home win rate: ${hS.winPct}% | Avantaj teren propriu`
        });
      } else if (awayWinSignal >= 75) {
        picks.push({
          match: matchName,
          sport: "NBA",
          kickoffUTC: fmtUTC(gameTime),
          kickoffLocal: fmtLocal(gameTime, 4),
          market: `${awayName} WIN (ML)`,
          confidence: awayWinSignal,
          risk: marketRisk(awayWinSignal),
          reason: `Away win rate: ${aS.winPct}% | Formă solidă`
        });
      }

    } catch (err) {
      console.error(`NBA eroare ${game?.teams?.home?.name}:`, err.message);
    }
  }

  // Sort și top 5
  picks.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set();
  const top5 = picks.filter(p => {
    const key = `${p.match}-${p.market}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return p.confidence >= 75;
  }).slice(0, 5);

  return { picks: top5, date: today, sport: "NBA", totalGames: games.length };
}
