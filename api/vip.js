// NOTE: users în memorie se resetează la fiecare cold start Vercel.
// Pentru producție reală → migrează la KV store (Vercel KV / Upstash Redis).
// Deocamdată păstrăm logica simplă dar adăugăm header anti-cache.

const users = {};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const userId = String(req.query.user || "unknown");

  if (!users[userId]) {
    users[userId] = {
      start: Date.now(),
      vip: false
    };
  }

  const user = users[userId];
  const days = Math.floor((Date.now() - user.start) / (1000 * 60 * 60 * 24));

  if (user.vip) {
    return res.json({ access: "VIP", message: "Acces VIP activ" });
  }

  if (days < 7) {
    return res.json({
      access: "FREE",
      days_left: 7 - days,
      message: `Acces FREE. Zile rămase: ${7 - days}`
    });
  }

  return res.json({
    access: "BLOCKED",
    message: "Acces expirat. Scrie /vip pentru upgrade."
  });
}
