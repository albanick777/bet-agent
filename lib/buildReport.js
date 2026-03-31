export async function buildEliteReport(lang = "ro", apiKey) {
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY");

  const safeLang = String(lang || "ro").toLowerCase() === "en" ? "en" : "ro";

  const T = {
    ro: {
      play: "ZI JUCABILĂ",
      nobet: "NO BET DAY",
      smartBlock: "SMART BLOCK",
      low: "SCĂZUT",
      medium: "MEDIU",
      high: "RIDICAT",
      yes: "DA",
      no: "NU"
    },
    en: {
      play: "PLAY DAY",
      nobet: "NO BET DAY",
      smartBlock: "SMART BLOCK",
      low: "LOW",
      medium: "MEDIUM",
      high: "HIGH",
      yes: "YES",
      no: "NO"
    }
  }[safeLang];

  // ─── LIGI APROBATE ────────────────────────────────────────────────────────
  // Mapare: numele exact din API → codul intern
  const APPROVED_LEAGUES = {
    "UEFA Champions League": "UCL",
    "UEFA Europa League": "UEL",
    "UEFA Europa Conference League": "UECL",
    "Premier League": "ENG1",
    "Championship": "ENG2",
    "La Liga": "ESP1",
    "Segunda División": "ESP2",
    "Serie A": "ITA1",
    "Serie B": "ITA2",
    "Bundesliga": "GER1",
    "2. Bundesliga": "GER2",
    "Ligue 1": "FRA1",
    "Ligue 2": "FRA2",
    "Eredivisie": "NED1",
    "Jupiler Pro League": "BEL1",
    "Primeira Liga": "POR1",
    "Super Lig": "TUR1",
    "Süper Lig": "TUR1",
    "Scottish Premiership": "SCO1",
    "J1 League": "JPN1",
    "K League 1": "KOR1",
    "MLS": "MLS"
  };

  // ─── CUVINTE INTERZISE ─────────────────────────────────────────────────────
  const BANNED_KEYWORDS = [
    "women", "woman", "female", "feminine", "féminin", "frauen", "damen",
    "youth", "u17", "u18", "u19", "u20", "u21", "u23",
    "reserve", "reserves", "réserve", "reservas",
    "friendly", "friendlies", "amical", "amistoso",
    "qualification", "qualifying", "qualif",
    "amateur", "amatör",
    "srl", "e-football", "virtual", "esoccer", "esports",
    " ii ", " b ", "second team", "segunda b"
  ];

  function isBanned(leagueName, countryName) {
    const text = `${leagueName} ${countryName}`.toLowerCase();
    return BANNED_KEYWORDS.some(k => text.includes(k));
  }

  function getApprovedLeagueCode(leagueName) {
    // Match exact
    if (APPROVED_LEAGUES[leagueName]) return APPROVED_LEAGUES[leagueName];
    // Match parțial pentru variante ușor diferite
    const lower = leagueName.toLowerCase();
    for (const [name, code] of Object.entries(APPROVED_LEAGUES)) {
      if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
        return code;
      }
    }
    return null;
  }

  // ─── DATA / ORA ───────────────────────────────────────────────────────────
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  const currentHourUTC = now.getUTCHours();
  const currentMinUTC = now.getUTCMinutes();
  const nowMinutes = currentHourUTC * 60 + currentMinUTC;

  // ─── UTILITĂȚI ────────────────────────────────────────────────────────────
  function safeArray(v) { return Array.isArray(v) ? v : []; }
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }

  function marketRisk(score) {
    if (score >= 85) return T.low;
    if (score >= 75) return T.medium;
    return T.high;
  }

  function samplePenalty(totalMatches) {
    if (totalMatches >= 8) return 0;
    if (totalMatches >= 6) return 4;
    if (totalMatches >= 4) return 8;
    return 14;
  }

  async function apiGet(url) {
    const response = await fetch(url, {
      headers: { "x-apisports-key": apiKey }
    });
    if (!response.ok) throw new Error(`API ${response.status}: ${url}`);
    const data = await response.json();
    if (!data || typeof data !== "object") throw new Error("Invalid API response");
    return data;
  }

  function formatKickoffTime(fixtureTimestamp) {
    if (!fixtureTimestamp) return "??:??";
    const d = new Date(fixtureTimestamp * 1000);
    const h = String(d.getUTCHours() + 4).padStart(2, "0"); // Georgia = UTC+4
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    // Dacă ora depășește 24
    const hFinal = String(Number(h) % 24).padStart(2, "0");
    return `${hFinal}:${m}`;
  }

  function getTeamSide(match, teamName) {
    if (match?.teams?.home?.name === teamName) return "home";
    if (match?.teams?.away?.name === teamName) return "away";
    return null;
  }

  function getGoalsForAgainst(match, teamName) {
    const side = getTeamSide(match, teamName);
    const hg = Number(match?.goals?.home ?? 0);
    const ag = Number(match?.goals?.away ?? 0);
    if (side === "home") return { gf: hg, ga: ag };
    if (side === "away") return { gf: ag, ga: hg };
    return { gf: 0, ga: 0 };
  }

  function getHtForAgainst(match, teamName) {
    const side = getTeamSide(match, teamName);
    const htH = match?.score?.halftime?.home;
    const htA = match?.score?.halftime?.away;
    if (htH == null || htA == null) return { gf: null, ga: null };
    if (side === "home") return { gf: Number(htH), ga: Number(htA) };
    if (side === "away") return { gf: Number(htA), ga: Number(htH) };
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
    if (ht.gf === null) return null;
    return `${resultCode(ht.gf, ht.ga)}/${resultCode(ft.gf, ft.ga)}`;
  }

  function summarizeTeamHistory(matches, teamName, sideFilter) {
    const filtered = matches.filter(m => {
      const side = getTeamSide(m, teamName);
      const status = m?.fixture?.status?.short || "";
      return ["FT", "AET", "PEN"].includes(status) && (sideFilter ? side === sideFilter : !!side);
    });

    const totals = [];
    let over15 = 0, over25 = 0, btts = 0, under35 = 0;
    let win = 0, drawHT = 0, leadHT = 0, score2H = 0;
    const htftMap = {};

    filtered.forEach(m => {
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
        const htft = htftCode(m, teamName);
        if (htft) htftMap[htft] = (htftMap[htft] || 0) + 1;
        const goals2H = gf - ht.gf;
        if (goals2H >= 1) score2H++;
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
      score2HPct: pct(score2H, totalMatches),
      topHtftCode: topHtft[0],
      topHtftPct: pct(topHtft[1], totalMatches)
    };
  }

  function computeAbsencePenalty(injuries, teamName) {
    const count = injuries.filter(i => i?.team?.name === teamName).length;
    if (count >= 5) return 12;
    if (count >= 3) return 7;
    if (count >= 1) return 3;
    return 0;
  }

  function buildPick({ match, league, kickoff, market, score, reason, type, extra = {} }) {
    const confidence = Math.max(0, Math.min(99, Math.round(score)));
    return {
      match,
      league,
      kickoff,       // ora meciului în Georgia time
      market,
      confidence,
      risk: marketRisk(confidence),
      type,
      reason,
      verdict: confidence >= 75 ? T.yes : T.no,
      ...extra
    };
  }

  // ─── FETCH FIXTURES ───────────────────────────────────────────────────────
  const fixturesData = await apiGet(
    `https://v3.football.api-sports.io/fixtures?date=${today}`
  );
  const allFixtures = safeArray(fixturesData.response);

  // ─── FILTRARE STRICTĂ ─────────────────────────────────────────────────────
  const filteredFixtures = allFixtures.filter(match => {
    const leagueName = match?.league?.name || "";
    const countryName = match?.league?.country || "";
    const status = match?.fixture?.status?.short || "";

    // 1. Exclude meciuri deja începute sau terminate
    if (!["NS", "TBD"].includes(status)) return false;

    // 2. Exclude meciuri interzise
    if (isBanned(leagueName, countryName)) return false;

    // 3. Exclude meciuri prea apropiate de start (< 45 minute distanță)
    const kickoffTs = match?.fixture?.timestamp;
    if (kickoffTs) {
      const kickoffDate = new Date(kickoffTs * 1000);
      const kickoffMinutes = kickoffDate.getUTCHours() * 60 + kickoffDate.getUTCMinutes();
      const diffMinutes = kickoffMinutes - nowMinutes;
      if (diffMinutes < 45 && diffMinutes >= 0) return false;
      // Dacă meciul e azi dar deja în trecut ca timp
      if (diffMinutes < 0 && Math.abs(diffMinutes) < 120) return false;
    }

    // 4. Doar ligi aprobate
    const code = getApprovedLeagueCode(leagueName);
    if (!code) return false;

    return true;
  });

  // ─── ANALIZĂ ──────────────────────────────────────────────────────────────
  // Sortăm după ligile cele mai importante (UCL, ENG1, ITA1, ESP1, GER1 primele)
  const LEAGUE_PRIORITY = ["UCL", "UEL", "ENG1", "ESP1", "ITA1", "GER1", "FRA1", "BEL1", "NED1", "POR1", "TUR1", "GER2", "ITA2", "ESP2", "ENG2", "FRA2", "SCO1", "JPN1", "KOR1", "MLS", "UECL"];
  filteredFixtures.sort((a, b) => {
    const ca = LEAGUE_PRIORITY.indexOf(getApprovedLeagueCode(a?.league?.name || "") || "ZZZ");
    const cb = LEAGUE_PRIORITY.indexOf(getApprovedLeagueCode(b?.league?.name || "") || "ZZZ");
    return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
  });

  const candidateFixtures = filteredFixtures.slice(0, 10);
  const analyzed = [];

  for (const match of candidateFixtures) {
    const leagueName = match?.league?.name || "";
    const leagueCode = getApprovedLeagueCode(leagueName);
    const home = match?.teams?.home?.name || "";
    const away = match?.teams?.away?.name || "";
    const fixtureId = match?.fixture?.id;
    const kickoffTs = match?.fixture?.timestamp;
    const kickoff = formatKickoffTime(kickoffTs);
    const matchName = `${home} vs ${away}`;

    try {
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
      const homeSP = samplePenalty(homeHomeStats.totalMatches);
      const awaySP = samplePenalty(awayAwayStats.totalMatches);
      const avgSP = Math.round((homeSP + awaySP) / 2);

      const avgGoals = (homeHomeStats.avgGoals + awayAwayStats.avgGoals) / 2;
      const over25Signal = (homeHomeStats.over25Pct + awayAwayStats.over25Pct) / 2;
      const bttsSignal = (homeHomeStats.bttsPct + awayAwayStats.bttsPct) / 2;
      const under35Signal = (homeHomeStats.under35Pct + awayAwayStats.under35Pct) / 2;
      const homeWinSignal = (predHome * 0.55) + (homeHomeStats.winPct * 0.45) - homePenalty - homeSP;
      const awayWinSignal = (predAway * 0.55) + (awayAwayStats.winPct * 0.45) - awayPenalty - awaySP;

      const localPicks = [];
      const baseArgs = { match: matchName, league: leagueName, kickoff };

      // OVER 2.5 — prag ridicat
      if (avgGoals >= 2.8 && over25Signal >= 65) {
        localPicks.push(buildPick({
          ...baseArgs,
          market: "OVER 2.5",
          score: over25Signal + 6 - Math.round((homePenalty + awayPenalty) / 2) - avgSP,
          type: "VALUE",
          reason: `Home O2.5 ${homeHomeStats.over25Pct}% | Away O2.5 ${awayAwayStats.over25Pct}%`
        }));
      }

      // BTTS — prag ridicat
      if (bttsSignal >= 65) {
        localPicks.push(buildPick({
          ...baseArgs,
          market: "BTTS - DA",
          score: bttsSignal + 3 - Math.round((homePenalty + awayPenalty) / 2) - avgSP,
          type: "VALUE",
          reason: `Home BTTS ${homeHomeStats.bttsPct}% | Away BTTS ${awayAwayStats.bttsPct}%`
        }));
      }

      // UNDER 3.5
      if (under35Signal >= 78 && avgGoals <= 2.5) {
        localPicks.push(buildPick({
          ...baseArgs,
          market: "UNDER 3.5",
          score: under35Signal + 2 - avgSP,
          type: "SAFE",
          reason: `Medie goluri ${avgGoals.toFixed(1)} | Under35 ${under35Signal.toFixed(0)}%`
        }));
      }

      // 1X (acasă sau egal)
      if (homeWinSignal >= 76) {
        localPicks.push(buildPick({
          ...baseArgs,
          market: "1X",
          score: homeWinSignal,
          type: "SAFE",
          reason: `Predicție acasă ${predHome}% | Win acasă ${homeHomeStats.winPct}%`
        }));
      }

      // X2 (deplasare sau egal)
      if (awayWinSignal >= 76) {
        localPicks.push(buildPick({
          ...baseArgs,
          market: "X2",
          score: awayWinSignal,
          type: "SAFE",
          reason: `Predicție deplasare ${predAway}% | Win deplasare ${awayAwayStats.winPct}%`
        }));
      }

      // HT/FT 1/1 — prag strict
      if (homeHomeStats.topHtftCode === "W/W" && homeHomeStats.topHtftPct >= 60) {
        const score = homeHomeStats.topHtftPct + Math.round(predHome * 0.2) - homePenalty - homeSP;
        if (score >= 72) {
          localPicks.push(buildPick({
            ...baseArgs,
            market: "HT/FT 1/1",
            score,
            type: "HTFT",
            reason: `Pattern 1/1 acasă ${homeHomeStats.topHtftPct}%`
          }));
        }
      }

      // HT/FT X/1
      if (homeHomeStats.drawHTPct >= 42 && homeHomeStats.winPct >= 58) {
        const score = Math.round(
          homeHomeStats.drawHTPct * 0.45 +
          homeHomeStats.winPct * 0.35 +
          predHome * 0.2
        ) - homePenalty - homeSP;
        if (score >= 72) {
          localPicks.push(buildPick({
            ...baseArgs,
            market: "HT/FT X/1",
            score,
            type: "HTFT",
            reason: `Egal la pauză ${homeHomeStats.drawHTPct}% | Win FT ${homeHomeStats.winPct}%`
          }));
        }
      }

      // HT/FT X/2
      if (awayAwayStats.drawHTPct >= 42 && awayAwayStats.winPct >= 58) {
        const score = Math.round(
          awayAwayStats.drawHTPct * 0.45 +
          awayAwayStats.winPct * 0.35 +
          predAway * 0.2
        ) - awayPenalty - awaySP;
        if (score >= 72) {
          localPicks.push(buildPick({
            ...baseArgs,
            market: "HT/FT X/2",
            score,
            type: "HTFT",
            reason: `Egal deplasare la pauză ${awayAwayStats.drawHTPct}% | Win FT ${awayAwayStats.winPct}%`
          }));
        }
      }

      // REPRIZA 2
      if (homeHomeStats.score2HPct >= 62 || awayAwayStats.score2HPct >= 62) {
        const score = Math.max(homeHomeStats.score2HPct, awayAwayStats.score2HPct) - avgSP;
        if (score >= 72) {
          localPicks.push(buildPick({
            ...baseArgs,
            market: "GOL REPRIZA 2",
            score,
            type: "TIMING",
            reason: `Pattern repriza 2 | Home ${homeHomeStats.score2HPct}% | Away ${awayAwayStats.score2HPct}%`
          }));
        }
      }

      analyzed.push({
        match: matchName,
        league: leagueName,
        leagueCode,
        kickoff,
        home,
        away,
        predHome,
        predDraw,
        predAway,
        localPicks
      });

    } catch (err) {
      console.error(`Eroare la analiza ${matchName}:`, err.message);
      // continuăm cu restul meciurilor
    }
  }

  // ─── AGREGARE PICKS ───────────────────────────────────────────────────────
  const allPicks = analyzed
    .flatMap(x => x.localPicks)
    .filter(x => x && x.confidence >= 74)
    .sort((a, b) => b.confidence - a.confidence);

  // Deduplicare: un singur pick per meci în top picks
  const seenMatches = new Set();
  const deduped = allPicks.filter(p => {
    if (seenMatches.has(p.match)) return false;
    seenMatches.add(p.match);
    return true;
  });

  // top1 = cel mai bun pick unic
  const top1 = deduped[0] || null;

  // top3 = exact 3 picks diferite (fără top1)
  const top3 = deduped.slice(0, 3);

  // top5 = exact 5 picks diferite
  const top5 = deduped.slice(0, 5);

  // Categorii (pot include același pick în mai multe categorii)
  const safePicks = allPicks.filter(x => x.type === "SAFE").slice(0, 5);
  const valuePicks = allPicks.filter(x => x.type === "VALUE").slice(0, 5);
  const htftPicks = allPicks.filter(x => x.type === "HTFT").slice(0, 5);
  const timingPicks = allPicks.filter(x => x.type === "TIMING").slice(0, 5);
  const cornersPicks = [];

  const trackedTeams = analyzed.map(x => ({
    league: x.league,
    home: x.home,
    away: x.away,
    kickoff: x.kickoff
  }));

  const strongCount = allPicks.filter(p => p.confidence >= 82).length;
  const statusZi = allPicks.length === 0
    ? T.nobet
    : (top1 && top1.confidence >= 85) || strongCount >= 3
      ? T.play
      : T.smartBlock;
// ─── PATTERN WATCH ────────────────────────────────────────────────────────────
const PATTERN_TEAMS = [
  { name: "Real Madrid", id: 541 },
  { name: "Barcelona", id: 529 },
  { name: "Atletico Madrid", id: 530 },
  { name: "Bayern Munich", id: 157 },
  { name: "Borussia Dortmund", id: 165 },
  { name: "Bayer Leverkusen", id: 168 },
  { name: "PSG", id: 85 },
  { name: "Marseille", id: 81 },
  { name: "Inter Milan", id: 505 },
  { name: "AC Milan", id: 489 },
  { name: "Juventus", id: 496 },
  { name: "Napoli", id: 492 },
  { name: "Man City", id: 50 },
  { name: "Liverpool", id: 40 },
  { name: "Arsenal", id: 42 },
  { name: "Chelsea", id: 49 },
  { name: "Ajax", id: 194 },
  { name: "PSV", id: 197 },
  { name: "Benfica", id: 211 },
  { name: "Porto", id: 212 },
  { name: "Sporting CP", id: 228 },
  { name: "Galatasaray", id: 357 },
  { name: "Fenerbahce", id: 356 },
  { name: "Club Brugge", id: 341 },
  { name: "Anderlecht", id: 346 },
  { name: "Celtic", id: 396 },
  { name: "Fiorentina", id: 502 },
  { name: "Atalanta", id: 499 },
  { name: "Sevilla", id: 536 },
  { name: "Villarreal", id: 533 }
];

const patternResults = [];

// Procesăm în batch-uri de 5 ca să nu supraîncărcăm API-ul
for (let i = 0; i < PATTERN_TEAMS.slice(0, 20).length; i += 5) {
  const batch = PATTERN_TEAMS.slice(i, i + 5);
  const batchResults = await Promise.all(
    batch.map(async (team) => {
      try {
        const raw = await apiGet(
          `https://v3.football.api-sports.io/fixtures?team=${team.id}&last=15`
        );
        const matches = safeArray(raw.response);

        const homeMatches = matches.filter(m => {
          const status = m?.fixture?.status?.short || "";
          return ["FT", "AET", "PEN"].includes(status) &&
            m?.teams?.home?.name === team.name;
        });

        const awayMatches = matches.filter(m => {
          const status = m?.fixture?.status?.short || "";
          return ["FT", "AET", "PEN"].includes(status) &&
            m?.teams?.away?.name === team.name;
        });

        const homeStats = summarizeTeamHistory(matches, team.name, "home");
        const awayStats = summarizeTeamHistory(matches, team.name, "away");

        // Consistency score = media semnalelor puternice
        const consistencyScore = Math.round(
          (Math.max(homeStats.over25Pct, 100 - homeStats.over25Pct) +
           Math.max(homeStats.bttsPct, 100 - homeStats.bttsPct) +
           Math.max(homeStats.winPct, 100 - homeStats.winPct)) / 3
        );

        return {
          name: team.name,
          home: {
            matches: homeStats.totalMatches,
            winPct: homeStats.winPct,
            over25Pct: homeStats.over25Pct,
            under25Pct: 100 - homeStats.over25Pct,
            bttsPct: homeStats.bttsPct,
            topHtft: homeStats.topHtftCode,
            topHtftPct: homeStats.topHtftPct,
            goalR2Pct: homeStats.score2HPct
          },
          away: {
            matches: awayStats.totalMatches,
            winPct: awayStats.winPct,
            over25Pct: awayStats.over25Pct,
            under25Pct: 100 - awayStats.over25Pct,
            bttsPct: awayStats.bttsPct,
            topHtft: awayStats.topHtftCode,
            topHtftPct: awayStats.topHtftPct,
            goalR2Pct: awayStats.score2HPct
          },
          consistencyScore
        };
      } catch (err) {
        console.error(`Pattern error for ${team.name}:`, err.message);
        return null;
      }
    })
  );
  patternResults.push(...batchResults.filter(Boolean));
}

// Sortăm după consistency score
patternResults.sort((a, b) => b.consistencyScore - a.consistencyScore);
const top10Patterns = patternResults.slice(0, 10);
  return {
    status: "OK",
    lang: safeLang,
    labels: T,
    date: today,
    hourUTC: currentHourUTC,
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
    trackedTeams,
    patternWatch:top10Patterns
  };
}
