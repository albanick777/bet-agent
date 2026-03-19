export default async function handler(req, res) {
  try {
    const API_KEY = process.env.API_FOOTBALL_KEY;

    const response = await fetch("https://v3.football.api-sports.io/fixtures?next=20", {
      headers: {
        "x-apisports-key": API_KEY
      }
    });

    const raw = await response.text();

    // protecție dacă API dă eroare HTML
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "API FOOTBALL ERROR",
        details: raw.slice(0, 200)
      });
    }

    const fixtures = data.response || [];

    const picks = fixtures.slice(0, 5).map(f => ({
      match: `${f.teams.home.name} vs ${f.teams.away.name}`,
      league: f.league.name,
      market: "Over 1.5 Goals",
      confidence: 75,
      type: "SAFE",
      risk: "LOW",
      projectedGoals: 2,
      winnerName: f.teams.home.name,
      reason: "Basic model fallback"
    }));

    return res.status(200).json({
      smartBlock: false,
      top1: picks[0] || null,
      top3: picks.slice(0, 3),
      top5: picks,
      safePicks: picks,
      aggressivePicks: [],
      cornersPicks: [],
      htftWatchlist: [],
      recommendedTicketSize: "2-3 meciuri",
      warnings: []
    });

  } catch (err) {
    return res.status(500).json({
      error: "SERVER ERROR",
      message: err.message
    });
  }
}
