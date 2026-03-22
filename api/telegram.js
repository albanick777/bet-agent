export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"
      });
    }

    const message =
      "TEST TELEGRAM OK\n\n" +
      "Botul este conectat.\n" +
      "Chat ID este bun.\n" +
      "Urmatorul pas: legam motorul matches direct, fara fetch intern.";

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

    return res.status(200).json({
      success: true,
      telegram: tgJson.result?.message_id || true
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
