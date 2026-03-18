export default async function handler(req, res) {
  await fetch("https://bet-agent-eosin.vercel.app/api/telegram");
  res.status(200).send("OK");
}

//update
