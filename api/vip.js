let users = {}; // in memory (simplu pentru început)

export default async function handler(req, res) {
  const userId = req.query.user || "unknown";

  if (!users[userId]) {
    users[userId] = {
      start: Date.now(),
      vip: false
    };
  }

  const user = users[userId];

  const days = Math.floor((Date.now() - user.start) / (1000 * 60 * 60 * 24));

  // FREE period
  if (!user.vip && days < 7) {
    return res.json({
      access: "FREE",
      days_left: 7 - days,
      message: `Ai acces FREE. Zile rămase: ${7 - days}`
    });
  }

  // BLOCK după 7 zile
  if (!user.vip && days >= 7) {
    return res.json({
      access: "BLOCKED",
      message: "Acces expirat. Scrie VIP pentru upgrade."
    });
  }

  // VIP
  if (user.vip) {
    return res.json({
      access: "VIP",
      message: "Acces VIP activ"
    });
  }

  res.json({ error: "unknown state" });
}
