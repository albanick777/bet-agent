// Trimite raportul principal la 12:00 Georgia (08:00 UTC)
// Anti-dublare: verifică ora înainte să trimită

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!token || !chatId || !apiKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    // ── Anti-dublare: acceptăm doar dacă ora UTC e între 07:45 și 08:15
    // (cron e la 08:00 UTC = 12:00 Georgia)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    const totalMin = utcHour * 60 + utcMin;
    const windowStart = 7 * 60 + 45;  // 07:45 UTC
    const windowEnd = 8 * 60 + 15;    // 08:15 UTC

    if (req.method === "GET" && req.headers["x-vercel-cron"] !== "1") {
      // Apel manual — permitem întotdeauna (pentru testare)
    } else if (totalMin < windowStart || totalMin > windowEnd) {
      return res.status(200).json({
        skipped: true,
        reason: `Outside send window. UTC: ${utcHour}:${String(utcMin).padStart(2, "0")}`
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

    function buildSection(title, picks, limit) {
      const list = Array.isArray(picks) ? picks.slice(0, limit) : [];
      if (!list.length) return `${title}\n  —\n`;
      return `${title}\n${list.map(formatPick).join("\n\n")}\n`;
    }

    const sep = "━━━━━━━━━━━━━━━━━━━━";

    let message = "";
    message += `⚽ ELITE BET AGENT\n`;
    message += `${sep}\n`;
    message += `📅 Data: ${data.date}\n`;
    message += `📌 Ziua: ${data.statusZi}\n`;
    message += `🔍 Meciuri analizate: ${data.totalMatches}\n`;
    message += `📦 Picks generate: ${data.totalPicks}\n`;
    message += `${sep}\n\n`;

    // TOP 1
    message += `🏅 PICK PREMIUM\n`;
    message += data.top1 ? formatPick(data.top1) : "  —";
    message += `\n\n${sep}\n\n`;

    // TOP 3
    if (data.top3 && data.top3.length >= 2) {
      message += buildSection(`🥇 TOP 3 PICKS`, data.top3, 3);
      message += `${sep}\n\n`;
    }

    // TOP 5
    if (data.top5 && data.top5.length >= 4) {
      message += buildSection(`🔥 TOP 5 PICKS`, data.top5, 5);
      message += `${sep}\n\n`;
    }

    // SAFE
    if (data.safePicks && data.safePicks.length) {
      message += buildSection(`🟢 SAFE PICKS`, data.safePicks, 5);
      message += `${sep}\n\n`;
    }

    // VALUE
    if (data.valuePicks && data.valuePicks.length) {
      message += buildSection(`💎 VALUE PICKS`, data.valuePicks, 5);
      message += `${sep}\n\n`;
    }

    // HTFT
    if (data.htftPicks && data.htftPicks.length) {
      message += buildSection(`🔵 HT/FT PICKS`, data.htftPicks, 5);
      message += `${sep}\n\n`;
    }

    // TIMING
    if (data.timingPicks && data.timingPicks.length) {
      message += buildSection(`⏱ TIMING PICKS`, data.timingPicks, 5);
      message += `${sep}\n\n`;
    }

    // MECIURI URMĂRITE
    message += `👀 MECIURI URMĂRITE\n`;
    if (Array.isArray(data.trackedTeams) && data.trackedTeams.length) {
      data.trackedTeams.slice(0, 8).forEach(t => {
        message += `  • ${t.home} vs ${t.away} | ${t.league} | 🕒 ${t.kickoff}\n`;
      });
    } else {
      message += `  —\n`;
    }

    message += `\n${sep}\n`;
   // PATTERN WATCH
if (Array.isArray(data.patternWatch) && data.patternWatch.length) {
  message += `${sep}\n\n`;
  message += `🔬 PATTERN WATCH — TOP 10 ECHIPE\n`;
  message += `${sep}\n`;
  data.patternWatch.forEach((t, i) => {
    message += `\n${i + 1}. ${t.name}\n`;
    message += `  🏠 Acasă (${t.home.matches} meciuri)\n`;
    message += `     Win: ${t.home.winPct}% | O2.5: ${t.home.over25Pct}% | BTTS: ${t.home.bttsPct}%\n`;
    message += `     HT/FT: ${t.home.topHtft || "-"} (${t.home.topHtftPct}%) | Gol R2: ${t.home.goalR2Pct}%\n`;
    message += `  ✈️ Deplasare (${t.away.matches} meciuri)\n`;
    message += `     Win: ${t.away.winPct}% | O2.5: ${t.away.over25Pct}% | BTTS: ${t.away.bttsPct}%\n`;
    message += `     HT/FT: ${t.away.topHtft || "-"} (${t.away.topHtftPct}%) | Gol R2: ${t.away.goalR2Pct}%\n`;
  });
  message += `\n${sep}\n\n`;
} 
    message += `🧠 Nu forțăm pariuri. Focus: profit pe termen lung.`;

    // Telegram max 4096 chars
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
        return res.status(500).json({
          error: tgJson.description || "Telegram send failed",
          telegram_response: tgJson
        });
      }
    }

    return res.status(200).json({ success: true, chunks: chunks.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Import local
import { buildEliteReport } from "../lib/buildReport.js";
