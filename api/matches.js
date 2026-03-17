export default async function handler(req, res) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;

    const response = await fetch(
      "https://v3.football.api-sports.io/fixtures?next=10",
      {
        headers: {
          "x-apisports-key": apiKey,
        },
      }
    );

    const data = await response.json();

    const matches = data.response.map((m) => {
      const home = m.teams.home.name;
      const away = m.teams.away.name;
      const goalsHome = m.goals.home;
      const goalsAway = m.goals.away;

      let prediction = "LOW";
      let confidence = 50;

      if (goalsHome !== null && goalsAway !== null) {
        const total = goalsHome + goalsAway;

        if (total >= 3) {
          prediction = "OVER 2.5";
          confidence = 75;
        } else if (total === 2) {
          prediction = "OVER 1.5";
          confidence = 65;
        } else {
          prediction = "UNDER 2.5";
          confidence = 60;
        }
      }

      return {
        match: `${home} vs ${away}`,
        prediction,
        confidence,
      };
    });

    res.status(200).json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
