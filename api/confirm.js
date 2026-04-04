export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!token || !chatId || !apiKey || !kvUrl || !kvToken) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    // ── CITIRE PICKS DIN KV ─────────────────────────────────────────────
    const kvRes = await fetch(`${kvUrl}/get/daily_picks`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const kvData = await kvRes.json();

    if (!kvData?.result) {
      return res.status(200).json({ skipped: true, reason: "No picks saved today" });
    }

    const savedPicks = JSON.parse(kvData.result);
    if (!savedPicks || savedPicks.length === 0) {
      return res.status(200).json({ skipped: true, reason: "Empty picks" });
    }

    const sep = "━━━━━━━━━━━━━━━━━━━━";
    let message = `🔄 CONFIRMARE PICKS — 18:00 Georgia\n${sep}\n\n`;

    // ── VERIFICARE FIECARE PICK ─────────────────────────────────────────
    for (const pick of savedPicks) {
      try {
        // Caută meciul în API după nume echipe
        const today = new Date().toISOString().slice(0, 10);
        const fixturesRaw = await fetch(
          `https://v3.football.api-sports.io/fixtures?date=${today}`,
          { headers: { "x-apisports-key": apiKey } }
        );
        const fixturesData = await fixturesRaw.json();
        const fixtures = Array.isArray(fixturesData?.response) ? fixturesData.response : [];

        const [homeTeam, awayTeam] = pick.match.split(" vs ");
        const fixture = fixtures.find(f =>
          f?.teams?.home?.name === homeTeam && f?.teams?.away?.name === awayTeam
        );

        if (!fixture) {
          message += `❓ ${pick.match}\n`;
          message += `   📊 ${pick.market}\n`;
          message += `   ⚠️ Meci negăsit — verificați manual\n\n`;
          continue;
        }

        const status = fixture?.fixture?.status?.short || "";
        const fixtureId = fixture?.fixture?.id;

        // Meci deja început sau terminat
        if (["1H","HT","2H","FT","AET","PEN"].includes(status)) {
          message += `⏳ ${pick.match}\n`;
          message += `   📊 ${pick.market}\n`;
          message += `   🔴 Meci în desfășurare sau terminat\n\n`;
          continue;
        }

        // Verificare accidentări noi
        const injRaw = await fetch(
          `https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`,
          { headers: { "x-apisports-key": apiKey } }
        );
        const injData = await injRaw.json();
        const injuries = Array.isArray(injData?.response) ? injData.response : [];
        const injuryCount = injuries.length;

        // Verificare oră meci
        const currentKickoffUTC = fixture?.fixture?.timestamp
          ? new Date(fixture.fixture.timestamp * 1000).toISOString().slice(11, 16)
          : pick.kickoffUTC;
        const timeChanged = currentKickoffUTC !== pick.kickoffUTC;

        // Construire status
        let status_msg = "✅";
        let notes = [];

        if (timeChanged) {
          status_msg = "⚠️";
          notes.push(`Ora schimbată: ${pick.kickoffUTC} → ${currentKickoffUTC} UTC`);
        }
        if (injuryCount >= 3) {
          status_msg = "⚠️";
          notes.push(`${injuryCount} accidentări detectate`);
        }

        message += `${status_msg} ${pick.match}\n`;
        message += `   📊 ${pick.market} | 🎯 ${pick.confidence}%\n`;
        message += `   🕒 Ora: ${currentKickoffUTC} UTC\n`;
        if (notes.length > 0) {
          notes.forEach(n => { message += `   ⚠️ ${n}\n`; });
        } else {
          message += `   ✅ Fără schimbări detectate\n`;
        }
        message += `\n`;

      } catch (pickErr) {
        message += `❓ ${pick.match} — eroare verificare\n\n`;
      }
    }

    message += `${sep}\n`;
    message += `🧠 Reverificați înainte de a paria. Alegerea finală vă aparține.`;

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    const tgJson = await tgRes.json();
    if (!tgRes.ok || !tgJson.ok) {
      return res.status(500).json({ error: tgJson.description });
    }

    return res.status(200).json({ success: true, picksChecked: savedPicks.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
