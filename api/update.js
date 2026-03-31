// Trimite update la 17:00 și 19:00 Georgia (13:00 și 15:00 UTC)
// Anti-dublare: verifică fereastra de timp

import { buildEliteReport } from "../lib/buildReport.js";

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!token || !chatId || !apiKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    // Anti-dublare: acceptăm doar în fereastra cron (13:00 sau 15:00 UTC ±15min)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    const totalMin = utcHour * 60 + utcMin;

    const windows = [
      { start: 12 * 60 + 45, end: 13 * 60 + 15, label: "17:00 GE" },
      { start: 14 * 60 + 45, end: 15 * 60 + 15, label: "19:00 GE" }
    ];

    const inWindow = windows.find(w => totalMin >= w.start && totalMin <= w.end);

    if (req.headers["x-vercel-cron"] === "1" && !inWindow) {
      return res.status(200).json({
        skipped: true,
        reason: `Outside update windows. UTC: ${utcHour}:${String(utcMin).padStart(2, "0")}`
      });
    }

    const data = await buildEliteReport("ro", apiKey);

    function formatPick(p) {
      if (!p) return "—";
      return [
        `  🏆 ${p.league}`,
        `  ⚽ ${p.match}`,
        `  🕒 ${p.kickoff} (Georgia)`,
        `  📊 ${p.market}`,
        `  🎯 Confidence: ${p.confidence}%`,
        `  ⚠️ Risc: ${p.risk}`
      ].join("\n");
    }

    const windowLabel = inWindow ? inWindow.label : "manual";
    const sep = "━━━━━━━━━━━━━━━━━━━━";

    let message = "";
    message += `🔄 ELITE UPDATE — ${windowLabel}\n`;
    message += `${sep}\n`;
    message += `📅 ${data.date} | 📌 ${data.statusZi}\n\n`;

    message += `✅ PICK CONFIRMAT\n`;
    message += data.top1 ? formatPick(data.top1) : "  —";
    message += `\n\n`;

    if (data.valuePicks && data.valuePicks.length) {
      message += `🔥 VALUE NOU\n`;
      message += formatPick(data.valuePicks[0]);
      message += `\n\n`;
    }

    if (data.safePicks && data.safePicks.length) {
      message += `🟢 SAFE PICK\n`;
      message += formatPick(data.safePicks[0]);
      message += `\n\n`;
    }

    message += `${sep}\n`;
    message += `🧠 Nu forțăm pariuri. Focus: profit pe termen lung.`;

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });

    const tgJson = await tgRes.json();

    if (!tgRes.ok || !tgJson.ok) {
      return res.status(500).json({
        error: tgJson.description || "Telegram send failed",
        telegram_response: tgJson
      });
    }

    return res.status(200).json({ success: true, message_id: tgJson.result?.message_id });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
