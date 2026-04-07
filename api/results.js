export default async function handler(req, res) {
  try {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      return res.status(500).json({ error: "Missing KV env vars" });
    }

    // Parametri: ?date=2026-04-07&index=0&result=win
    // index = pozitia pick-ului in lista (0,1,2...)
    // result = win sau loss
    const { date, index, result } = req.query;

    if (!date || index === undefined || !result) {
      return res.status(400).json({ 
        error: "Parametri necesari: date, index, result (win/loss)" 
      });
    }

    if (!["win","loss"].includes(result)) {
      return res.status(400).json({ error: "result trebuie sa fie win sau loss" });
    }

    const monthKey = `picks_history_${date.slice(0, 7)}`;

    // Citire istoric lunar
    const historyRes = await fetch(`${kvUrl}/get/${monthKey}`, {
      headers: { Authorization: `Bearer ${kvToken}` }
    });
    const historyData = await historyRes.json();

    if (!historyData?.result) {
      return res.status(404).json({ error: "Nu există picks pentru această lună" });
    }

    let history = [];
    try {
      const outer = JSON.parse(historyData.result);
      history = JSON.parse(typeof outer.value === "string" ? outer.value : "[]");
    } catch(e) {
      return res.status(500).json({ error: "Eroare parsare istoric" });
    }

    // Găsește pick-ul din ziua respectivă
    const dayPicks = history.filter(p => p.date === date);
    const pickIndex = parseInt(index);

    if (pickIndex >= dayPicks.length) {
      return res.status(404).json({ 
        error: `Pick index ${pickIndex} nu există pentru ${date}`,
        availablePicks: dayPicks.length,
        picks: dayPicks
      });
    }

    // Actualizează rezultatul
    let updateCount = 0;
    history = history.map(p => {
      if (p.date === date) {
        const dayPicksLocal = history.filter(x => x.date === date);
        const thisIndex = dayPicksLocal.indexOf(p);
        if (thisIndex === pickIndex) {
          updateCount++;
          return { ...p, result };
        }
      }
      return p;
    });

    // Fix — actualizare corectă bazată pe ordine
    let counter = 0;
    history = history.map(p => {
      if (p.date === date) {
        if (counter === pickIndex) {
          counter++;
          return { ...p, result };
        }
        counter++;
      }
      return p;
    });

    // Salvează înapoi în KV
    await fetch(`${kvUrl}/set/${monthKey}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ value: JSON.stringify(history) })
    });

    const updatedPick = history.filter(p => p.date === date)[pickIndex];

    return res.status(200).json({
      success: true,
      updated: updatedPick,
      message: `Pick ${pickIndex} din ${date} marcat ca ${result}`
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
