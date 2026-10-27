const META = { bloodPressure: ['血压', 'mmHg'], bloodSugar: ['血糖', 'mmol/L'], heartRate: ['心率', 'bpm'], weight: ['体重', 'kg'] };
function number(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function bp(record) {
  const parts = String(record.value ?? '').split('/');
  return [number(record.extra?.sys ?? parts[0]), number(record.extra?.dia ?? parts[1])];
}
const difference = (last, first) => last === null || first === null ? null : Number((last - first).toFixed(2));
const signed = n => n === null ? null : `${n >= 0 ? '+' : ''}${n}`;
function summarizeHealthRecords(records) {
  const grouped = new Map();
  for (const row of records) {
    if (!META[row.type]) continue;
    if (!grouped.has(row.type)) grouped.set(row.type, []);
    grouped.get(row.type).push(row);
  }
  const metrics = [];
  for (const [type, rows] of grouped) {
    const sorted = [...rows].sort((a,b) => new Date(a.recordedAt) - new Date(b.recordedAt));
    const first = sorted[0], last = sorted[sorted.length - 1];
    let value = String(last.value ?? '--'), delta = null, change = null;
    if (type === 'bloodPressure') {
      const [firstSys, firstDia] = bp(first), [lastSys, lastDia] = bp(last);
      if (lastSys !== null) value = lastDia === null ? String(lastSys) : `${lastSys}/${lastDia}`;
      change = difference(lastSys, firstSys);
      const diaChange = difference(lastDia, firstDia);
      delta = change === null ? null : diaChange === null ? signed(change) : `${signed(change)}/${signed(diaChange)}`;
    } else { change = difference(number(last.value), number(first.value)); delta = signed(change); }
    metrics.push({ type, label: META[type][0], unit: META[type][1], value, delta,
      trend: change === null ? null : change < 0 ? 'down' : change > 0 ? 'up' : 'stable', count: rows.length });
  }
  // No risk classification, medical recommendation, health score or random score delta.
  return { recordCount: records.length, metrics };
}
// Old shared snapshots may still contain obsolete scoring/recommendation fields.
// Only return the record-summary contract; the stored original is not modified.
function recordSummaryView(report = {}) {
  const fields = ['period','periodLabel','dateRange','recordCount','taskCompletion'];
  const result = Object.fromEntries(fields.filter(key => report[key] !== undefined).map(key => [key, report[key]]));
  result.metrics = (Array.isArray(report.metrics) ? report.metrics : []).map(row => Object.fromEntries(
    ['type','label','unit','value','delta','trend','count'].filter(key => row[key] !== undefined).map(key => [key,row[key]])));
  return result;
}
module.exports = { summarizeHealthRecords, recordSummaryView };
