import { buildEliteReport } from "../lib/buildReport.js";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    const lang = String(req.query.lang || "ro").toLowerCase();

    const data = await buildEliteReport(lang, apiKey);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      status: "ERROR",
      message: err.message
    });
  }
}
