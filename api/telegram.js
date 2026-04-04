import { buildEliteReport } from "../lib/buildReport.js";
import { buildNBAReport } from "../lib/buildNBAReport.js";

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;

    if (!token || !chatId || !apiKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    const sep = "━━━━━━━━━━━━━━━━━━━━";

    // ── FOOTBALL ──────────────────────────────────────────────────────────
    const footballData = await buildEliteReport("ro", apiKey);
    const hasFootball = footballData.top5 && footballData.top5.length > 0;

    let message = "";

    if (hasFootball) {
      // ── MESAJ FOTBAL ────────────────────────────────────────────────────
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

      message += `🏆 TOP BET — EUROPEAN LEAGUES\n`;
      message += `${sep}\n`;
      message += `📅 ${footballData.date} | UTC: ${footballData.hourUTC}:00\n`;
      message += `📌 ${footballData.statusZi}\n`;
      message += `🔍 Meciuri analizate: ${footballData.totalMatches}\n`;
      message += `${sep}\n\n`;

      message += `🔥 TOP 5 PREDICȚII (≥80%)\n${sep}\n`;
      footballData.top5.forEach((p, i) => {
        message += `\n${formatPick(p, i)}\n`;
      });

      // Pattern Watch
      if (footballData.patternWatch && footballData.patternWatch.length) {
        message += `\n${sep}\n\n`;
        message += `🔬 PATTERN WATCH — JOACĂ AZI\n${sep}\n`;
        footballData.patternWatch.forEach(t => {
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
      }

    } else {
      // ── TRANZIȚIE MESAJ ─────────────────────────────────────────────────
      message += `🏆 TOP BET — DAILY PREDICTIONS\n`;
      message += `${sep}\n`;
      message += `📅 ${footballData.date} | UTC: ${footballData.hourUTC}:00\n`;
      message += `${sep}\n\n`;
      message += `⚽ No European football predictions ≥75% today.\n`;
      message += `🏀 Switching to NBA — Top predictions below.\n\n`;
      message += `${sep}\n\n`;

      // ── NBA FALLBACK ────────────────────────────────────────────────────
      try {
        const nbaData = await buildNBAReport(apiKey);

        if (nbaData.picks && nbaData.picks.length > 0) {
          message += `🏀 NBA TOP PICKS (≥75%)\n${sep}\n`;
          nbaData.picks.forEach((p, i) => {
            message += `\n${i + 1}. ${p.match}\n`;
            message += `   🕒 ${p.kickoffLocal} Georgia | ${p.kickoffUTC} UTC\n`;
            message += `   📊 ${p.market}\n`;
            message += `   🎯 Confidence: ${p.confidence}%\n`;
            message += `   ⚠️ Risc: ${p.risk}\n`;
          });
        } else {
          message += `🏀 NBA\n`;
          message += `No NBA predictions ≥75% today either.\n`;
          message += `📅 Next European football: check back tomorrow.\n`;
        }
      } catch (nbaErr) {
        message += `🏀 NBA data unavailable today.\n`;
        message += `📅 Check back tomorrow for European football.\n`;
      }
    }

    message += `\n${sep}\n`;
    message += `🧠 Nu forțăm pariuri. Focus: profit pe termen lung.`;

    // Chunking
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
        return res.status(500).json({ error: tgJson.description });
      }
    }

    return res.status(200).json({
      success: true,
      sport: hasFootball ? "football" : "nba",
      chunks: chunks.length,
      picks: hasFootball ? footballData.top5?.length : 0
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
