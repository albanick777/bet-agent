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

    function formatPick(p, i) {
      return [
        `${i + 1}. ${p.match}`,
        `   🏆 ${p.league} | ${p.country}`,
        `   🕒 ${p.kickoffLocal} local | ${p.kickoffUTC} UTC`,
        `   📊 ${p.market}`,
        `   🎯 Confidence: ${p.confidence}%`,
        `   ⚠️ Risc: ${p.risk}`
      ].join("\n");
    }

    let message = "";
    message += `🏆 TOP BET — EUROPEAN LEAGUES\n`;
    message += `${sep}\n`;
    message += `📅 ${data.date} | UTC: ${data.hourUTC}:00\n`;
    message += `📌 ${data.statusZi}\n`;
    message += `🔍 Meciuri analizate: ${data.totalMatches} | Picks: ${data.totalPicks}\n`;
    message += `${sep}\n\n`;

    message += `🔥 TOP 5 PREDICȚII (≥75%)\n${sep}\n`;
    if (data.top5 && data.top5.length) {
      data.top5.forEach((p, i) => {
        message += `\n${formatPick(p, i)}\n`;
      });
    } else {
      message += `\nNu există predicții ≥75% azi.\n`;
    }

    if (data.patternWatch && data.patternWatch.length) {
      message += `\n${sep}\n\n`;
      message += `🔬 PATTERN WATCH — JOACĂ AZI\n${sep}\n`;
      data.patternWatch.forEach(t => {
        const s = t.stats;
        const side = t.isHome ? "🏠 Acasă" : "✈️ Deplasare";
        message += `\n📍 ${t.name} (${t.country})\n`;
        message += `   ${side} vs ${t.opponent}\n`;
        message += `   🏆 ${t.league}\n`;
        message += `   🕒 ${t.kickoffLocal} local | ${t.kickoffUTC} UTC\n`;
        message += `   📊 Pattern dominant: ${t.topSignal?.label} ${t.topSignal?.val}%\n`;
        message += `   Over2.5: ${s.over25Pct}% | BTTS: ${s.bttsPct}% | Win: ${s.winPct}%\n`;
        message += `   HT/FT: ${s.topHtftCode||"-"} (${s.topHtftPct}%) | Gol R2: ${s.score2HPct}%\n`;
      });
      message += `\n${sep}\n\n`;
    }

    message += `\n${sep}\n`;
    message += `🧠 Nu forțăm pariuri. Focus: profit pe termen lung.`;

    const chunks = [];
    let current = "";
    for (const line of message.split("\n")) {
      if ((current + "\n" + line).length > 4000) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current) chunks.push(current);

    for (const chunk of chunks) {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk })
      });
      const tgJson = await tgRes.json();
      if (!tgRes.ok || !tgJson.ok) {
        return res.status(500).json({ error: tgJson.description, telegram_response: tgJson });
      }
    }

    return res.status(200).json({ success: true, chunks: chunks.length, picks: data.top5?.length || 0 });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
