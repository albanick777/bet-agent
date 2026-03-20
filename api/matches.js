export default async function handler(req, res) {
  try {
    const API_KEY = process.env.API_FOOTBALL_KEY;

    if (!API_KEY) {
      return res.status(500).json({
        status: "ERROR",
        message: "Missing API_FOOTBALL_KEY"
      });
    }

    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    const leagues = [
      39, 140, 135, 78, 61, 88, 94, 71, 144, 141, 79
    ];

    const requests = leagues.map((league) =>
      fetch(
        `https://v3.football.api-sports.io/fixtures?date=${date}&league=${league}&season=2025`,
        {
          headers: {
            "x-apisports-key": API_KEY
          }
        }
      ).then((r) => r.json())
    );

    const results = await Promise.all(requests);

    const fixtures = results.flatMap((r) => Array.isArray(r.response) ? r.response : []);

    const upcoming = fixtures.filter((f) => {
      const status = f.fixture?.status?.short;
      return status === "NS" || status === "TBD" || status === "PST";
    });

    const analyzed = upcoming.map((f) => {
      const home = f.teams?.home?.name || "Home";
      const away = f.teams?.away?.name || "Away";
      const league = f.league?.name || "League";
      const dateTime = f.fixture?.date || "";
      const venue = f.fixture?.venue?.name || "";

      const homeGoalsFor = f.teams?.home?.winner === true ? 2 : 1;
      const awayGoalsFor = f.teams?.away?.winner === true ? 2 : 1;

      let aiScore = 70;
      let risk = "MEDIUM";
      let market = "Over 1.5 Goals";
      let pickType = "SAFE";
      let confidence = 72;
      let reason = "Base model";

      if (home && away) {
        const strongHomeNames = [
          "Club Brugge", "FC Bruges", "Manchester City", "Bayer Leverkusen",
          "Atalanta", "PSV Eindhoven", "Benfica", "Sporting CP"
        ];

        const attackingNames = [
          "Atalanta", "Leverkusen", "PSV Eindhoven", "Benfica",
          "Liverpool", "Bayern Munich", "Manchester City"
        ];

        if (strongHomeNames.some((t) => home.includes(t))) {
          market = "Home Win";
          pickType = "TOP";
          aiScore = 86;
          confidence = 84;
          risk = "LOW";
          reason = "Strong home pattern";
        }

        if (attackingNames.some((t) => home.includes(t) || away.includes(t))) {
          market = "Over 2.5 Goals";
          pickType = "VALUE";
          aiScore = Math.max(aiScore, 82);
          confidence = Math.max(confidence, 79);
          risk = "MEDIUM";
          reason = "Attacking team profile";
        }
      }

      const htftCandidate = aiScore >= 82
        ? {
            market: "HT/FT 1/1",
            confidence: Math.max(confidence - 4, 70),
            reason: "Basic HT/FT home pressure model"
          }
        : null;

      const cornersCandidate = {
        market: "Over 8.5 Corners",
        confidence: Math.max(confidence - 6, 66),
        reason: "Basic corners volume model"
      };

      return {
        match: `${home} vs ${away}`,
        league,
        dateTime,
        venue,
        market,
        pickType,
        aiScore,
        confidence,
        risk,
        reason,
        htft: htftCandidate,
        corners: cornersCandidate
      };
    });

    const sorted = analyzed.sort((a, b) => b.aiScore - a.aiScore);

    const top1 = sorted[0] || null;
    const top3 = sorted.slice(0, 3);
    const safePicks = sorted.filter((x) => x.risk === "LOW").slice(0, 3);
    const valuePicks = sorted.filter((x) => x.pickType === "VALUE").slice(0, 3);
    const htftPicks = sorted.filter((x) => x.htft).slice(0, 2).map((x) => ({
      match: x.match,
      market: x.htft.market,
      confidence: x.htft.confidence,
      reason: x.htft.reason
    }));
    const cornersPicks = sorted.slice(0, 3).map((x) => ({
      match: x.match,
      market: x.corners.market,
      confidence: x.corners.confidence,
      reason: x.corners.reason
    }));

    const statusZi =
      top3.length === 0
        ? "NO BET DAY"
        : top1 && top1.aiScore >= 84
        ? "ZI JUCABILA"
        : "ZI MEDIE";

    return res.status(200).json({
      status: "OK",
      statusZi,
      totalMatches: sorted.length,
      top1,
      top3,
      safePicks,
      valuePicks,
      htftPicks,
      cornersPicks
    });
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      message: err.message
    });
  }
}
