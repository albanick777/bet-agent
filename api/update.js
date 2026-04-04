import { buildEliteReport } from "../lib/buildReport.js";

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!token || !chatId || !apiKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    const data = await buildEliteReport("ro", apiKey);
    const sep = "━━━━━━━━━━━━━━━━━━━━";

    // Nu trimite dacă nu sunt picks
    if (!data.top5 || data.top5.length === 0) {
      return res.status(200).json({ skipped: true, reason: "No picks to update" });
    }

    const top = data.top5[0];
    const message = [
      `🔄 UPDATE — TOP BET`,
      sep,
      `📅 ${data.date} | 📌 ${data.statusZi}`,
      ``,
      `🏆 ${top.league} | ${top.country}`,
      `⚽ ${top.match}`,
      `🕒 ${top.kickoffLocal} local | ${top.kickoffUTC} UTC`,
      `📊 ${top.market}`,
      `🎯 Confidence: ${top.confidence}%`,
      `⚠️ Risc: ${top.risk}`,
      ``,
      sep,
      `🧠 Nu forțăm pariuri. Focus: profit pe termen lung.`
    ].join("\n");

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
  totalMatches: data.totalMatches,
  totalPicks: data.totalPicks,
  top5Count: data.top5?.length,
  statusZi: data.statusZi,
  top5: data.top5
});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
