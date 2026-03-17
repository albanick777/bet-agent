export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;

    const headers = {
      "x-apisports-key": apiKey,
    };

    const fixturesRes = await fetch(
      "https://v3.football.api-sports.io/fixtures?next=10",
      { headers }
    );

    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData?.response || [];

    if (!fixtures.length) {
      return res.status(200).json({ ok: true, message: "No matches" });
    }

    const match = fixtures[0];

    const home = match.teams.home.name;
    const away = match.teams.away.name;
    const league = match.league.name;
    const date = match.fixture.date;

    const message =
      `🔥 BET AI AGENT - TOP ELITA\n\n` +
      `⚽ ${home} vs ${away}\n` +
      `🏆 ${league}\n` +
      `📅 ${date}\n\n` +
      `⚠️ Analiza automata activa`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const tgRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });

    const data = await tgRes.json();

    return res.status(200).json({
      ok: true,
      telegram: data,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
