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

    const LEAGUES = [
      { name: "Premier League", country: "England", id: 39, season: 2025 },
      { name: "La Liga", country: "Spain", id: 140, season: 2025 },
      { name: "Serie A", country: "Italy", id: 135, season: 2025 },
      { name: "Bundesliga", country: "Germany", id: 78, season: 2025 },
      { name: "Ligue 1", country: "France", id: 61, season: 2025 },
      { name: "Eredivisie", country: "Netherlands", id: 88, season: 2025 },
      { name: "Jupiler Pro League", country: "Belgium", id: 144, season: 2025 },
      { name: "Primeira Liga", country: "Portugal", id: 94, season: 2025 },
      { name: "Super Lig", country: "Turkey", id: 203, season: 2025 },
      { name: "Scottish Premiership", country: "Scotland", id: 179, season: 2024 },
      { name: "Super League", country: "Switzerland", id: 207, season: 2025 },
      { name: "Super League 1", country: "Greece", id: 197, season: 2025 }
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

    // ── SCANARE ECHIPE ────────────────────────────────────────────────────
    const allPatternTeams = [];

    for (const league of LEAGUES) {
      try {
        // Fetch toate echipele din ligă
        const teamsRaw = await apiGet(
          `https://v3.football.api-sports.io/teams?league=${league.id}&season=${league.season}`
        );
        const teams = safeArray(teamsRaw.response);

        for (const teamObj of teams) {
          const teamId = teamObj?.team?.id;
          const teamName = teamObj?.team?.name;
          if (!teamId || !teamName) continue;

          try {
            // Fetch ultimele 20 meciuri
            const fixturesRaw = await apiGet(
              `https://v3.football.api-sports.io/fixtures?team=${teamId}&season=${league.season}&status=FT&last=20`
            );
            const matches = safeArray(fixturesRaw.response);
            const finished = matches.filter(m =>
              ["FT","AET","PEN"].includes(m?.fixture?.status?.short || "")
            );

            if (finished.length < 8) continue;

            // Calculează pattern HT/FT
            const htftMap = {};
            finished.forEach(m => {
              const isHome = m?.teams?.home?.name === teamName;
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
            const sorted = Object.entries(htftMap)
              .sort((a, b) => b[1] - a[1]);

            if (sorted.length === 0) continue;

            const [topCode, topCount] = sorted[0];
            const topPct = pct(topCount, n);

            // Doar echipe cu pattern ≥60%
            if (topPct >= 60) {
              allPatternTeams.push({
                teamId,
                teamName,
                league: league.name,
                country: league.country,
                leagueId: league.id,
                season: league.season,
                pattern: topCode,
                patternPct: topPct,
                patternCount: topCount,
                totalMatches: n,
                allPatterns: Object.fromEntries(sorted)
              });
            }

          } catch(teamErr) {
            // Skip echipă cu eroare
          }

          // Pauză mică între request-uri
          await new Promise(r => setTimeout(r, 100));
        }

      } catch(leagueErr) {
        console.error(`Eroare ligă ${league.name}:`, leagueErr.message);
      }
    }

    // Sortează după procent
    allPatternTeams.sort((a, b) => b.patternPct - a.patternPct);

    // Salvează în KV
    await kvSet("pattern_teams", allPatternTeams);
    await kvSet("pattern_scan_date", new Date().toISOString().slice(0, 10));

    // ── MESAJ TELEGRAM CU REZULTATELE SCANĂRII ────────────────────────────
    const sep = "━━━━━━━━━━━━━━━━━━━━";
    let message = `🔍 SCANARE PATTERN HT/FT COMPLETĂ\n${sep}\n`;
    message += `📅 ${new Date().toISOString().slice(0, 10)}\n`;
    message += `✅ Echipe cu pattern ≥60%: ${allPatternTeams.length}\n\n`;

    // Top 20 echipe
    const top20 = allPatternTeams.slice(0, 20);
    top20.forEach((t, i) => {
      message += `${i + 1}. ${t.teamName} (${t.country})\n`;
      message += `   🏆 ${t.league}\n`;
      message += `   📊 Pattern: ${t.pattern} — ${t.patternPct}% (${t.patternCount}/${t.totalMatches})\n\n`;
    });

    message += `${sep}\n`;
    message += `🧠 Aceste echipe vor fi monitorizate zilnic.`;

    // Chunking
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
      top5: allPatternTeams.slice(0, 5)
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
