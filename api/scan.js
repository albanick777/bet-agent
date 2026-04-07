export default async function handler(req, res) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!apiKey || !token || !chatId || !kvUrl || !kvToken) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    // ── ECHIPE HARDCODATE — TOP 5 PER LIGĂ ───────────────────────────────
    const TEAMS = [
      // Premier League
      { id: 42, name: "Arsenal", league: "Premier League", country: "England", leagueId: 39, season: 2024 },
      { id: 33, name: "Manchester United", league: "Premier League", country: "England", leagueId: 39, season: 2024 },
      { id: 40, name: "Liverpool", league: "Premier League", country: "England", leagueId: 39, season: 2024 },
      { id: 50, name: "Manchester City", league: "Premier League", country: "England", leagueId: 39, season: 2024 },
      { id: 47, name: "Tottenham", league: "Premier League", country: "England", leagueId: 39, season: 2024 },

      // La Liga
      { id: 541, name: "Real Madrid", league: "La Liga", country: "Spain", leagueId: 140, season: 2024 },
      { id: 529, name: "Barcelona", league: "La Liga", country: "Spain", leagueId: 140, season: 2024 },
      { id: 530, name: "Atletico Madrid", league: "La Liga", country: "Spain", leagueId: 140, season: 2024 },
      { id: 532, name: "Valencia", league: "La Liga", country: "Spain", leagueId: 140, season: 2024 },
      { id: 533, name: "Villarreal", league: "La Liga", country: "Spain", leagueId: 140, season: 2024 },

      // Serie A
      { id: 505, name: "Inter", league: "Serie A", country: "Italy", leagueId: 135, season: 2024 },
      { id: 489, name: "AC Milan", league: "Serie A", country: "Italy", leagueId: 135, season: 2024 },
      { id: 496, name: "Juventus", league: "Serie A", country: "Italy", leagueId: 135, season: 2024 },
      { id: 492, name: "Napoli", league: "Serie A", country: "Italy", leagueId: 135, season: 2024 },
      { id: 487, name: "Lazio", league: "Serie A", country: "Italy", leagueId: 135, season: 2024 },

      // Bundesliga
      { id: 157, name: "Bayern Munich", league: "Bundesliga", country: "Germany", leagueId: 78, season: 2024 },
      { id: 165, name: "Borussia Dortmund", league: "Bundesliga", country: "Germany", leagueId: 78, season: 2024 },
      { id: 168, name: "Bayer Leverkusen", league: "Bundesliga", country: "Germany", leagueId: 78, season: 2024 },
      { id: 173, name: "RB Leipzig", league: "Bundesliga", country: "Germany", leagueId: 78, season: 2024 },
      { id: 162, name: "Werder Bremen", league: "Bundesliga", country: "Germany", leagueId: 78, season: 2024 },

      // Ligue 1
      { id: 85, name: "Paris Saint Germain", league: "Ligue 1", country: "France", leagueId: 61, season: 2024 },
      { id: 80, name: "Lyon", league: "Ligue 1", country: "France", leagueId: 61, season: 2024 },
      { id: 81, name: "Marseille", league: "Ligue 1", country: "France", leagueId: 61, season: 2024 },
      { id: 84, name: "Nice", league: "Ligue 1", country: "France", leagueId: 61, season: 2024 },
      { id: 82, name: "Monaco", league: "Ligue 1", country: "France", leagueId: 61, season: 2024 },

      // Eredivisie
      { id: 197, name: "PSV Eindhoven", league: "Eredivisie", country: "Netherlands", leagueId: 88, season: 2024 },
      { id: 194, name: "Ajax", league: "Eredivisie", country: "Netherlands", leagueId: 88, season: 2024 },
      { id: 198, name: "Feyenoord", league: "Eredivisie", country: "Netherlands", leagueId: 88, season: 2024 },
      { id: 199, name: "AZ Alkmaar", league: "Eredivisie", country: "Netherlands", leagueId: 88, season: 2024 },
      { id: 210, name: "FC Utrecht", league: "Eredivisie", country: "Netherlands", leagueId: 88, season: 2024 },

      // Jupiler Pro League
      { id: 341, name: "Club Brugge KV", league: "Jupiler Pro League", country: "Belgium", leagueId: 144, season: 2024 },
      { id: 569, name: "Anderlecht", league: "Jupiler Pro League", country: "Belgium", leagueId: 144, season: 2024 },
      { id: 570, name: "Gent", league: "Jupiler Pro League", country: "Belgium", leagueId: 144, season: 2024 },
      { id: 571, name: "Standard Liege", league: "Jupiler Pro League", country: "Belgium", leagueId: 144, season: 2024 },
      { id: 572, name: "Genk", league: "Jupiler Pro League", country: "Belgium", leagueId: 144, season: 2024 },

      // Primeira Liga
      { id: 212, name: "FC Porto", league: "Primeira Liga", country: "Portugal", leagueId: 94, season: 2024 },
      { id: 211, name: "Benfica", league: "Primeira Liga", country: "Portugal", leagueId: 94, season: 2024 },
      { id: 228, name: "Sporting CP", league: "Primeira Liga", country: "Portugal", leagueId: 94, season: 2024 },
      { id: 229, name: "Braga", league: "Primeira Liga", country: "Portugal", leagueId: 94, season: 2024 },
      { id: 233, name: "Vitoria Guimaraes", league: "Primeira Liga", country: "Portugal", leagueId: 94, season: 2024 },

      // Super Lig
      { id: 611, name: "Galatasaray", league: "Super Lig", country: "Turkey", leagueId: 203, season: 2024 },
      { id: 609, name: "Fenerbahce", league: "Super Lig", country: "Turkey", leagueId: 203, season: 2024 },
      { id: 610, name: "Besiktas", league: "Super Lig", country: "Turkey", leagueId: 203, season: 2024 },
      { id: 613, name: "Trabzonspor", league: "Super Lig", country: "Turkey", leagueId: 203, season: 2024 },
      { id: 614, name: "Basaksehir", league: "Super Lig", country: "Turkey", leagueId: 203, season: 2024 },

      // Scottish Premiership
      { id: 247, name: "Celtic", league: "Scottish Premiership", country: "Scotland", leagueId: 179, season: 2024 },
      { id: 246, name: "Rangers", league: "Scottish Premiership", country: "Scotland", leagueId: 179, season: 2024 },
      { id: 248, name: "Aberdeen", league: "Scottish Premiership", country: "Scotland", leagueId: 179, season: 2024 },
      { id: 254, name: "Hearts", league: "Scottish Premiership", country: "Scotland", leagueId: 179, season: 2024 },
      { id: 255, name: "Hibernian", league: "Scottish Premiership", country: "Scotland", leagueId: 179, season: 2024 },

      // Super League Switzerland
      { id: 404, name: "FC Basel", league: "Super League", country: "Switzerland", leagueId: 207, season: 2024 },
      { id: 405, name: "Young Boys", league: "Super League", country: "Switzerland", leagueId: 207, season: 2024 },
      { id: 406, name: "FC Zurich", league: "Super League", country: "Switzerland", leagueId: 207, season: 2024 },
      { id: 407, name: "Servette", league: "Super League", country: "Switzerland", leagueId: 207, season: 2024 },
      { id: 408, name: "Lugano", league: "Super League", country: "Switzerland", leagueId: 207, season: 2024 },

      // Super League 1 Greece
      { id: 462, name: "Olympiacos", league: "Super League 1", country: "Greece", leagueId: 197, season: 2024 },
      { id: 460, name: "PAOK", league: "Super League 1", country: "Greece", leagueId: 197, season: 2024 },
      { id: 461, name: "AEK Athens", league: "Super League 1", country: "Greece", leagueId: 197, season: 2024 },
      { id: 463, name: "Panathinaikos", league: "Super League 1", country: "Greece", leagueId: 197, season: 2024 },
      { id: 464, name: "Aris Thessaloniki", league: "Super League 1", country: "Greece", leagueId: 197, season: 2024 }
    ];

    function safeArray(v) { return Array.isArray(v) ? v : []; }
    function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }

    async function apiGet(url) {
      const r = await fetch(url, { headers: { "x-apisports-key": apiKey } });
      if (!r.ok) throw new Error(`API ${r.status}`);
      return r.json();
    }

    async function kvSet(key, value) {
      await fetch(`${kvUrl}/set/${key}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${kvToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ value: JSON.stringify(value) })
      });
    }

    const allPatternTeams = [];

    for (const team of TEAMS) {
      try {
        const fixturesRaw = await apiGet(
          `https://v3.football.api-sports.io/fixtures?team=${team.id}&season=${team.season}&status=FT&last=20`
        );
        const matches = safeArray(fixturesRaw.response);
        const finished = matches.filter(m =>
          ["FT","AET","PEN"].includes(m?.fixture?.status?.short || "")
        );

        if (finished.length < 8) continue;

        const htftMap = {};
        finished.forEach(m => {
          const isHome = m?.teams?.home?.id === team.id;
          const htH = m?.score?.halftime?.home;
          const htA = m?.score?.halftime?.away;
          const ftH = Number(m?.goals?.home ?? 0);
          const ftA = Number(m?.goals?.away ?? 0);

          if (htH == null || htA == null) return;

          const myHt = isHome ? Number(htH) : Number(htA);
          const oppHt = isHome ? Number(htA) : Number(htH);
          const myFt = isHome ? ftH : ftA;
          const oppFt = isHome ? ftA : ftH;

          const htResult = myHt > oppHt ? "W" : myHt < oppHt ? "L" : "D";
          const ftResult = myFt > oppFt ? "W" : myFt < oppFt ? "L" : "D";
          const code = `${htResult}/${ftResult}`;

          htftMap[code] = (htftMap[code] || 0) + 1;
        });

        const n = finished.length;
        const sorted = Object.entries(htftMap).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) continue;

        const [topCode, topCount] = sorted[0];
        const topPct = pct(topCount, n);

        if (topPct >= 55) {
          allPatternTeams.push({
            teamId: team.id,
            teamName: team.name,
            league: team.league,
            country: team.country,
            leagueId: team.leagueId,
            season: team.season,
            pattern: topCode,
            patternPct: topPct,
            patternCount: topCount,
            totalMatches: n,
            allPatterns: Object.fromEntries(sorted)
          });
        }

        await new Promise(r => setTimeout(r, 150));

      } catch(err) {
        console.error(`Eroare ${team.name}:`, err.message);
      }
    }

    allPatternTeams.sort((a, b) => b.patternPct - a.patternPct);
    await kvSet("pattern_teams", allPatternTeams);
    await kvSet("pattern_scan_date", new Date().toISOString().slice(0, 10));

    // ── MESAJ TELEGRAM ────────────────────────────────────────────────────
    const sep = "━━━━━━━━━━━━━━━━━━━━";
    let message = `🔍 SCANARE PATTERN HT/FT COMPLETĂ\n${sep}\n`;
    message += `📅 ${new Date().toISOString().slice(0, 10)}\n`;
    message += `✅ Echipe cu pattern ≥55%: ${allPatternTeams.length}\n\n`;

    allPatternTeams.forEach((t, i) => {
      message += `${i + 1}. ${t.teamName} (${t.country})\n`;
      message += `   🏆 ${t.league}\n`;
      message += `   📊 Pattern: ${t.pattern} — ${t.patternPct}% (${t.patternCount}/${t.totalMatches})\n\n`;
    });

    message += `${sep}\n`;
    message += `🧠 Aceste echipe vor fi monitorizate zilnic.`;

    const chunks = [];
    let current = "";
    for (const line of message.split("\n")) {
      if ((current + "\n" + line).length > 4000) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current) chunks.push(current);

    for (const chunk of chunks) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk })
      });
    }

    return res.status(200).json({
      success: true,
      teamsFound: allPatternTeams.length,
      top10: allPatternTeams.slice(0, 10)
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
