export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    const dataRes = await fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/api/matches`);
    const data = await dataRes.json();

    if (!data) {
      return res.status(500).json({ error: "NO DATA" });
    }

    function formatPick(p) {
      if (!p) return "—";
      return `• ${p.match}\n  ${p.market} | ${p.confidence}%`;
    }

    let message = "";

    // HEADER
    message += `⚽ *ELITE BET AGENT V3*\n\n`;

    // SMART BLOCK
    if (data.smartBlock) {
      message += `❌ *SMART BLOCK ACTIV*\nNu sunt suficiente selecții curate azi.\n\n`;
    } else {
      message += `✅ *ZI JUCABILĂ*\n\n`;
    }

    // TOP 1
    message += `🥇 *TOP 1*\n${formatPick(data.top1)}\n\n`;

    // TOP 3
    message += `🎯 *TOP 3*\n`;
    (data.top3 || []).forEach(p => {
      message += `${formatPick(p)}\n`;
    });
    message += `\n`;

    // SAFE
    message += `🟢 *SAFE PICKS*\n`;
    (data.safePicks || []).slice(0,5).forEach(p => {
      message += `${formatPick(p)}\n`;
    });
    message += `\n`;

    // HT/FT
    message += `🟣 *HT/FT PICKS*\n`;
    (data.aggressivePicks || []).slice(0,5).forEach(p => {
      message += `${formatPick(p)}\n`;
    });
    message += `\n`;

    // CORNERS
    message += `📐 *CORNERS*\n`;
    (data.cornersPicks || []).slice(0,5).forEach(p => {
      message += `${formatPick(p)}\n`;
    });
    message += `\n`;

    // WATCHLIST
    message += `👁 *HT/FT WATCHLIST*\n`;
    (data.htftWatchlist || []).slice(0,5).forEach(t => {
      message += `• ${t.team} (${t.side}) - ${t.pattern} (${t.confidence}%)\n`;
    });
    message += `\n`;

    // TICKET
    message += `📊 *TICKET*: ${data.recommendedTicketSize}\n`;

    // WARNINGS
    if (data.warnings?.length) {
      message += `\n⚠️ *WARNINGS*\n`;
      data.warnings.forEach(w => {
        message += `• ${w}\n`;
      });
    }

    // SEND
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown"
      })
    });

    res.status(200).json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
