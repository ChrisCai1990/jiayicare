const lifestyleTypes = new Set(['diet', 'exercise', 'sleep', 'smoking', 'alcohol', 'mood']);

function summarize(records = [], type, symptomTerm = '', incomplete = false, period = null) {
  if (type !== 'symptom' && !lifestyleTypes.has(type)) return null;
  const term = String(symptomTerm || '').trim().toLocaleLowerCase();
  const matched = records.filter(row => row.type === type && (type !== 'symptom' || !term
    || String(row.value || '').toLocaleLowerCase().includes(term)));
  const days = new Set(), counts = new Map();
  for (const row of matched) {
    const date = new Date(row.recordedAt);
    if (!Number.isNaN(date.getTime())) days.add(date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
    const value = String(row.value || '').trim();
    if (value && value.length <= 60) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([value, count]) => ({ value, count }));
  const latest = matched[matched.length - 1];
  const periodDays = period?.start && period?.end ? Math.round((Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86400000) + 1 : null;
  return { count: matched.length, days: days.size, periodDays, common,
    latest: latest ? { date: new Date(latest.recordedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
      value: String(latest.value || '').slice(0, 120), unit: String(latest.unit || '').slice(0, 20) } : null,
    incomplete, scope: type === 'symptom' ? (term ? 'keyword_candidate' : 'all_symptoms') : 'category',
  };
}

module.exports = { summarize, lifestyleTypes };
