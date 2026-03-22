export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"
      });
    }

    const baseUrl = "https://bet-agent-best-git-main-nickys-projects-cd54cb04.vercel.app";

    const dataRes = await fetch(`${baseUrl}/api/matches?lang=ro`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const rawText = await dataRes.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(500).json({
        error: "Matches did not return JSON",
        preview: rawText.slice(0, 300)
      });
    }

    if (!dataRes.ok) {
      return res.status(500).json({
        error: `Matches API failed: ${dataRes.status}`,
        details: data
      });
    }

    if (!data || data.status !== "OK") {
      return res.status(500).json({
        error: "NO DATA",
        details: data
      });
    }

    function formatPick(p) {
      if (!p) return "-";
      return `• ${p.match}\n${p.market} | ${p.confidence}% | ${p.risk}`;
    }

    function addSection(title, picks, limit = 5) {
      let block = `${title}\n`;
      const list = Array.isArray(picks) ? picks.slice(0, limit) : [];
      if (!list.length) {
        block += "-\n\n";
        return block;
      }
      list.forEach((p) => {
        block += `${formatPick(p)}\n`;
      });
      block += `\n`;
      return block;
    }

    let message = "";

    message += `⚽ ELITE BET AGENT V5\n`;
    message += `📅 ${data.date}\n`;
    message += `🕒 UTC: ${data.hourUTC}\n`;
    message += `📌 ${data.statusZi}\n`;
    message += `🎯 Meciuri analizate: ${data.totalMatches}\n`;
    message += `📦 Picks totale: ${data.totalPicks}\n\n`;

    message += `🏅 TOP 1\n${formatPick(data.top1)}\n\n`;
    message += addSection(`🥇 TOP 3`, data.top3, 3);
    message += addSection(`🔥 TOP 5`, data.top5, 5);
    message += addSection(`🟢 SAFE PICKS`, data.safePicks, 5);
    message += addSection(`💎 VALUE PICKS`, data.valuePicks, 5);
    message += addSection(`🔵 HT/FT PICKS`, data.htftPicks, 5);
    message += addSection(`📐 CORNERS PICKS`, data.cornersPicks, 5);
    message += addSection(`⏱ TIMING PICKS`, data.timingPicks, 5);

    message += `👀 TRACKED MATCHES\n`;
    if (Array.isArray(data.trackedTeams) && data.trackedTeams.length) {
      data.trackedTeams.slice(0, 10).forEach((t) => {
        message += `• ${t.home} vs ${t.away} (${t.league})\n`;
      });
    } else {
      message += `-\n`;
    }

    if (message.length > 3900) {
      message = message.slice(0, 3900) + `\n\n...trimmed`;
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    const tgJson = await tgRes.json();

    if (!tgRes.ok || !tgJson.ok) {
      return res.status(500).json({
        error: tgJson.description || "Telegram send failed",
        telegram_response: tgJson
      });
    }

    return res.status(200).json({
      success: true,
      telegram: tgJson.result?.message_id || true
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
