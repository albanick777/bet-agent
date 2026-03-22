import { buildEliteReport } from "../lib/buildReport.js";

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiKey = process.env.API_FOOTBALL_KEY;

    const data = await buildEliteReport("ro", apiKey);

    const top1 = data.top1
      ? `✔️ Confirmat:\n• ${data.top1.match}\n${data.top1.market} | ${data.top1.confidence}% | ${data.top1.risk}`
      : "✔️ Confirmat:\n-";

    const newPick =
      Array.isArray(data.valuePicks) && data.valuePicks.length
        ? `🔥 Nou:\n• ${data.valuePicks[0].match}\n${data.valuePicks[0].market} | ${data.valuePicks[0].confidence}% | ${data.valuePicks[0].risk}`
        : "🔥 Nou:\n-";

    const avoidPick =
      Array.isArray(data.htftPicks) && data.htftPicks.length
        ? `⚠️ Evită:\n• Pariurile agresive azi rămân sensibile.\nEx: ${data.htftPicks[0].match}`
        : "⚠️ Evită:\n• Nu forța pariuri slabe.";

    const message = `🔄 ELITE UPDATE

📊 Reevaluare după ultimele informații:

━━━━━━━━━━━━━━━

${top1}

${avoidPick}

${newPick}

━━━━━━━━━━━━━━━

🧠 Nu forțăm pariuri.
💰 Focus: profit pe termen lung.`;

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

    return res.status(200).json({ success: true, telegram: tgJson.result?.message_id || true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
