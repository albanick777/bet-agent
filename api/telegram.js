import { buildEliteReport } from "../lib/buildReport.js";
import { buildNBAReport } from "../lib/buildNBAReport.js";
import { getPatternPicks } from "../lib/patternHtft.js";

let lastSentDate = null;

export default async function handler(req, res) {
  const todayDate = new Date().toISOString().slice(0, 10);


if (lastSentDate === todayDate) {
    return res.status(200).json({ status: "ALREADY_SENT", date: todayDate });
  }

  lastSentDate = todayDate;

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!token || !chatId || !apiKey) {
      return res.status(500).json({ error: "Missing env vars" });
    }

    const sep = "━━━━━━━━━━━━━━━━━━━━";
    const footballData = await buildEliteReport("ro", apiKey);
    const hasFootball = footballData.top5 && footballData.top5.length > 0;

    let message = "";

    if (hasFootball) {
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

      // ── ACUMULATOR ──────────────────────────────────────────────────────
      const acc = footballData.accumulatorSuggestion;
      if (acc && acc.picks.length >= 2) {
        message += `\n${sep}\n\n`;
        message += `🎰 ACUMULATOR SUGERAT\n${sep}\n`;
        message += `⚠️ Alegerea dvs — analizați înainte de a paria!\n\n`;
        acc.picks.forEach((p, i) => {
          message += `${i + 1}. ${p.match}\n`;
          message += `   📊 ${p.market} | 🎯 ${p.confidence}%\n`;
        });
        message += `\n📊 Probabilitate combinată: ${acc.combinedPct}%\n`;
        message += `💰 Cotă estimată: ${acc.estimatedOdds}x\n`;
        message += `\n💡 Cu cât mai puține selecții, cu atât mai sigur.\n`;
      }

      // ── PATTERN WATCH ────────────────────────────────────────────────────
      if (footballData.patternWatch && footballData.patternWatch.length) {
        message += `\n${sep}\n\n`;
        message += `🔬 PATTERN WATCH — JOACĂ AZI\n${sep}\n`;
        footballData.patternWatch.forEach(t => {
          const s = t.stats;
          const side = t.isHome ? "🏠 Acasă" : "✈️ Deplasare";
          let concluzie = "";
          const outsider = t.isHome ? t.opponent : t.name;
          if (s.winPct <= 20 && s.topHtftCode?.includes("L")) {
            concluzie = `Formă slabă. ${outsider} favorit. Pariu logic: ${t.isHome ? "X2" : "1X"} + Under 3.5`;
          } else if (s.winPct >= 60 && s.over25Pct >= 60) {
            concluzie = `Formă bună + atac activ. Pariu logic: ${t.isHome ? "1X" : "X2"} + Over 2.5`;
          } else if (s.bttsPct >= 60 && s.over25Pct >= 55) {
            concluzie = `Ambele echipe marchează frecvent. Pariu logic: BTTS + Over 2.5`;
          } else if (s.under35Pct >= 65 && s.bttsPct <= 35) {
            concluzie = `Meciuri închise, puține goluri. Pariu logic: Under 2.5`;
          } else if (s.over25Pct >= 65) {
            concluzie = `Meciuri cu multe goluri. Pariu logic: Over 2.5`;
          } else {
            concluzie = `Pattern neconcludent. Evită pariul pe acest meci.`;
          }
          message += `\n📍 ${t.name} (${t.country})\n`;
          message += `   ${side} vs ${t.opponent}\n`;
          message += `   🏆 ${t.league}\n`;
          message += `   🕒 ${t.kickoffLocal} local | ${t.kickoffUTC} UTC\n`;
          message += `   📊 Pattern dominant: ${t.topSignal?.label} ${t.topSignal?.val}%\n`;
          message += `   Over2.5: ${s.over25Pct}% | BTTS: ${s.bttsPct}% | Win: ${s.winPct}%\n`;
          message += `   HT/FT: ${s.topHtftCode||"-"} (${s.topHtftPct}%) | Gol R2: ${s.score2HPct}%\n`;
          message += `   💡 ${concluzie}\n`;
        });
      }

    } else {
      message += `🏆 TOP BET — DAILY PREDICTIONS\n`;
      message += `${sep}\n`;
      message += `📅 ${footballData.date} | UTC: ${footballData.hourUTC}:00\n`;
      message += `${sep}\n\n`;
      message += `⚽ No European football predictions ≥80% today.\n`;
      message += `🏀 Switching to NBA — Top predictions below.\n\n`;
      message += `${sep}\n\n`;

      try {
        const nbaData = await buildNBAReport(apiKey);
        if (nbaData.picks && nbaData.picks.length > 0) {
          message += `🏀 NBA TOP PICKS (≥80%)\n${sep}\n`;
          nbaData.picks.forEach((p, i) => {
            message += `\n${i + 1}. ${p.match}\n`;
            message += `   🕒 ${p.kickoffLocal} Georgia | ${p.kickoffUTC} UTC\n`;
            message += `   📊 ${p.market}\n`;
            message += `   🎯 Confidence: ${p.confidence}%\n`;
            message += `   ⚠️ Risc: ${p.risk}\n`;
          });
        } else {
          message += `🏀 NBA\nNo NBA predictions ≥80% today either.\n`;
          message += `📅 Next European football: check back tomorrow.\n`;
        }
      } catch(nbaErr) {
        message += `🏀 NBA data unavailable today.\n`;
        message += `📅 Check back tomorrow for European football.\n`;
      }
    }

    // ── PATTERN HT/FT ────────────────────────────────────────────────────
    try {
      if (kvUrl && kvToken) {
        const patternPicks = await getPatternPicks(apiKey, kvUrl, kvToken);
        if (patternPicks && patternPicks.length > 0) {
          message += `\n${sep}\n\n`;
          message += `🔁 PATTERN HT/FT — PICKS AZI\n${sep}\n`;
          patternPicks.forEach((t, i) => {
            message += `\n${i + 1}. ${t.match}\n`;
            message += `   📍 ${t.teamName} | ${t.side}\n`;
            message += `   🏆 ${t.league} | ${t.country}\n`;
            message += `   🕒 ${t.kickoffLocal} local | ${t.kickoffUTC} UTC\n`;
            message += `   🔁 Pattern: ${t.pattern} — ${t.patternPct}% (${t.patternCount}/${t.totalMatches})\n`;
            message += `   💡 ${t.explanation}\n`;
            message += `   🎯 Pariu HT/FT recomandat: ${t.betCode}\n`;
          });
          message += `\n⚠️ Alegerea finală vă aparține.\n`;
        }
      }
    } catch(patternErr) {
      console.error("Pattern HT/FT error:", patternErr.message);
    }

    // ── TRACKING PICKS ────────────────────────────────────────────────────
    if (kvUrl && kvToken && hasFootball && footballData.top5?.length > 0) {
      try {
        const picksToSave = footballData.top5.map(p => ({
          match: p.match,
          market: p.market,
          confidence: p.confidence,
          kickoffUTC: p.kickoffUTC,
          league: p.league,
          date: todayDate,
          result: null
        }));

        await fetch(`${kvUrl}/set/daily_picks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${kvToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ value: JSON.stringify(picksToSave), ex: 86400 })
        });

        // Istoric lunar
        const monthKey = `picks_history_${todayDate.slice(0, 7)}`;
        const historyRes = await fetch(`${kvUrl}/get/${monthKey}`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        const historyData = await historyRes.json();
        let history = [];
        if (historyData?.result) {
          try {
            const outer = JSON.parse(historyData.result);
            history = JSON.parse(typeof outer.value === "string" ? outer.value : "[]");
          } catch(e) {}
        }
        history.push(...picksToSave);
        await fetch(`${kvUrl}/set/${monthKey}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${kvToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ value: JSON.stringify(history) })
        });
      } catch(kvErr) {
        console.error("KV save error:", kvErr.message);
      }
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
        return res.status(500).json({ error: tgJson.description });
      }
    }

    return res.status(200).json({
      success: true,
      sport: hasFootball ? "football" : "nba",
      chunks: chunks.length,
      picks: hasFootball ? footballData.top5?.length : 0
    });

  } catch(err) {
    lastSentDate = null;
    return res.status(500).json({ error: err.message });
  }
}
