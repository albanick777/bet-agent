export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!token || !chatId || !kvUrl || !kvToken) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    // Luna curentă sau luna specificată prin ?month=2026-04
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = req.query.month || 
      `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

    const monthKey = `picks_history_${month}`;

    // Citire istoric
    const historyRes = await fetch(`${kvUrl}/get/${monthKey}`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const historyData = await historyRes.json();

    if (!historyData?.result) {
      return res.status(200).json({ 
        skipped: true, 
        reason: `Nu există picks pentru ${month}` 
      });
    }

    let history = [];
    try {
      const outer = JSON.parse(historyData.result);
      history = JSON.parse(typeof outer.value === "string" ? outer.value : "[]");
    } catch(e) {
      return res.status(500).json({ error: "Eroare parsare istoric" });
    }

    // Calculează statistici
    const totalPicks = history.length;
    const withResult = history.filter(p => p.result !== null && p.result !== undefined);
    const wins = withResult.filter(p => p.result === "win").length;
    const losses = withResult.filter(p => p.result === "loss").length;
    const pending = totalPicks - withResult.length;
    const successRate = withResult.length > 0 
      ? Math.round((wins / withResult.length) * 100) 
      : 0;

    // ROI estimat — presupunem cota medie 1.85 per pick
    const avgOdd = 1.85;
    const roi = withResult.length > 0
      ? Math.round(((wins * avgOdd - withResult.length) / withResult.length) * 100)
      : 0;

    // Statistici per market
    const marketStats = {};
    withResult.forEach(p => {
      if (!marketStats[p.market]) {
        marketStats[p.market] = { wins: 0, total: 0 };
      }
      marketStats[p.market].total++;
      if (p.result === "win") marketStats[p.market].wins++;
    });

    // Construire mesaj
    const sep = "━━━━━━━━━━━━━━━━━━━━";
    const monthName = new Date(month + "-01").toLocaleString("ro-RO", { 
      month: "long", year: "numeric" 
    });

    let message = `📊 RAPORT ${monthName.toUpperCase()}\n${sep}\n\n`;
    message += `📈 Total picks: ${totalPicks}\n`;
    message += `✅ Câștigate: ${wins}\n`;
    message += `❌ Pierdute: ${losses}\n`;
    if (pending > 0) message += `⏳ Fără rezultat: ${pending}\n`;
    message += `\n🎯 Rata de succes: ${successRate}%\n`;
    message += `💰 ROI estimat: ${roi > 0 ? "+" : ""}${roi}%\n`;

    // Per market
    if (Object.keys(marketStats).length > 0) {
      message += `\n${sep}\n📋 DETALII PER MARKET:\n`;
      Object.entries(marketStats)
        .sort((a, b) => b[1].wins/b[1].total - a[1].wins/a[1].total)
        .forEach(([market, stats]) => {
          const mRate = Math.round((stats.wins / stats.total) * 100);
          message += `\n${market}\n`;
          message += `   ✅ ${stats.wins}/${stats.total} — ${mRate}%\n`;
        });
    }

    message += `\n${sep}\n`;
    message += `🧠 Continuăm. Focus: profit pe termen lung.`;

    // Trimite în Telegram
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    const tgJson = await tgRes.json();

    if (!tgRes.ok || !tgJson.ok) {
      return res.status(500).json({ error: tgJson.description });
    }

    return res.status(200).json({
      success: true,
      month,
      totalPicks,
      wins,
      losses,
      successRate,
      roi
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
