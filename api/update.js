export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    const message = `🔄 ELITE UPDATE

📊 Reevaluare după ultimele informații:

━━━━━━━━━━━━━━━

✔️ Confirmate:
(în lucru)

⚠️ Evită:
(în lucru)

🔥 Nou:
(în lucru)

━━━━━━━━━━━━━━━

🧠 Nu forțăm pariuri.
💰 Focus: profit pe termen lung.`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
