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

    // TOP 5
    message += `🔥 TOP 5 PREDICȚII (≥75%)\n${sep}\n`;
    if (data.top5 && data.top5.length) {
      data.top5.forEach((p, i) => {
        message += `\n${formatPick(p, i)}\n`;
      });
    } else {
      message += `\nNu există predicții ≥75% azi.\n`;
    }

    message += `\n${sep}\n\n`;

    // PATTERN WATCH
    message += `🔬 PATTERN WATCH — 5 ECHIPE STABILE\n${sep}\n`;
    if (data.patternWatch && data.patternWatch.length) {
      data.patternWatch.forEach(t => {
        const h = t.home;
        const a = t.away;

        // Cel mai puternic semnal acasă
        const homeSignals = [
          { label: "Over 2.5", val: h.over25Pct },
          { label: "BTTS", val: h.bttsPct },
          { label: "Under 3.5", val: h.under35Pct },
          { label: "Win", val: h.winPct },
          { label: "Gol R1", val: h.scoredR1Pct },
          { label: "Gol R2", val: h.score2HPct }
        ].sort((a, b) => b.val - a.val)[0];

        const awaySignals = [
          { label: "Over 2.5", val: a.over25Pct },
          { label: "BTTS", val: a.bttsPct },
          { label: "Under 3.5", val: a.under35Pct },
          { label: "Win", val: a.winPct },
          { label: "Gol R1", val: a.scoredR1Pct },
          { label: "Gol R2", val: a.score2HPct }
        ].sort((a, b) => b.val - a.val)[0];

        message += `\n📍 ${t.name} (${t.country})\n`;
        message += `   🏠 Acasă (${h.totalMatches} meciuri)\n`;
        message += `      Pattern dominant: ${homeSignals?.label} ${homeSignals?.val}%\n`;
        message += `      Over2.5: ${h.over25Pct}% | BTTS: ${h.bttsPct}% | Win: ${h.winPct}%\n`;
        message += `      HT/FT: ${h.topHtftCode || "-"} (${h.topHtftPct}%) | Gol R2: ${h.score2HPct}%\n`;
        message += `   ✈️ Deplasare (${a.totalMatches} meciuri)\n`;
        message += `      Pattern dominant: ${awaySignals?.label} ${awaySignals?.val}%\n`;
        message += `      Over2.5: ${a.over25Pct}% | BTTS: ${a.bttsPct}% | Win: ${a.winPct}%\n`;
        message += `      HT/FT: ${a.topHtftCode || "-"} (${a.topHtftPct}%) | Gol R2: ${a.score2HPct}%\n`;
      });
    } else {
      message += `\nNu s-au putut analiza echipele azi.\n`;
    }

    message += `\n${sep}\n`;
    message += `🧠 Nu forțăm pariuri. Focus: profit pe termen lung.`;

    // Chunking pentru Telegram (max 4096 chars)
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
