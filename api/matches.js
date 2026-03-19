module.exports = async function handler(req, res) {
  try {
    const API_KEY = process.env.API_FOOTBALL_KEY;

    const response = await fetch("https://v3.football.api-sports.io/fixtures?next=10", {
      headers: {
        "x-apisports-key": API_KEY
      }
    });

    const data = await response.json();

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
      reason: "Fallback model"
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
      error: err.message
    });
  }
};
// fix
