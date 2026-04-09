export default async function handler(req, res) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // POST — salvează rezultatul
  if (req.method === "POST") {
    try {
      const { date, index, result } = req.body;

      if (!date || index === undefined || !result) {
        return res.status(400).json({ error: "Parametri lipsă" });
      }

      const monthKey = `picks_history_${date.slice(0, 7)}`;
      const historyRes = await fetch(`${kvUrl}/get/${monthKey}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      const historyData = await historyRes.json();

      if (!historyData?.result) {
        return res.status(404).json({ error: "Nu există picks pentru această dată" });
      }

      let history = [];
      try {
        const outer = JSON.parse(historyData.result);
        history = JSON.parse(typeof outer.value === "string" ? outer.value : "[]");
      } catch(e) {
        return res.status(500).json({ error: "Eroare parsare" });
      }

      let counter = 0;
      history = history.map(p => {
        if (p.date === date) {
          if (counter === parseInt(index)) {
            counter++;
            return { ...p, result };
          }
          counter++;
        }
        return p;
      });

      await fetch(`${kvUrl}/set/${monthKey}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${kvToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ value: JSON.stringify(history) })
      });

      return res.status(200).json({ success: true });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET — afișează pagina HTML
  const today = new Date().toISOString().slice(0, 10);

  // Fetch picks pentru azi
  let todayPicks = [];
  try {
    const monthKey = `picks_history_${today.slice(0, 7)}`;
    const historyRes = await fetch(`${kvUrl}/get/${monthKey}`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const historyData = await historyRes.json();
    if (historyData?.result) {
      const outer = JSON.parse(historyData.result);
      const history = JSON.parse(typeof outer.value === "string" ? outer.value : "[]");
      todayPicks = history.filter(p => p.date === today);
    }
  } catch(e) {}

  const picksHTML = todayPicks.length > 0
    ? todayPicks.map((p, i) => `
        <div class="pick ${p.result === 'win' ? 'win' : p.result === 'loss' ? 'loss' : ''}">
          <div class="pick-info">
            <span class="pick-num">${i + 1}</span>
            <div>
              <div class="pick-match">${p.match}</div>
              <div class="pick-market">${p.market} | ${p.confidence}%</div>
              <div class="pick-status">
                ${p.result === 'win' ? '✅ CÂȘTIGAT' : p.result === 'loss' ? '❌ PIERDUT' : '⏳ Fără rezultat'}
              </div>
            </div>
          </div>
          <div class="pick-buttons">
            <button onclick="setResult('${today}', ${i}, 'win')" class="btn-win">✅ WIN</button>
            <button onclick="setResult('${today}', ${i}, 'loss')" class="btn-loss">❌ LOSS</button>
          </div>
        </div>
      `).join("")
    : `<div class="no-picks">Nu există picks pentru azi (${today})</div>`;

  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BetAgent — Admin Rezultate</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f1a;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 24px;
      color: #f0c040;
      margin-bottom: 5px;
    }
    .header p {
      color: #888;
      font-size: 14px;
    }
    .date-selector {
      background: #1a1a2e;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .date-selector label {
      color: #888;
      font-size: 14px;
      white-space: nowrap;
    }
    .date-selector input {
      background: #0f0f1a;
      border: 1px solid #333;
      border-radius: 8px;
      color: #e0e0e0;
      padding: 8px 12px;
      font-size: 14px;
      flex: 1;
    }
    .date-selector button {
      background: #f0c040;
      color: #0f0f1a;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
    }
    .picks-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pick {
      background: #1a1a2e;
      border-radius: 12px;
      padding: 15px;
      border: 1px solid #333;
      transition: border-color 0.3s;
    }
    .pick.win { border-color: #2ecc71; }
    .pick.loss { border-color: #e74c3c; }
    .pick-info {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .pick-num {
      background: #f0c040;
      color: #0f0f1a;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      flex-shrink: 0;
    }
    .pick-match {
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .pick-market {
      font-size: 13px;
      color: #888;
      margin-bottom: 4px;
    }
    .pick-status {
      font-size: 13px;
      font-weight: bold;
    }
    .pick-buttons {
      display: flex;
      gap: 10px;
    }
    .btn-win, .btn-loss {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn-win {
      background: #2ecc71;
      color: white;
    }
    .btn-loss {
      background: #e74c3c;
      color: white;
    }
    .btn-win:hover, .btn-loss:hover { opacity: 0.85; }
    .no-picks {
      text-align: center;
      color: #888;
      padding: 30px;
      background: #1a1a2e;
      border-radius: 12px;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #2ecc71;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: bold;
      display: none;
      z-index: 100;
    }
    .toast.error { background: #e74c3c; }
    .section-title {
      font-size: 13px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏆 BetAgent Admin</h1>
    <p>Introduceți rezultatele picks-urilor</p>
  </div>

  <div class="date-selector">
    <label>📅 Data:</label>
    <input type="date" id="dateInput" value="${today}">
    <button onclick="loadDate()">Încarcă</button>
  </div>

  <p class="section-title">Picks de azi — ${today}</p>
  <div class="picks-container" id="picksContainer">
    ${picksHTML}
  </div>

  <div class="toast" id="toast"></div>

  <script>
    async function setResult(date, index, result) {
      try {
        const r = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, index, result })
        });
        const data = await r.json();
        if (data.success) {
          showToast(result === 'win' ? '✅ Salvat: WIN' : '❌ Salvat: LOSS', false);
          setTimeout(() => loadDate(), 800);
        } else {
          showToast('Eroare: ' + (data.error || 'necunoscută'), true);
        }
      } catch(e) {
        showToast('Eroare conexiune', true);
      }
    }

    async function loadDate() {
      const date = document.getElementById('dateInput').value;
      if (!date) return;

      try {
        const r = await fetch('/api/admin?date=' + date);
        const html = await r.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newPicks = doc.getElementById('picksContainer');
        if (newPicks) {
          document.getElementById('picksContainer').innerHTML = newPicks.innerHTML;
        }
        document.querySelector('.section-title').textContent = 'Picks — ' + date;
      } catch(e) {
        showToast('Eroare la încărcare', true);
      }
    }

    function showToast(msg, isError) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'toast' + (isError ? ' error' : '');
      toast.style.display = 'block';
      setTimeout(() => toast.style.display = 'none', 2500);
    }

    document.getElementById('dateInput').addEventListener('change', loadDate);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
