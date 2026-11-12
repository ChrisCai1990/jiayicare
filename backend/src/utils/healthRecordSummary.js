const META = { bloodPressure: ['血压', 'mmHg'], bloodSugar: ['血糖', 'mmol/L'], heartRate: ['心率', '次/分'], weight: ['体重', 'kg'], sleep: ['睡眠', '小时'], waist: ['腰围', 'cm'] };
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
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未记录' : `${date.getMonth() + 1}月${date.getDate()}日`;
};
const changeLabel = (value, unit) => value === 0 ? '持平' : `${value > 0 ? '上升' : '下降'} ${Math.abs(value)} ${unit}`;
const arm = row => /^(左臂|右臂)$/.test(row?.extra?.arm || '') ? row.extra.arm : null;
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
    const valid = sorted.filter(row => type === 'bloodPressure' ? bp(row).some(value => value !== null) : number(row.value) !== null);
    const first = valid[0] || sorted[0], last = valid[valid.length - 1] || sorted[sorted.length - 1];
    let value = String(last.value ?? '--'), delta = null, change = null;
    let changeText = valid.length ? '本期只有 1 次可比较记录，暂无法计算变化。' : '本期记录缺少可比较的数值。';
    if (type === 'bloodPressure') {
      const [firstSys, firstDia] = bp(first), [lastSys, lastDia] = bp(last);
      if (lastSys !== null) value = lastDia === null ? String(lastSys) : `${lastSys}/${lastDia}`;
      if (valid.length > 1 && arm(first) && arm(last) && arm(first) !== arm(last)) {
        changeText = '首末记录的测量手臂不同，暂不比较血压变化。';
      } else if (valid.length > 1) {
        change = difference(lastSys, firstSys);
        const diaChange = difference(lastDia, firstDia);
        delta = change === null ? null : diaChange === null ? signed(change) : `${signed(change)}/${signed(diaChange)}`;
        const changes = [change === null ? null : `收缩压${changeLabel(change, 'mmHg')}`, diaChange === null ? null : `舒张压${changeLabel(diaChange, 'mmHg')}`].filter(Boolean);
        changeText = changes.length ? `${dateLabel(first.recordedAt)}至${dateLabel(last.recordedAt)}：${changes.join('，')}。` : '首末记录缺少可比较的血压数值。';
      }
    } else if (valid.length > 1) {
      change = difference(number(last.value), number(first.value));
      delta = signed(change);
      changeText = `${dateLabel(first.recordedAt)}至${dateLabel(last.recordedAt)}：${META[type][0]}${changeLabel(change, META[type][1])}。`;
    }
    metrics.push({ type, label: META[type][0], unit: META[type][1], value, delta, changeText,
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
    ['type','label','unit','value','delta','changeText','trend','count'].filter(key => row[key] !== undefined).map(key => [key,row[key]])));
  return result;
}
module.exports = { summarizeHealthRecords, recordSummaryView };
