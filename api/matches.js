export default async function handler(req, res) {
  const API_KEY = process.env.API_FOOTBALL_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "Missing API_FOOTBALL_KEY" });
  }

  const today = new Date().toISOString().split("T")[0];

  const url = `https://v3.football.api-sports.io/fixtures?date=${today}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY
      }
    });

    const data = await response.json();

    const ELITE_TEAMS = [
      "Kawasaki Frontale",
      "Yokohama F. Marinos",
      "Kashima Antlers",
      "Urawa Red Diamonds",
      "Ulsan Hyundai",
      "Jeonbuk Hyundai Motors",
      "Pohang Steelers"
    ];

    const hour = new Date().getHours();

    const picks = [];

    data.response.forEach(match => {
      const home = match.teams.home.name;
      const away = match.teams.away.name;

      // 🔥 FILTRU ELITĂ
      if (!ELITE_TEAMS.includes(home) && !ELITE_TEAMS.includes(away)) return;

      // 🔥 IGNORĂ MECIURI ÎNCEPUTE
      if (match.fixture.status.short !== "NS") return;

      const league = match.league.name;

      // 🔥 LOGICĂ SIMPLĂ (FAZA 1)
      let pick = null;

      if (league.includes("Japan")) {
        pick = {
          type: "OVER 2.5",
          confidence: "HIGH"
        };
      }

      if (league.includes("Korea")) {
        pick = {
          type: "HOME WIN or OVER 1.5",
          confidence: "MEDIUM"
        };
      }

      if (pick) {
        picks.push({
          match: `${home} vs ${away}`,
          league,
          pick: pick.type,
          confidence: pick.confidence,
          time: match.fixture.date
        });
      }
    });

    if (picks.length === 0) {
      return res.status(200).json({
        status: "OK",
        statusZi: "NO BET DAY",
        totalMatches: 0
      });
    }

    return res.status(200).json({
      status: "OK",
      totalMatches: picks.length,
      picks: picks.slice(0, 5)
    });

  } catch (err) {
    return res.status(500).json({ error: "API ERROR", details: err.message });
  }
}