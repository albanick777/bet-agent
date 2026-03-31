// Fallback manual trigger — nu e folosit de Vercel crons direct
// Vercel apelează /api/telegram și /api/update direct

export default async function handler(req, res) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const hour = new Date().getUTCHours();

    // 08:00 UTC → raport principal
    // 13:00 sau 15:00 UTC → update
    let endpoint = "/api/update";
    if (hour >= 7 && hour <= 8) endpoint = "/api/telegram";

    const response = await fetch(`${baseUrl}${endpoint}`);
    const data = await response.json();

    return res.status(200).json({
      status: "CRON OK",
      endpoint,
      result: data
    });

  } catch (err) {
    return res.status(500).json({
      status: "CRON ERROR",
      message: err.message
    });
  }
}
