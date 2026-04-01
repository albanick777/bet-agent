// PATTERN WATCH
if (data.patternWatch && data.patternWatch.length) {
  message += `\n${sep}\n\n`;
  message += `🔬 PATTERN WATCH — JOACĂ AZI\n${sep}\n`;
  data.patternWatch.forEach(t => {
    const s = t.stats;
    const side = t.isHome ? "🏠 Acasă" : "✈️ Deplasare";
    message += `\n📍 ${t.name} (${t.country})\n`;
    message += `   ${side} vs ${t.opponent}\n`;
    message += `   🏆 ${t.league}\n`;
    message += `   🕒 ${t.kickoffLocal} local | ${t.kickoffUTC} UTC\n`;
    message += `   📊 Pattern dominant: ${t.topSignal?.label} ${t.topSignal?.val}%\n`;
    message += `   Over2.5: ${s.over25Pct}% | BTTS: ${s.bttsPct}% | Win: ${s.winPct}%\n`;
    message += `   HT/FT: ${s.topHtftCode||"-"} (${s.topHtftPct}%) | Gol R2: ${s.score2HPct}%\n`;
  });
  message += `\n${sep}\n\n`;
}
