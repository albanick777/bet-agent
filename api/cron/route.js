export async function GET() {
  await fetch("https://bet-agent-eosin.vercel.app/api/telegram");
  return new Response("OK");
}
// force deploy
