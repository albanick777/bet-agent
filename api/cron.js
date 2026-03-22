export default async function handler(req, res) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const tgRes = await fetch(`${baseUrl}/api/telegram`);
    const tgData = await tgRes.json();

    return res.status(200).json({
      status: "CRON OK",
      telegram: tgData
    });
  } catch (err) {
    return res.status(500).json({
      status: "CRON ERROR",
      message: err.message
    });
  }
}