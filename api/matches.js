export default async function handler(req, res) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    const headers = { "x-apisports-key": apiKey };

    const fixturesRes = await fetch(
      "https://v3.football.api-sports.io/fixtures?next=20",
      { headers }
    );
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData?.response || [];

    const upcoming = fixtures.filter(
      (f) =>
        f?.fixture?.status?.short === "NS" ||
        f?.fixture?.status?.short === "TBD"
    );

    const safePicks = [];
    const aggressivePicks = [];

    for (const f of upcoming.slice(0, 12)) {
      const fixtureId = f.fixture.id;

      const predRes = await fetch(
        `https://v3.football.api-sports.io/predictions?fixture=${fixtureId}`,
        { headers }
      );
      const predData = await predRes.json();
      const pred = predData?.response?.[0];

      if (!pred) continue;

      const home = f.teams.home.name;
      const away = f.teams.away.name;
      const league = f.league.name;
      const date = f.fixture.date;

      const percentHome = parseInt(
        (pred?.predictions?.percent?.home || "0").replace("%", "")
      );
      const percentDraw = parseInt(
        (pred?.predictions?.percent?.draw || "0").replace("%", "")
      );
      const percentAway = parseInt(
        (pred?.predictions?.percent?.away || "0").replace("%", "")
      );

      const winnerComment = (pred?.predictions?.winner?.comment || "").toLowerCase();
      const winnerName = pred?.predictions?.winner?.name || "";

      const goals = pred?.predictions?.goals || {};
      const projectedHome = Number(goals?.home || 0);
      const projectedAway = Number(goals?.away || 0);
      const projectedGoals = Number((projectedHome + projectedAway).toFixed(1));

      const comparison = pred?.comparison || {};
      const attHome = Number(comparison?.att?.home || 0);
      const attAway = Number(comparison?.att?.away || 0);
      const defHome = Number(comparison?.def?.home || 0);
      const defAway = Number(comparison?.def?.away || 0);
      const formHome = Number(comparison?.form?.home || 0);
      const formAway = Number(comparison?.form?.away || 0);
      const poissonHome = Number(comparison?.poisson_distribution?.home || 0);
      const poissonAway = Number(comparison?.poisson_distribution?.away || 0);
      const h2hHome = Number(comparison?.h2h?.home || 0);
      const h2hAway = Number(comparison?.h2h?.away || 0);

      // ---------- SAFE MARKET ----------
      let safeMarket = null;
      let safeConfidence = 0;
      const safeReasons = [];

      if (projectedGoals >= 3.0 && attHome >= 50 && attAway >= 45) {
        safeMarket = "OVER 2.5";
        safeConfidence = 84;
        safeReasons.push(`Projected goals ${projectedGoals}`);
      } else if (projectedGoals >= 2.2) {
        safeMarket = "OVER 1.5";
        safeConfidence = 78;
        safeReasons.push(`Projected goals ${projectedGoals}`);
      }

      if (
        projectedHome >= 1 &&
        projectedAway >= 1 &&
        attHome >= 45 &&
        attAway >= 45
      ) {
        if (safeConfidence < 82) {
          safeMarket = "BTTS";
          safeConfidence = 82;
        }
        safeReasons.push("Both sides projected to score");
      }

      if (winnerComment.includes("home") && percentHome >= 60) {
        if (safeConfidence < 80) {
          safeMarket = "1X";
          safeConfidence = percentHome;
        }
        safeReasons.push(`Home side edge ${percentHome}%`);
      }

      if (winnerComment.includes("away") && percentAway >= 60) {
        if (safeConfidence < 80) {
          safeMarket = "X2";
          safeConfidence = percentAway;
        }
        safeReasons.push(`Away side edge ${percentAway}%`);
      }

      if (!safeMarket && projectedGoals <= 2.4 && percentDraw >= 24) {
        safeMarket = "UNDER 3.5";
        safeConfidence = 74;
        safeReasons.push("Lower projected total");
      }

      if (safeMarket && safeConfidence >= 74) {
        safePicks.push({
          fixtureId,
          type: "SAFE",
          match: `${home} vs ${away}`,
          league,
          date,
          market: safeMarket,
          confidence: safeConfidence,
          risk:
            safeConfidence >= 84 ? "LOW" : safeConfidence >= 78 ? "MEDIUM" : "HIGH",
          projectedGoals,
          winnerName,
          reason: safeReasons.join(" | "),
        });
      }

      // ---------- AGGRESSIVE / SNIPER ----------
      let aggrMarket = null;
      let aggrConfidence = 0;
      const aggrReasons = [];

      // HT/FT Home
      if (
        percentHome >= 68 &&
        formHome >= formAway + 5 &&
        attHome >= 50 &&
        projectedHome >= 1.5 &&
        projectedAway <= 1.0 &&
        poissonHome >= poissonAway
      ) {
        aggrMarket = "HT/FT 1/1";
        aggrConfidence = 70;
        aggrReasons.push("Strong home control profile");
      }

      // HT/FT Draw/Home
      if (
        percentHome >= 62 &&
        projectedHome >= 1.4 &&
        projectedAway <= 1.1 &&
        percentDraw >= 20 &&
        attHome >= 48 &&
        defHome >= 45
      ) {
        if (aggrConfidence < 73) {
          aggrMarket = "HT/FT X/1";
          aggrConfidence = 73;
        }
        aggrReasons.push("Likely slow first half, stronger home finish");
      }

      // HT/FT Draw/Away
      if (
        percentAway >= 62 &&
        projectedAway >= 1.4 &&
        projectedHome <= 1.1 &&
        percentDraw >= 20 &&
        attAway >= 48 &&
        defAway >= 45
      ) {
        if (aggrConfidence < 73) {
          aggrMarket = "HT/FT X/2";
          aggrConfidence = 73;
        }
        aggrReasons.push("Likely slow first half, stronger away finish");
      }

      // Combo goals
      if (
        projectedGoals >= 3.1 &&
        projectedHome >= 1.2 &&
        projectedAway >= 1.0 &&
        attHome >= 48 &&
        attAway >= 48
      ) {
        if (aggrConfidence < 72) {
          aggrMarket = "BTTS + OVER 2.5";
          aggrConfidence = 72;
        }
        aggrReasons.push("Open game with strong scoring profile");
      }

      // Home win + over
      if (
        percentHome >= 66 &&
        projectedHome >= 1.7 &&
        projectedGoals >= 2.7 &&
        h2hHome >= h2hAway
      ) {
        if (aggrConfidence < 71) {
          aggrMarket = "1 + OVER 1.5";
          aggrConfidence = 71;
        }
        aggrReasons.push("Home edge + total goals support");
      }

      if (aggrMarket && aggrConfidence >= 70) {
        aggressivePicks.push({
          fixtureId,
          type: "AGGRESSIVE",
          match: `${home} vs ${away}`,
          league,
          date,
          market: aggrMarket,
          confidence: aggrConfidence,
          risk: aggrConfidence >= 75 ? "MEDIUM" : "HIGH",
          projectedGoals,
          winnerName,
          reason: aggrReasons.join(" | "),
        });
      }
    }

    safePicks.sort((a, b) => b.confidence - a.confidence);
    aggressivePicks.sort((a, b) => b.confidence - a.confidence);

    const top1 = safePicks[0] || aggressivePicks[0] || null;
    const top3 = [...safePicks.slice(0, 3)];
    const top5 = [...safePicks.slice(0, 4), ...aggressivePicks.slice(0, 1)].slice(0, 5);

    const warnings = [];
    if (safePicks.length === 0) warnings.push("No safe picks today.");
    if (safePicks.filter((p) => p.confidence >= 80).length < 2) {
      warnings.push("Smart Block: not enough elite safe picks.");
    }
    if (aggressivePicks.length === 0) {
      warnings.push("No sniper HT/FT picks today.");
    }

    let recommendedTicketSize = "1-2 meciuri";
    if (safePicks.length >= 3 && safePicks[0]?.confidence >= 82) {
      recommendedTicketSize = "2-3 meciuri";
    }
    if (safePicks.length >= 5 && safePicks[0]?.confidence >= 85) {
      recommendedTicketSize = "3-5 meciuri";
    }

    return res.status(200).json({
      smartBlock: safePicks.filter((p) => p.confidence >= 80).length < 2,
      warnings,
      recommendedTicketSize,
      top1,
      top3,
      top5,
      safePicks,
      aggressivePicks,
    });
  } catch (error) {
    return res.status(500).json({
      error: "ELITE_V2_ERROR",
      details: error.message,
    });
  }
}
